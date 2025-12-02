import type { Env, RAGContext, RAGChunk, ContentType, IntentClassification } from '../types';
import { planRetrieval, type RetrievalPlan, type DedupeMode } from './retrieval-planner';

/**
 * RAG Configuration
 */
interface RAGConfig {
  topK: number;
  relevanceThreshold: number;
  maxContextChunks: number;
  maxContextTokens: number;
  diversityPenalty: number;
  freshnessWeight: number;
}

const DEFAULT_CONFIG: RAGConfig = {
  topK: 10,
  relevanceThreshold: 0.7,
  maxContextChunks: 5,
  maxContextTokens: 2500,
  diversityPenalty: 0.1,
  freshnessWeight: 0.1,
};

/**
 * Smart retrieval using the retrieval planner
 * Analyzes the query to determine optimal retrieval strategy
 */
export async function smartRetrieve(
  query: string,
  intent: IntentClassification,
  env: Env
): Promise<RAGContext> {
  const plan = planRetrieval(query, intent);

  console.log('Retrieval plan:', {
    query,
    strategy: plan.strategy,
    topK: plan.topK,
    filters: plan.filters,
    dedupeMode: plan.dedupeMode,
    maxResults: plan.maxResults,
    boostTerms: plan.boostTerms,
    reasoning: plan.reasoning,
  });

  // Generate embedding for the semantic query
  const queryEmbedding = await generateQueryEmbedding(plan.semanticQuery, env);

  // Build filter for metadata
  const filter = buildMetadataFilter({
    contentTypes: plan.filters.contentTypes,
    productCategory: plan.filters.productCategory,
    recipeCategory: plan.filters.recipeCategory,
  });

  // Query Vectorize with plan parameters (no filter - relying on semantic search)
  const results = await env.VECTORIZE.query(queryEmbedding, {
    topK: plan.topK,
    filter,  // Currently returns undefined - see buildMetadataFilter
    returnMetadata: 'all',
  });

  // Process results with plan's relevance threshold
  let chunks = processResultsWithThreshold(results, plan.relevanceThreshold);

  // Apply boost terms if present (for ingredient queries)
  if (plan.boostTerms && plan.boostTerms.length > 0) {
    chunks = boostByTerms(chunks, plan.boostTerms);
  }

  // Dedupe based on strategy
  const dedupedChunks = deduplicateByMode(chunks, plan.dedupeMode);

  // Limit to max results
  const limitedChunks = dedupedChunks.slice(0, plan.maxResults);

  console.log('Retrieval results:', {
    rawResults: results.matches.length,
    afterThreshold: chunks.length,
    afterDedupe: dedupedChunks.length,
    final: limitedChunks.length,
  });

  // Debug: Log first chunk's raw metadata to see what's actually indexed
  if (results.matches.length > 0) {
    console.log('Sample raw metadata from Vectorize:', results.matches[0].metadata);
  }

  return assembleContext(limitedChunks);
}

/**
 * Process results with custom threshold
 */
function processResultsWithThreshold(
  results: VectorizeMatches,
  threshold: number
): RAGChunk[] {
  return results.matches
    .filter((match) => match.score >= threshold)
    .map((match) => ({
      id: match.id,
      score: match.score,
      text: (match.metadata as any)?.chunk_text || '',
      metadata: {
        content_type: (match.metadata as any)?.content_type || 'editorial',
        source_url: (match.metadata as any)?.source_url || '',
        page_title: (match.metadata as any)?.page_title || '',
        product_sku: (match.metadata as any)?.product_sku,
        product_category: (match.metadata as any)?.product_category,
        recipe_category: (match.metadata as any)?.recipe_category,
        image_url: (match.metadata as any)?.image_url,
      },
    }));
}

/**
 * Boost chunks that contain specified terms
 * Used for ingredient-based recipe searches
 */
function boostByTerms(chunks: RAGChunk[], terms: string[]): RAGChunk[] {
  return chunks
    .map((chunk) => {
      const text = chunk.text.toLowerCase();
      const matchCount = terms.filter((t) =>
        text.includes(t.toLowerCase())
      ).length;
      // 15% boost per matched term, max 60% boost
      const boost = 1 + Math.min(matchCount * 0.15, 0.6);
      return { ...chunk, score: chunk.score * boost };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Deduplicate chunks based on the specified mode
 */
function deduplicateByMode(chunks: RAGChunk[], mode: DedupeMode): RAGChunk[] {
  if (mode === 'by-sku') {
    // Keep one chunk per product SKU (for catalog/comparison queries)
    const bySku = new Map<string, RAGChunk>();
    for (const chunk of chunks) {
      const key = chunk.metadata.product_sku || chunk.metadata.source_url;
      if (!bySku.has(key) || chunk.score > bySku.get(key)!.score) {
        bySku.set(key, chunk);
      }
    }
    return [...bySku.values()].sort((a, b) => b.score - a.score);
  }

  if (mode === 'by-url') {
    // Keep one chunk per source URL (for recipe queries)
    const byUrl = new Map<string, RAGChunk>();
    for (const chunk of chunks) {
      const key = chunk.metadata.source_url;
      if (!byUrl.has(key) || chunk.score > byUrl.get(key)!.score) {
        byUrl.set(key, chunk);
      }
    }
    return [...byUrl.values()].sort((a, b) => b.score - a.score);
  }

  // Default: similarity-based dedup
  return deduplicateChunks(chunks, DEFAULT_CONFIG.diversityPenalty);
}

/**
 * Retrieve relevant context from Vectorize for a query
 */
export async function retrieveContext(
  query: string,
  env: Env,
  options?: {
    contentTypes?: ContentType[];
    productCategory?: string;
    recipeCategory?: string;
  }
): Promise<RAGContext> {
  const config = DEFAULT_CONFIG;

  // Generate embedding for the query
  const queryEmbedding = await generateQueryEmbedding(query, env);

  // Build filter for metadata
  const filter = buildMetadataFilter(options);

  // Query Vectorize
  const results = await env.VECTORIZE.query(queryEmbedding, {
    topK: config.topK,
    filter,
    returnMetadata: 'all',
  });

  // Process and filter results
  const chunks = processResults(results, config);

  // Deduplicate similar chunks
  const dedupedChunks = deduplicateChunks(chunks, config.diversityPenalty);

  // Limit to max context
  const limitedChunks = limitContext(dedupedChunks, config);

  // Assemble context
  return assembleContext(limitedChunks);
}

/**
 * Generate embedding for query using Workers AI
 */
async function generateQueryEmbedding(query: string, env: Env): Promise<number[]> {
  const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [query],
  }) as { data: number[][] };

  return result.data[0];
}

/**
 * Build metadata filter for Vectorize query
 *
 * NOTE: Metadata filtering is currently DISABLED because the indexed data
 * doesn't have reliable metadata fields. We rely on semantic search instead.
 * The retrieval planner includes content type keywords in the semantic query.
 */
function buildMetadataFilter(_options?: {
  contentTypes?: ContentType[];
  productCategory?: string;
  recipeCategory?: string;
}): Record<string, any> | undefined {
  // DISABLED: Vectorize filter not matching indexed metadata
  // Return undefined to skip filtering and rely on semantic search
  return undefined;

  // Original filter code (kept for future use when metadata is fixed):
  /*
  if (!options) return undefined;

  const filters: Record<string, any> = {};

  if (options.contentTypes && options.contentTypes.length > 0) {
    // Vectorize filter syntax
    filters.content_type = { $in: options.contentTypes };
  }

  if (options.productCategory) {
    filters.product_category = { $eq: options.productCategory };
  }

  if (options.recipeCategory) {
    filters.recipe_category = { $eq: options.recipeCategory };
  }

  return Object.keys(filters).length > 0 ? filters : undefined;
  */
}

/**
 * Process raw Vectorize results into RAG chunks
 */
function processResults(
  results: VectorizeMatches,
  config: RAGConfig
): RAGChunk[] {
  return results.matches
    .filter(match => match.score >= config.relevanceThreshold)
    .map(match => ({
      id: match.id,
      score: match.score,
      text: (match.metadata as any)?.chunk_text || '',
      metadata: {
        content_type: (match.metadata as any)?.content_type || 'editorial',
        source_url: (match.metadata as any)?.source_url || '',
        page_title: (match.metadata as any)?.page_title || '',
        product_sku: (match.metadata as any)?.product_sku,
        product_category: (match.metadata as any)?.product_category,
        recipe_category: (match.metadata as any)?.recipe_category,
        image_url: (match.metadata as any)?.image_url,
      },
    }));
}

/**
 * Deduplicate chunks that are too similar
 */
function deduplicateChunks(chunks: RAGChunk[], penalty: number): RAGChunk[] {
  if (chunks.length <= 1) return chunks;

  const selected: RAGChunk[] = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    let isDuplicate = false;

    for (const selectedChunk of selected) {
      const similarity = textSimilarity(chunk.text, selectedChunk.text);
      if (similarity > 0.8) {
        isDuplicate = true;
        break;
      }

      // Also check if from same source URL
      if (chunk.metadata.source_url === selectedChunk.metadata.source_url) {
        // Apply penalty but don't exclude
        chunk.score *= (1 - penalty);
      }
    }

    if (!isDuplicate) {
      selected.push(chunk);
    }
  }

  // Re-sort by adjusted score
  return selected.sort((a, b) => b.score - a.score);
}

/**
 * Simple text similarity using Jaccard index
 */
function textSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Limit chunks to fit within context token budget
 */
function limitContext(chunks: RAGChunk[], config: RAGConfig): RAGChunk[] {
  const limited: RAGChunk[] = [];
  let totalTokens = 0;

  for (const chunk of chunks) {
    const chunkTokens = estimateTokens(chunk.text);

    if (totalTokens + chunkTokens > config.maxContextTokens) {
      break;
    }

    if (limited.length >= config.maxContextChunks) {
      break;
    }

    limited.push(chunk);
    totalTokens += chunkTokens;
  }

  return limited;
}

/**
 * Estimate token count (rough: ~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Assemble final RAG context
 */
function assembleContext(chunks: RAGChunk[]): RAGContext {
  const sourceUrls = [...new Set(chunks.map(c => c.metadata.source_url))];

  return {
    chunks,
    totalRelevance: chunks.reduce((sum, c) => sum + c.score, 0) / Math.max(chunks.length, 1),
    hasProductInfo: chunks.some(c => c.metadata.content_type === 'product'),
    hasRecipes: chunks.some(c => c.metadata.content_type === 'recipe'),
    sourceUrls,
  };
}

/**
 * Expand query with synonyms and related terms
 */
export function expandQuery(query: string): string {
  // Add common Vitamix-related term expansions
  const expansions: Record<string, string[]> = {
    blender: ['blenders', 'vitamix', 'mixer'],
    smoothie: ['smoothies', 'shake', 'blend', 'drink'],
    soup: ['soups', 'hot soup', 'blended soup'],
    recipe: ['recipes', 'how to make', 'instructions'],
    clean: ['cleaning', 'wash', 'maintenance'],
    noise: ['noisy', 'loud', 'sound', 'grinding'],
  };

  let expandedQuery = query;

  for (const [term, synonyms] of Object.entries(expansions)) {
    if (query.toLowerCase().includes(term)) {
      // Add one synonym to help retrieval
      const synonym = synonyms[0];
      if (!query.toLowerCase().includes(synonym)) {
        expandedQuery += ` ${synonym}`;
      }
      break; // Only expand one term
    }
  }

  return expandedQuery;
}

/**
 * Find existing images from RAG context
 */
export function findExistingImages(context: RAGContext): Array<{
  url: string;
  alt: string;
  sourceUrl: string;
}> {
  const images: Array<{ url: string; alt: string; sourceUrl: string }> = [];

  for (const chunk of context.chunks) {
    if (chunk.metadata.image_url) {
      images.push({
        url: chunk.metadata.image_url,
        alt: chunk.metadata.page_title,
        sourceUrl: chunk.metadata.source_url,
      });
    }
  }

  return images;
}

/**
 * Predefined product image map for Vitamix blenders
 * Maps product SKUs/names to their official product images
 * This is more reliable than RAG-based image lookup
 */
const PRODUCT_IMAGE_MAP: Record<string, string> = {
  // Ascent Series (new naming)
  'x5': 'https://www.vitamix.com/us/en_us/products/media_7ca6b121cca4cd1397c0c9bf32637ef925950836.png',
  'x4': 'https://www.vitamix.com/us/en_us/products/media_3f3eeec71d9e88c78b005868ddc8805b28b122b0.png',
  'x3': 'https://www.vitamix.com/us/en_us/products/media_9dce4f483d4ee81ca0a5e651c27156551f2bccbf.png',
  'x2': 'https://www.vitamix.com/us/en_us/products/media_335b90c4a88f4c5c43cf4c729084121123c0ce9a.png',
  // Ascent Series (legacy naming - map to same images)
  'a3500': 'https://www.vitamix.com/media/catalog/product/cache/0ec3c615634740d8dc65133430b5196f/a/3/a3500_brushedstainless_build_2500x2500.png',
  'a2500': 'https://www.vitamix.com/media/catalog/product/cache/0ec3c615634740d8dc65133430b5196f/a/2/a2500_black_front_build_2x_1.jpg',
  'a2300': 'https://www.vitamix.com/us/en_us/products/media_335b90c4a88f4c5c43cf4c729084121123c0ce9a.png', // Same as X2
  // Explorian Series
  'e310': 'https://www.vitamix.com/us/en_us/products/media_9bda4788608eabaa7bbbf3bfa59803af269b7f77.jpg',
  'e320': 'https://www.vitamix.com/us/en_us/products/media_9bda4788608eabaa7bbbf3bfa59803af269b7f77.jpg', // Same as E310
  // Classic/Legacy Series
  '5200': 'https://www.vitamix.com/us/en_us/products/media_bcd9b471a9b8219de3198529327044da42150284.jpg',
  '5300': 'https://www.vitamix.com/us/en_us/products/media_bcd9b471a9b8219de3198529327044da42150284.jpg', // Similar to 5200
  '7500': 'https://www.vitamix.com/us/en_us/products/media_bcd9b471a9b8219de3198529327044da42150284.jpg', // Similar style
  // Professional Series
  '750': 'https://www.vitamix.com/us/en_us/products/media_bcd9b471a9b8219de3198529327044da42150284.jpg',
  'pro750': 'https://www.vitamix.com/us/en_us/products/media_bcd9b471a9b8219de3198529327044da42150284.jpg',
};

/**
 * Find a product image by matching product name against predefined image map
 * Falls back to undefined if no match (will trigger AI image generation)
 */
export function findProductImage(
  productName: string,
  _context: RAGContext
): string | undefined {
  if (!productName) return undefined;

  const normalizedName = productName.toLowerCase();

  // Extract SKU patterns from product name
  // Matches: X5, X4, X3, X2, A3500, A2500, E310, 5200, 750, Pro 750, etc.
  const patterns = [
    /\bx([2-5])\b/i,                    // X2, X3, X4, X5
    /\ba([23]\d{3})\b/i,                // A3500, A2500, A2300
    /\be([23]\d{2})\b/i,                // E310, E320
    /\b([57]\d{3})\b/,                  // 5200, 5300, 7500
    /\bpro\s*(\d{3})\b/i,               // Pro 750
    /\b(\d{3})\b/,                      // 750
  ];

  for (const pattern of patterns) {
    const match = normalizedName.match(pattern);
    if (match) {
      // Build the lookup key
      let key: string;
      if (pattern.source.includes('x')) {
        key = `x${match[1]}`;
      } else if (pattern.source.includes('\\ba')) {
        key = `a${match[1]}`;
      } else if (pattern.source.includes('\\be')) {
        key = `e${match[1]}`;
      } else if (pattern.source.includes('pro')) {
        key = `pro${match[1]}`;
      } else {
        key = match[1];
      }

      const imageUrl = PRODUCT_IMAGE_MAP[key.toLowerCase()];
      if (imageUrl) {
        console.log(`[findProductImage] Found image for "${productName}" via key "${key}"`);
        return imageUrl;
      }
    }
  }

  // Try direct lookup by common product names
  for (const [key, url] of Object.entries(PRODUCT_IMAGE_MAP)) {
    if (normalizedName.includes(key)) {
      console.log(`[findProductImage] Found image for "${productName}" via direct match "${key}"`);
      return url;
    }
  }

  console.log(`[findProductImage] No predefined image found for "${productName}"`);
  return undefined;
}
