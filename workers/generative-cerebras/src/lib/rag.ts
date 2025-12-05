import type { Env, RAGContext, RAGChunk, RAGQuality, ContentType, IntentClassification, UserContext } from '../types';
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
 * Supports userContext-based filtering and boosting
 */
export async function smartRetrieve(
  query: string,
  intent: IntentClassification,
  env: Env,
  userContext?: UserContext
): Promise<RAGContext> {
  const plan = planRetrieval(query, intent);

  // [IMPROVEMENT #3] Augment query with context signals for better semantic matching
  const augmentedQuery = augmentQueryWithContext(plan.semanticQuery, userContext);

  console.log('Retrieval plan:', {
    query,
    augmentedQuery: augmentedQuery !== plan.semanticQuery ? augmentedQuery : undefined,
    strategy: plan.strategy,
    topK: plan.topK,
    filters: plan.filters,
    dedupeMode: plan.dedupeMode,
    maxResults: plan.maxResults,
    boostTerms: plan.boostTerms,
    reasoning: plan.reasoning,
    userContextFilters: userContext ? {
      dietaryAvoid: userContext.dietary?.avoid,
      dietaryPrefs: userContext.dietary?.preferences,
      healthConditions: userContext.health?.conditions,
      available: userContext.available,
      mustUse: userContext.mustUse,
      cuisine: userContext.cultural?.cuisine,
    } : undefined,
  });

  // Generate embedding for the (possibly augmented) semantic query
  const queryEmbedding = await generateQueryEmbedding(augmentedQuery, env);

  // Build filter for metadata
  const filter = buildMetadataFilter({
    contentTypes: plan.filters.contentTypes,
    productCategory: plan.filters.productCategory,
    recipeCategory: plan.filters.recipeCategory,
  });

  // Increase topK if we have dietary restrictions (we'll filter some out)
  const hasFiltering = userContext?.dietary?.avoid?.length ||
    userContext?.dietary?.preferences?.length;
  const adjustedTopK = hasFiltering
    ? Math.min(plan.topK * 2, 50) // Fetch more to compensate for filtering
    : plan.topK;

  // Query Vectorize with plan parameters (no filter - relying on semantic search)
  const results = await env.VECTORIZE.query(queryEmbedding, {
    topK: adjustedTopK,
    filter,  // Currently returns undefined - see buildMetadataFilter
    returnMetadata: 'all',
  });

  // Process results with plan's relevance threshold
  let chunks = processResultsWithThreshold(results, plan.relevanceThreshold);

  // Apply boost terms if present (for ingredient queries)
  if (plan.boostTerms && plan.boostTerms.length > 0) {
    chunks = boostByTerms(chunks, plan.boostTerms);
  }

  // [IMPROVEMENT #1] Boost by ingredients user has available or must use
  if (userContext?.available?.length || userContext?.mustUse?.length) {
    const ingredientBoostTerms = [
      ...(userContext.mustUse || []),    // Must-use gets priority (listed first)
      ...(userContext.available || []),
    ];
    console.log('[RAG] Boosting by available/mustUse ingredients:', ingredientBoostTerms);
    chunks = boostByTerms(chunks, ingredientBoostTerms);
  }

  // [IMPROVEMENT #4] Boost by cuisine/cultural preferences
  if (userContext?.cultural?.cuisine?.length || userContext?.cultural?.regional?.length) {
    const cuisineBoostTerms = [
      ...(userContext.cultural.cuisine || []),
      ...(userContext.cultural.regional || []),
    ];
    console.log('[RAG] Boosting by cuisine/regional preferences:', cuisineBoostTerms);
    chunks = boostByTerms(chunks, cuisineBoostTerms);
  }

  // [IMPROVEMENT #11] Penalize chunks with conflicting terms
  if (userContext) {
    chunks = penalizeConflicts(chunks, userContext);
  }

  // [IMPROVEMENT #2] Apply userContext-based filtering (dietary restrictions + preferences)
  const beforeContextFilter = chunks.length;
  if (userContext) {
    chunks = filterByUserContext(chunks, userContext);
  }

  // Dedupe based on strategy
  const dedupedChunks = deduplicateByMode(chunks, plan.dedupeMode);

  // [IMPROVEMENT #12] Ensure result diversity
  const diverseChunks = ensureResultDiversity(dedupedChunks);

  // Limit to max results
  const limitedChunks = diverseChunks.slice(0, plan.maxResults);

  // Assemble context (includes quality assessment)
  const context = assembleContext(limitedChunks);

  console.log('Retrieval results:', {
    rawResults: results.matches.length,
    afterThreshold: beforeContextFilter,
    afterContextFilter: chunks.length,
    afterDedupe: dedupedChunks.length,
    afterDiversity: diverseChunks.length,
    final: limitedChunks.length,
    filteredOut: beforeContextFilter - chunks.length,
    quality: context.quality,
  });

  // Debug: Log first chunk's raw metadata to see what's actually indexed
  if (results.matches.length > 0) {
    console.log('Sample raw metadata from Vectorize:', results.matches[0].metadata);
  }

  return context;
}

/**
 * [IMPROVEMENT #3] Augment query with context signals for better semantic matching
 * Injects relevant terms based on userContext to improve embedding search
 */
function augmentQueryWithContext(query: string, userContext?: UserContext): string {
  if (!userContext) return query;

  const augments: string[] = [];

  // Health conditions → relevant search terms
  if (userContext.health?.conditions?.includes('diabetes')) {
    augments.push('low sugar', 'diabetic friendly', 'no added sugar');
  }
  if (userContext.health?.conditions?.includes('heart-health')) {
    augments.push('low sodium', 'heart healthy');
  }
  if (userContext.health?.conditions?.includes('digestive')) {
    augments.push('easy to digest', 'gentle', 'fiber');
  }

  // Health goals
  if (userContext.health?.goals?.includes('weight-loss')) {
    augments.push('low calorie', 'healthy', 'light');
  }
  if (userContext.health?.goals?.includes('muscle-gain')) {
    augments.push('high protein', 'protein rich');
  }
  if (userContext.health?.goals?.includes('energy')) {
    augments.push('energizing', 'boost');
  }

  // Dietary preferences
  if (userContext.dietary?.preferences?.includes('vegan')) {
    augments.push('vegan', 'plant-based');
  }
  if (userContext.dietary?.preferences?.includes('keto')) {
    augments.push('keto', 'low carb');
  }
  if (userContext.dietary?.preferences?.includes('paleo')) {
    augments.push('paleo', 'whole foods');
  }

  // Constraints
  if (userContext.constraints?.includes('quick')) {
    augments.push('quick', 'fast', 'easy');
  }
  if (userContext.constraints?.includes('simple')) {
    augments.push('simple', 'easy', 'beginner');
  }

  // Fitness context
  if (userContext.fitnessContext?.includes('post-workout')) {
    augments.push('recovery', 'protein', 'post workout');
  }
  if (userContext.fitnessContext?.includes('pre-workout')) {
    augments.push('energy', 'light', 'pre workout');
  }

  // Audience
  if (userContext.audience?.includes('children')) {
    augments.push('kid friendly', 'kids');
  }
  if (userContext.audience?.includes('toddlers')) {
    augments.push('baby food', 'toddler', 'smooth');
  }

  // Season
  if (userContext.season?.includes('fall') || userContext.season?.includes('winter')) {
    augments.push('warming', 'cozy', 'comfort');
  }
  if (userContext.season?.includes('summer')) {
    augments.push('refreshing', 'cool', 'cold');
  }

  if (augments.length === 0) return query;

  // Dedupe and limit augments
  const uniqueAugments = [...new Set(augments)].slice(0, 6);
  const augmentedQuery = `${query} ${uniqueAugments.join(' ')}`;

  console.log('[RAG] Query augmented:', { original: query, augmented: augmentedQuery });
  return augmentedQuery;
}

/**
 * Filter chunks based on userContext (dietary restrictions, preferences)
 * Removes chunks that contain avoided ingredients or conflict with preferences
 */
function filterByUserContext(chunks: RAGChunk[], userContext: UserContext): RAGChunk[] {
  // Collect all terms to avoid/penalize
  const avoidTerms: string[] = [
    ...(userContext.dietary?.avoid || []),
  ];

  // [IMPROVEMENT #2] Expand dietary preferences to implicit avoid terms
  const preferenceFilters: Record<string, string[]> = {
    'vegan': ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp',
              'milk', 'cream', 'cheese', 'butter', 'yogurt', 'egg', 'honey'],
    'vegetarian': ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp'],
    'keto': ['sugar', 'flour', 'bread', 'pasta', 'rice', 'potato', 'corn'],
    'paleo': ['grain', 'wheat', 'rice', 'bread', 'pasta', 'legume', 'bean', 'dairy'],
  };

  // If user has dietary preferences, add those avoid terms
  for (const pref of userContext.dietary?.preferences || []) {
    const prefLower = pref.toLowerCase();
    if (preferenceFilters[prefLower]) {
      avoidTerms.push(...preferenceFilters[prefLower]);
      console.log(`[RAG] Expanding "${pref}" preference to avoid:`, preferenceFilters[prefLower]);
    }
  }

  // Expand common allergen terms
  const allergenExpansions: Record<string, string[]> = {
    'nuts': ['nut', 'nuts', 'almond', 'almonds', 'walnut', 'walnuts', 'pecan', 'pecans', 'cashew', 'cashews', 'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'macadamia'],
    'peanuts': ['peanut', 'peanuts', 'peanut butter'],
    'dairy': ['dairy', 'milk', 'cream', 'cheese', 'butter', 'yogurt', 'yoghurt', 'whey', 'casein', 'lactose'],
    'gluten': ['gluten', 'wheat', 'barley', 'rye', 'flour', 'bread', 'pasta'],
    'eggs': ['egg', 'eggs', 'mayonnaise', 'mayo'],
    'soy': ['soy', 'soya', 'tofu', 'edamame', 'tempeh', 'miso'],
    'shellfish': ['shellfish', 'shrimp', 'crab', 'lobster', 'clam', 'clams', 'mussel', 'mussels', 'oyster', 'oysters', 'scallop', 'scallops'],
    'fish': ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'anchovy', 'anchovies'],
  };

  // Expand avoid terms with allergen variations
  const expandedAvoidTerms: string[] = [];
  for (const term of avoidTerms) {
    const lowerTerm = term.toLowerCase();
    expandedAvoidTerms.push(lowerTerm);

    // Add variations if it's a known allergen category
    if (allergenExpansions[lowerTerm]) {
      expandedAvoidTerms.push(...allergenExpansions[lowerTerm]);
    }
  }

  if (expandedAvoidTerms.length === 0) {
    return chunks; // No filtering needed
  }

  console.log('[RAG] Filtering chunks for avoided terms:', expandedAvoidTerms);

  return chunks.filter((chunk) => {
    const textLower = chunk.text.toLowerCase();
    const titleLower = (chunk.metadata.page_title || '').toLowerCase();

    // Check if chunk contains any avoided terms
    for (const term of expandedAvoidTerms) {
      // Use word boundary matching to avoid false positives
      // e.g., "carrot" should match "carrots" but not "car"
      const regex = new RegExp(`\\b${escapeRegex(term)}s?\\b`, 'i');

      if (regex.test(textLower) || regex.test(titleLower)) {
        console.log(`[RAG] Filtered out chunk "${chunk.metadata.page_title}" - contains "${term}"`);
        return false;
      }
    }

    return true;
  });
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process results with custom threshold
 * [IMPROVEMENT #9] Applies freshness decay to boost newer content
 */
function processResultsWithThreshold(
  results: VectorizeMatches,
  threshold: number
): RAGChunk[] {
  const now = Date.now();

  return results.matches
    .filter((match) => match.score >= threshold)
    .map((match) => {
      const baseScore = match.score;
      const indexedAt = (match.metadata as any)?.indexed_at;

      // [IMPROVEMENT #9] Apply freshness decay
      const freshnessBoost = indexedAt
        ? calculateFreshnessBoost(indexedAt, now)
        : 1.0;

      return {
        id: match.id,
        score: baseScore * freshnessBoost,
        text: (match.metadata as any)?.chunk_text || '',
        metadata: {
          content_type: (match.metadata as any)?.content_type || 'editorial',
          source_url: (match.metadata as any)?.source_url || '',
          page_title: (match.metadata as any)?.page_title || '',
          product_sku: (match.metadata as any)?.product_sku,
          product_category: (match.metadata as any)?.product_category,
          recipe_category: (match.metadata as any)?.recipe_category,
          image_url: (match.metadata as any)?.image_url,
          indexed_at: indexedAt,
        },
      };
    });
}

/**
 * [IMPROVEMENT #9] Calculate freshness boost based on content age
 * Returns 1.0 for fresh content, decays to 0.85 over 90 days
 */
function calculateFreshnessBoost(indexedAt: string, now: number): number {
  try {
    const age = now - new Date(indexedAt).getTime();
    const daysOld = age / (1000 * 60 * 60 * 24);
    // 1.0 for fresh, decays to 0.85 over 90 days, minimum 0.85
    return Math.max(0.85, 1 - (daysOld / 600));
  } catch {
    return 1.0; // If date parsing fails, no penalty
  }
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
 * [IMPROVEMENT #11] Penalize chunks containing terms that conflict with user intent
 * Reduces false positives where content semantically matches but contradicts constraints
 */
const CONFLICT_TERMS: Record<string, string[]> = {
  'quick': ['overnight', 'slow-cooked', 'slow cooker', 'marinate for hours', '24 hours', 'next day', 'chill overnight'],
  'simple': ['advanced', 'chef-level', 'complex', 'intricate', 'professional technique'],
  'beginner': ['expert', 'professional', 'master chef', 'advanced technique'],
  'healthy': ['indulgent', 'decadent', 'deep fried', 'loaded with'],
  'low-calorie': ['creamy', 'rich', 'buttery', 'loaded'],
  'budget': ['premium', 'expensive', 'luxury', 'gourmet'],
};

function penalizeConflicts(chunks: RAGChunk[], userContext: UserContext): RAGChunk[] {
  const conflicts: string[] = [];

  // Gather conflicting terms based on user constraints
  for (const constraint of userContext.constraints || []) {
    const lowerConstraint = constraint.toLowerCase();
    if (CONFLICT_TERMS[lowerConstraint]) {
      conflicts.push(...CONFLICT_TERMS[lowerConstraint]);
    }
  }

  // Also check health goals
  if (userContext.health?.goals?.includes('weight-loss')) {
    conflicts.push(...(CONFLICT_TERMS['low-calorie'] || []));
  }

  // Check budget constraints
  if (userContext.budget?.includes('budget-friendly')) {
    conflicts.push(...(CONFLICT_TERMS['budget'] || []));
  }

  if (conflicts.length === 0) {
    return chunks;
  }

  console.log('[RAG] Penalizing conflicts:', conflicts);

  return chunks
    .map((chunk) => {
      const text = chunk.text.toLowerCase();
      const hasConflict = conflicts.some(term => text.includes(term.toLowerCase()));

      if (hasConflict) {
        console.log(`[RAG] Penalized chunk "${chunk.metadata.page_title}" for conflict`);
        return { ...chunk, score: chunk.score * 0.7 }; // 30% penalty
      }
      return chunk;
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * [IMPROVEMENT #12] Ensure result diversity by limiting chunks per source/category
 * Prevents results from being dominated by a single source or category
 */
function ensureResultDiversity(chunks: RAGChunk[], maxPerSource: number = 2, maxPerCategory: number = 3): RAGChunk[] {
  if (chunks.length <= 3) {
    return chunks; // Not enough chunks to need diversity enforcement
  }

  const sourceCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  const diverse: RAGChunk[] = [];
  const deferred: RAGChunk[] = [];

  for (const chunk of chunks) {
    const source = chunk.metadata.source_url;
    const category = chunk.metadata.recipe_category || chunk.metadata.product_category || 'other';

    const sourceCount = sourceCounts.get(source) || 0;
    const categoryCount = categoryCounts.get(category) || 0;

    // If within limits, add to diverse results
    if (sourceCount < maxPerSource && categoryCount < maxPerCategory) {
      diverse.push(chunk);
      sourceCounts.set(source, sourceCount + 1);
      categoryCounts.set(category, categoryCount + 1);
    } else {
      // Otherwise defer (might add later if we need more results)
      deferred.push(chunk);
    }
  }

  // If we don't have enough diverse results, add some deferred ones
  const minResults = Math.min(5, chunks.length);
  if (diverse.length < minResults) {
    const needed = minResults - diverse.length;
    diverse.push(...deferred.slice(0, needed));
  }

  if (deferred.length > 0) {
    console.log(`[RAG] Diversity enforcement: kept ${diverse.length}, deferred ${deferred.length}`);
  }

  return diverse;
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
 * [IMPROVEMENT #10] With semantic caching to avoid recomputing common queries
 */
async function generateQueryEmbedding(query: string, env: Env): Promise<number[]> {
  // [IMPROVEMENT #10] Check cache first
  const normalizedQuery = query.toLowerCase().trim();
  const cacheKey = `embed:${simpleHashForCache(normalizedQuery)}`;

  try {
    const cached = await env.CACHE.get(cacheKey, 'json') as number[] | null;
    if (cached && Array.isArray(cached) && cached.length > 0) {
      console.log('[RAG] Embedding cache hit for query');
      return cached;
    }
  } catch {
    // Cache miss or error, proceed to generate
  }

  // Generate fresh embedding
  const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [query],
  }) as { data: number[][] };

  const embedding = result.data[0];

  // [IMPROVEMENT #10] Cache the embedding (24 hour TTL)
  try {
    await env.CACHE.put(cacheKey, JSON.stringify(embedding), { expirationTtl: 86400 });
    console.log('[RAG] Embedding cached for query');
  } catch {
    // Caching failed, continue without caching
  }

  return embedding;
}

/**
 * [IMPROVEMENT #10] Simple hash function for cache keys
 */
function simpleHashForCache(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
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
 * [IMPROVEMENT #14] Includes quality assessment for confidence-based fallbacks
 */
function assembleContext(chunks: RAGChunk[]): RAGContext {
  const sourceUrls = [...new Set(chunks.map(c => c.metadata.source_url))];
  const quality = assessResultQuality(chunks);

  if (quality === 'low') {
    console.log('[RAG] Low confidence results - consider expanding search or using more creative generation');
  }

  return {
    chunks,
    totalRelevance: chunks.reduce((sum, c) => sum + c.score, 0) / Math.max(chunks.length, 1),
    hasProductInfo: chunks.some(c => c.metadata.content_type === 'product'),
    hasRecipes: chunks.some(c => c.metadata.content_type === 'recipe'),
    sourceUrls,
    quality,
  };
}

/**
 * [IMPROVEMENT #14] Assess the quality of RAG results for confidence-based decisions
 * Used to determine if we should rely heavily on RAG or let LLM be more creative
 */
export function assessResultQuality(chunks: RAGChunk[]): RAGQuality {
  if (chunks.length === 0) {
    return 'low';
  }

  const avgScore = chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length;
  const topScore = chunks[0]?.score || 0;
  const hasMultipleGoodResults = chunks.filter(c => c.score > 0.75).length >= 2;

  // High quality: strong top result AND good average AND multiple good results
  if (topScore > 0.85 && avgScore > 0.75 && hasMultipleGoodResults) {
    return 'high';
  }

  // Medium quality: decent top result OR good average
  if (topScore > 0.70 || avgScore > 0.65) {
    return 'medium';
  }

  // Low quality: weak results overall
  return 'low';
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
  // === ASCENT SERIES (X-Series) ===
  'x5': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx5_bsf_front_build_tamperholder_on-white_2x_1.png',
  'ascent-x5': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx5_bsf_front_build_tamperholder_on-white_2x_1.png',
  'ascent x5': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx5_bsf_front_build_tamperholder_on-white_2x_1.png',
  'x4': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx4_bsf_front_build_tamperholder_on-white_2x_1.png',
  'ascent-x4': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx4_bsf_front_build_tamperholder_on-white_2x_1.png',
  'ascent x4': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx4_bsf_front_build_tamperholder_on-white_2x_1.png',
  'x3': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx3_black_front_build_on-white_2x.png',
  'ascent-x3': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx3_black_front_build_on-white_2x.png',
  'ascent x3': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx3_black_front_build_on-white_2x.png',
  'x2': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx2_black_front_build_on-white_2x.png',
  'ascent-x2': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx2_black_front_build_on-white_2x.png',
  'ascent x2': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx2_black_front_build_on-white_2x.png',

  // === ASCENT KITCHEN SYSTEMS & BUNDLES ===
  'ascent-x5-smartprep-kitchen-system': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/x/5/x5-smartprep-kitchen-system-brushed-stainless-can-620x620_2.jpg',
  'x5 smartprep': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/x/5/x5-smartprep-kitchen-system-brushed-stainless-can-620x620_2.jpg',
  'ascent-x4-gourmet-smartprep-kitchen-system': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascent-x4-kitchensystem-contents-pdp-infographic-620x620_1.jpg',
  'x4 gourmet': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascent-x4-kitchensystem-contents-pdp-infographic-620x620_1.jpg',
  'ascent-x2-smartprep-kitchen-system': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascent-x2-kitchensystem-contents-pdp-infographic-620x620.jpg',
  'x2 smartprep': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascent-x2-kitchensystem-contents-pdp-infographic-620x620.jpg',
  'ascent-x5-with-stainless-steel-container': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/x/5/x5-graphite-48oz-stainless-pdp-2000x2000-front-th.jpg',
  'x5 stainless': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/x/5/x5-graphite-48oz-stainless-pdp-2000x2000-front-th.jpg',

  // === ASCENT LEGACY (A-Series) ===
  'a3500': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/3/a3500_brushedstainless_build_2500x2500_4.png',
  'ascent a3500': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/3/a3500_brushedstainless_build_2500x2500_4.png',
  'a2500': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/2/a2500_black_front_build_2x_4.jpg',
  'ascent a2500': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/2/a2500_black_front_build_2x_4.jpg',
  'a2300': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/s/ascentx2_black_front_build_on-white_2x.png',

  // === EXPLORIAN SERIES ===
  'e310': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/e/3/e310_black_build_front_on-white_2x.jpg',
  'explorian e310': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/e/3/e310_black_build_front_on-white_2x.jpg',
  'e320': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/e/3/e320_super_pack-black-on_gray-620x620.jpg',
  'explorian e320': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/e/3/e320_super_pack-black-on_gray-620x620.jpg',
  'e320-and-pca-explorian-blender': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/e/3/e320_super_pack-black-on_gray-620x620.jpg',
  'e310-and-pca-bundle': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/e/3/e310_black_build_front_on-white_2x.jpg',

  // === PROPEL SERIES ===
  'propel-series-750': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/p/r/propel_750_black_build_front_on-white_2x.jpg',
  'propel 750': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/p/r/propel_750_black_build_front_on-white_2x.jpg',
  'propel-750-classic-bundle': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/p/r/propel_750_bundle_white_2000x2000.jpg',
  'propel-series-510': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/p/r/propel_510_black_build_on-white_2x.jpg',
  'propel 510': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/p/r/propel_510_black_build_on-white_2x.jpg',

  // === CLASSIC/LEGACY SERIES (5200) ===
  '5200': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/5/2/5200_black_build_front_on-white_2x.jpg',
  '5200-standard-getting-started': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/5/2/5200_black_build_front_on-white_2x.jpg',
  '5200-legacy-bundle': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/5/2/5200_black_build_front_on-white_2x.jpg',
  '5200-plus-stainless-steel-container': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/5/2/5200_black_build_front_on-white_2x.jpg',
  '5300': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/5/2/5200_black_build_front_on-white_2x.jpg',
  '7500': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/5/2/5200_black_build_front_on-white_2x.jpg',

  // === PROFESSIONAL SERIES ===
  '750': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/p/r/propel_750_black_build_front_on-white_2x.jpg',
  'pro750': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/p/r/propel_750_black_build_front_on-white_2x.jpg',
  'professional 750': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/p/r/propel_750_black_build_front_on-white_2x.jpg',

  // === IMMERSION BLENDERS ===
  '5-speed-immersion-blender': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/i/m/immersion_5speed_black_build_front_on-white_2x.jpg',
  'immersion blender': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/i/m/immersion_5speed_black_build_front_on-white_2x.jpg',
  '5-speed-immersion-blender-complete-bundle': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/i/m/immersion_bundle_complete_620x620.jpg',
  '4-piece-deluxe-immersion-blender-bundle': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/5/-/5-speed-ib-4-piece-deluxe-pdp-2000x2000-group-blk.jpg',
  '5-speed-immersion-blender-3-piece-bundle': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/i/m/immersion_5speed_black_build_front_on-white_2x.jpg',
  '2-speed-immersion-blender-whisk-attachment': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/i/m/immersion_2speed_black_build_front_on-white_2x.jpg',

  // === CERTIFIED RECONDITIONED ===
  'certified-reconditioned-explorian': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/e/3/e310_black_build_front_on-white_2x.jpg',
  'certified-reconditioned-standard': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/5/2/5200_black_build_front_on-white_2x.jpg',
  'certified-reconditioned-explorian-with-programs': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/e/5/e520_justpeachy_build_onwhite_2x.jpg',
  'certified-reconditioned-a2500': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/2/a2500_black_front_build_2x_4.jpg',
  'certified-reconditioned-a3500': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/3/a3500_brushedstainless_build_2500x2500_4.png',
  'reconditioned': 'https://www.vitamix.com/media/catalog/product/cache/31c83fe65654f20e4dd92d1b9a40d46d/a/2/a2500_black_front_build_2x_4.jpg',
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

// ============================================================================
// IMAGE ASSET LOOKUP (Priority 3)
// ============================================================================

/**
 * Image type for filtering asset index queries
 */
export type ImageContext = 'product' | 'recipe' | 'lifestyle';

/**
 * Result from image lookup with source tracking
 */
export interface ImageLookupResult {
  url: string;
  source: 'map' | 'rag' | 'index';
  score?: number;
  alt?: string;
  /** For hero tiered fallback: indicates image needs CSS cropping */
  cropNeeded?: boolean;
  /** For hero tiered fallback: which tier the image came from */
  tier?: 'ideal' | 'relaxed' | 'any';
}

/**
 * Generic fallback image that should be ignored
 */
const GENERIC_FALLBACK_PATTERNS = [
  'Ascent_X5_Nav_Image.png',
  'placeholder',
  'default',
  'fallback',
];

/**
 * Find best existing image before deciding to generate
 * Priority: 1) Product map, 2) Enhanced RAG chunks, 3) Image index, 4) null (generate)
 *
 * This is the main entry point for image lookup, implementing the decision flow
 * from IMAGE_STRATEGY.md
 *
 * @param context - Image context type (product, recipe, lifestyle)
 * @param query - Search query for the image
 * @param ragContext - RAG context with retrieved chunks
 * @param env - Environment bindings
 * @param blockType - Optional block type for aspect ratio filtering (e.g., 'hero', 'cards')
 */
/**
 * Check if a block type is a hero block that should use tiered fallback
 */
function isHeroBlock(blockType?: string): boolean {
  return blockType === 'hero' || blockType === 'recipe-hero' || blockType === 'recipe-hero-detail';
}

/**
 * Tiered hero image lookup
 * Tier 1: Strict aspect ratio (landscape-wide preferred)
 * Tier 2: Relaxed aspect ratio (landscape or square, will need crop)
 * Tier 3: Any image (will definitely need crop)
 * Tier 4: Return null (text-only hero)
 */
async function findHeroImageWithTiers(
  query: string,
  context: ImageContext,
  env: Env,
  blockType: string
): Promise<ImageLookupResult | null> {
  console.log(`[Hero Image] Tiered lookup for "${query}" (${blockType})`);

  // Query with hero aspect ratio preferences - returns isFallback if no ideal match
  const result = await queryImageIndex(query, context, env, blockType);

  if (result) {
    if (result.isFallback) {
      // Got a fallback (wrong aspect ratio) - will need CSS crop
      console.log(`[Hero Image] ✓ Using fallback (needs crop): ${result.url}`);
      return { url: result.url, source: 'index', score: result.score, tier: 'any', cropNeeded: true };
    } else {
      // Perfect match with correct aspect ratio
      console.log(`[Hero Image] ✓ Ideal match: ${result.url}`);
      return { url: result.url, source: 'index', score: result.score, tier: 'ideal', cropNeeded: false };
    }
  }

  // No image found at all - text-only hero
  console.log(`[Hero Image] ✗ No image found for "${query}" - will use text-only`);
  return null;
}

export async function findBestImage(
  context: ImageContext,
  query: string,
  ragContext: RAGContext,
  env: Env,
  blockType?: string
): Promise<ImageLookupResult | null> {
  console.log(`[Image] Finding best image for context="${context}", query="${query}"${blockType ? `, block="${blockType}"` : ''}`);

  // 1. For products, check static map first (most reliable)
  if (context === 'product') {
    const mapped = findProductImage(query, ragContext);
    if (mapped) {
      console.log(`[Image] ✓ Using product map for "${query}"`);
      return { url: mapped, source: 'map' };
    }
  }

  // 2. Check RAG chunks for matching images (using enhanced metadata)
  const ragImage = findImageFromRAG(ragContext, context);
  if (ragImage) {
    console.log(`[Image] ✓ Using RAG image for "${query}"`);
    return { url: ragImage.url, source: 'rag', alt: ragImage.alt };
  }

  // 3. Query dedicated image index (if available)
  if (env.IMAGE_INDEX) {
    // Hero blocks get special tiered fallback treatment
    if (isHeroBlock(blockType)) {
      return findHeroImageWithTiers(query, context, env, blockType!);
    }

    // Non-hero blocks use standard lookup
    const indexMatch = await queryImageIndex(query, context, env, blockType);
    if (indexMatch) {
      console.log(`[Image] ✓ Using index image for "${query}"`);
      return { url: indexMatch.url, source: 'index', score: indexMatch.score };
    }
  }

  // 4. No existing image found
  console.log(`[Image] ✗ No existing image for "${query}"`);
  return null;
}

/**
 * Find image from RAG chunks using enhanced metadata
 * Prefers type-specific images (recipe_image_url, product_image_url) over generic
 */
function findImageFromRAG(
  context: RAGContext,
  imageContext: ImageContext
): { url: string; alt?: string } | null {
  // Sort chunks by score to prefer higher-relevance sources
  const sortedChunks = [...context.chunks].sort((a, b) => b.score - a.score);

  for (const chunk of sortedChunks) {
    const meta = chunk.metadata as any;

    // Check for type-specific image first
    let imageUrl: string | undefined;
    if (imageContext === 'recipe' && meta.recipe_image_url) {
      imageUrl = meta.recipe_image_url;
    } else if (imageContext === 'product' && meta.product_image_url) {
      imageUrl = meta.product_image_url;
    }

    // Fallback to hero image or generic image_url
    if (!imageUrl) {
      imageUrl = meta.hero_image_url || meta.image_url;
    }

    // Validate the URL is not a generic fallback
    if (imageUrl && !isGenericFallback(imageUrl)) {
      return {
        url: imageUrl,
        alt: meta.image_alt_text || meta.page_title,
      };
    }
  }

  return null;
}

/**
 * Check if an image URL is a known generic fallback that should be ignored
 */
function isGenericFallback(url: string): boolean {
  const urlLower = url.toLowerCase();
  return GENERIC_FALLBACK_PATTERNS.some(pattern =>
    urlLower.includes(pattern.toLowerCase())
  );
}

/**
 * Block-type specific thresholds for image matching
 * Lower thresholds = more permissive matching
 * Hero blocks have relaxed thresholds due to limited landscape-wide images
 */
const BLOCK_IMAGE_THRESHOLDS: Record<string, number> = {
  'hero': 0.45,           // Very relaxed - limited landscape images
  'recipe-hero': 0.45,
  'recipe-hero-detail': 0.45,
  'product-hero': 0.60,   // Stricter - product accuracy matters
  'cards': 0.50,          // Balanced
  'columns': 0.50,
  'split-content': 0.50,
  'recipe-cards': 0.50,
  'product-cards': 0.60,
  'product-recommendation': 0.60,
  'default': 0.50,        // Default threshold (lowered from 0.75)
};

/**
 * Query the dedicated IMAGE_INDEX for semantically matching images
 * Returns the best match if above confidence threshold and matching aspect ratio
 * Uses block-type specific thresholds for best-effort matching
 */
async function queryImageIndex(
  description: string,
  context: ImageContext,
  env: Env,
  blockType?: string
): Promise<{ url: string; score: number; isFallback: boolean } | null> {
  if (!env.IMAGE_INDEX) {
    return null;
  }

  // Dynamically import to avoid circular dependencies
  const { getDimensions, isDimensionsSuitableForBlock, BLOCK_ASPECT_PREFERENCES } = await import('./image-dimensions');

  // Get threshold for this block type
  const threshold = blockType && BLOCK_IMAGE_THRESHOLDS[blockType]
    ? BLOCK_IMAGE_THRESHOLDS[blockType]
    : BLOCK_IMAGE_THRESHOLDS['default'];

  try {
    // Generate embedding for the description
    const embedding = await generateImageQueryEmbedding(description, env);

    // Build filter for image type if specified
    // Note: Index has image_type values: 'recipe', 'product', 'blog', 'page'
    // BUT: Vectorize filter doesn't work reliably for 'recipe' type (returns 0 even when images exist)
    // Skip filter for 'lifestyle' (doesn't exist) and 'recipe' (unreliable) - semantic search works well
    const filterableTypes = ['product', 'blog', 'page']; // Only these work reliably with Vectorize filter
    const filter = context && filterableTypes.includes(context)
      ? { image_type: { $eq: context } }
      : undefined;

    if (context && !filterableTypes.includes(context)) {
      console.log(`[Image Index] No filter for context '${context}' - relying on semantic search`);
    }

    // Fetch more results to allow for aspect ratio filtering
    const needsAspectFilter = blockType && BLOCK_ASPECT_PREFERENCES[blockType];
    const topK = needsAspectFilter ? 25 : 10; // Increased for better fallback options

    // Query the image index
    const results = await env.IMAGE_INDEX.query(embedding, {
      topK,
      filter,
      returnMetadata: 'all',
    });

    if (!results.matches || results.matches.length === 0) {
      console.log(`[Image Index] No matches for "${description}"`);
      return null;
    }

    // Track best fallback in case no match passes aspect ratio check
    let bestFallback: { url: string; score: number; isFallback: boolean } | null = null;

    // Find best match above threshold that also matches aspect ratio
    for (const match of results.matches) {
      const imageUrl = (match.metadata as any)?.url ||
                       (match.metadata as any)?.image_url;
      if (!imageUrl) continue;

      // Store as fallback if above threshold (even if aspect doesn't match)
      if (match.score >= threshold && !bestFallback) {
        bestFallback = { url: imageUrl, score: match.score, isFallback: true };
      }

      // Check aspect ratio if block type specified
      if (needsAspectFilter) {
        const dimensions = await getDimensions(imageUrl, env);
        if (dimensions && !isDimensionsSuitableForBlock(dimensions, blockType)) {
          console.log(`[Image Index] Skipping ${imageUrl} - aspect ${dimensions.aspectCategory} not suitable for ${blockType}`);
          continue;
        }
        if (dimensions) {
          console.log(`[Image Index] ✓ Match ${match.score.toFixed(3)} for "${description}" (${dimensions.width}x${dimensions.height}, ${dimensions.aspectCategory})`);
        }
      } else {
        console.log(`[Image Index] Match score ${match.score.toFixed(3)} for "${description}"`);
      }

      // Return if above threshold (aspect check passed or not needed)
      if (match.score >= threshold) {
        return { url: imageUrl, score: match.score, isFallback: false };
      }
    }

    // If no ideal match found, return best fallback (best-effort)
    if (bestFallback) {
      console.log(`[Image Index] Using aspect-mismatch fallback for "${description}" - score ${bestFallback.score.toFixed(3)} (needs CSS crop)`);
      return bestFallback;
    }

    // Log what we had (best-effort even below threshold)
    const bestMatch = results.matches[0];
    if (bestMatch) {
      const url = (bestMatch.metadata as any)?.url || (bestMatch.metadata as any)?.image_url;
      // For lifestyle/columns context, always return something (empty placeholder looks worse than imperfect image)
      // For other contexts, use 0.35 minimum threshold
      const isLifestyleContext = context === 'lifestyle' || blockType === 'columns' || blockType === 'split-content';
      const minScore = isLifestyleContext ? 0.20 : 0.35;
      if (url && bestMatch.score >= minScore) {
        console.log(`[Image Index] Best-effort match for "${description}" - score ${bestMatch.score.toFixed(3)} (below threshold ${threshold})`);
        return { url, score: bestMatch.score, isFallback: true };
      }
    }

    console.log(`[Image Index] No suitable match for "${description}" (best: ${bestMatch?.score?.toFixed(3) || 'none'}, threshold: ${threshold})`);
    return null;
  } catch (error) {
    console.error('[Image Index] Query failed:', error);
    return null;
  }
}

/**
 * Generate embedding for image query (uses same model as content)
 * Could be optimized with caching similar to content embeddings
 */
async function generateImageQueryEmbedding(query: string, env: Env): Promise<number[]> {
  const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [query],
  }) as { data: number[][] };

  return result.data[0];
}

/**
 * Log image decision for debugging/analytics
 */
export function logImageDecision(
  blockType: string,
  imagePrompt: string,
  result: ImageLookupResult | null
): void {
  const context = blockType.includes('product') ? 'product' :
                  blockType.includes('recipe') ? 'recipe' : 'lifestyle';

  console.log('[Image Decision]', {
    blockType,
    context,
    query: imagePrompt.slice(0, 50) + (imagePrompt.length > 50 ? '...' : ''),
    decision: result ? 'reuse' : 'generate',
    source: result?.source,
    score: result?.score?.toFixed(3),
  });
}
