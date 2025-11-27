import type { ExtractedContent, TextChunk, ChunkMetadata, ContentType } from './types';

/**
 * Configuration for chunking
 */
interface ChunkConfig {
  maxChunkSize: number;      // Maximum tokens per chunk
  minChunkSize: number;      // Minimum tokens per chunk
  overlapSize: number;       // Token overlap between chunks
}

/**
 * Default chunking configuration
 */
const DEFAULT_CONFIG: ChunkConfig = {
  maxChunkSize: 512,
  minChunkSize: 100,
  overlapSize: 50,
};

/**
 * Content-type specific configurations
 */
const TYPE_CONFIGS: Record<ContentType, Partial<ChunkConfig>> = {
  product: {
    maxChunkSize: 400,
    minChunkSize: 80,
  },
  recipe: {
    maxChunkSize: 300,
    minChunkSize: 50,
  },
  editorial: {
    maxChunkSize: 512,
    minChunkSize: 100,
  },
  support: {
    maxChunkSize: 400,
    minChunkSize: 80,
  },
  brand: {
    maxChunkSize: 450,
    minChunkSize: 100,
  },
};

/**
 * Create chunks from extracted content, ready for embedding
 */
export function createChunks(content: ExtractedContent): TextChunk[] {
  const config = {
    ...DEFAULT_CONFIG,
    ...TYPE_CONFIGS[content.contentType],
  };

  const chunks: TextChunk[] = [];
  const baseMetadata = createBaseMetadata(content);

  // Strategy depends on content type
  switch (content.contentType) {
    case 'product':
      chunks.push(...chunkProductContent(content, config, baseMetadata));
      break;
    case 'recipe':
      chunks.push(...chunkRecipeContent(content, config, baseMetadata));
      break;
    case 'support':
      chunks.push(...chunkSupportContent(content, config, baseMetadata));
      break;
    default:
      chunks.push(...chunkGenericContent(content, config, baseMetadata));
  }

  return chunks;
}

/**
 * Create base metadata for all chunks from this content
 */
function createBaseMetadata(content: ExtractedContent): Omit<ChunkMetadata, 'chunk_text'> {
  return {
    content_type: content.contentType,
    source_url: content.url,
    page_title: content.title,
    product_sku: content.productSpecs?.sku,
    product_category: content.productSpecs?.category,
    recipe_category: content.recipeData?.category,
    image_url: content.images[0]?.src,
    freshness_score: 1.0, // Fresh content starts at 1.0
    indexed_at: new Date().toISOString(),
  };
}

/**
 * Chunk product content - keep specs together
 */
function chunkProductContent(
  content: ExtractedContent,
  config: ChunkConfig,
  baseMetadata: Omit<ChunkMetadata, 'chunk_text'>
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  // Create a product summary chunk
  const summary = buildProductSummary(content);
  if (summary) {
    chunks.push(createChunk(content.url, chunkIndex++, summary, baseMetadata));
  }

  // Create specification chunk if present
  if (content.productSpecs) {
    const specText = buildSpecificationText(content.productSpecs);
    if (specText) {
      chunks.push(createChunk(content.url, chunkIndex++, specText, baseMetadata));
    }
  }

  // Chunk the body text
  const bodyChunks = chunkText(content.bodyText, config);
  for (const text of bodyChunks) {
    chunks.push(createChunk(content.url, chunkIndex++, text, baseMetadata));
  }

  return chunks;
}

/**
 * Build a product summary from extracted data
 */
function buildProductSummary(content: ExtractedContent): string {
  const parts: string[] = [];

  if (content.title) {
    parts.push(content.title);
  }

  if (content.description) {
    parts.push(content.description);
  }

  if (content.productSpecs?.features.length) {
    parts.push('Features: ' + content.productSpecs.features.slice(0, 5).join('. '));
  }

  return parts.join('\n\n');
}

/**
 * Build text from product specifications
 */
function buildSpecificationText(specs: NonNullable<ExtractedContent['productSpecs']>): string {
  const parts: string[] = [];

  if (specs.name) {
    parts.push(`Product: ${specs.name}`);
  }

  if (specs.sku) {
    parts.push(`SKU: ${specs.sku}`);
  }

  if (specs.price) {
    parts.push(`Price: ${specs.price}`);
  }

  if (Object.keys(specs.specifications).length > 0) {
    parts.push('Specifications:');
    for (const [key, value] of Object.entries(specs.specifications)) {
      parts.push(`- ${key}: ${value}`);
    }
  }

  return parts.join('\n');
}

/**
 * Chunk recipe content - separate ingredients from instructions
 */
function chunkRecipeContent(
  content: ExtractedContent,
  config: ChunkConfig,
  baseMetadata: Omit<ChunkMetadata, 'chunk_text'>
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  // Create recipe summary chunk
  if (content.recipeData) {
    const summary = buildRecipeSummary(content);
    if (summary) {
      chunks.push(createChunk(content.url, chunkIndex++, summary, baseMetadata));
    }

    // Create ingredients chunk
    if (content.recipeData.ingredients.length > 0) {
      const ingredientsText = `Ingredients for ${content.recipeData.name}:\n` +
        content.recipeData.ingredients.map(i => `- ${i}`).join('\n');
      chunks.push(createChunk(content.url, chunkIndex++, ingredientsText, baseMetadata));
    }

    // Create instructions chunks
    if (content.recipeData.instructions.length > 0) {
      const instructionsText = `Instructions for ${content.recipeData.name}:\n` +
        content.recipeData.instructions.map((inst, i) => `${i + 1}. ${inst}`).join('\n');

      // Instructions might be long, so chunk them
      const instructionChunks = chunkText(instructionsText, config);
      for (const text of instructionChunks) {
        chunks.push(createChunk(content.url, chunkIndex++, text, baseMetadata));
      }
    }
  }

  // Also chunk any additional body content
  const bodyChunks = chunkText(content.bodyText, config);
  for (const text of bodyChunks) {
    // Avoid duplicating recipe content
    if (!text.includes('Ingredients') && !text.includes('Instructions')) {
      chunks.push(createChunk(content.url, chunkIndex++, text, baseMetadata));
    }
  }

  return chunks;
}

/**
 * Build a recipe summary
 */
function buildRecipeSummary(content: ExtractedContent): string {
  const parts: string[] = [];
  const recipe = content.recipeData!;

  if (recipe.name) {
    parts.push(`Recipe: ${recipe.name}`);
  }

  if (recipe.category) {
    parts.push(`Category: ${recipe.category}`);
  }

  if (recipe.prepTime || recipe.cookTime) {
    const time = [
      recipe.prepTime ? `Prep: ${recipe.prepTime}` : '',
      recipe.cookTime ? `Cook: ${recipe.cookTime}` : '',
    ].filter(Boolean).join(', ');
    parts.push(`Time: ${time}`);
  }

  if (recipe.servings) {
    parts.push(`Servings: ${recipe.servings}`);
  }

  if (content.description) {
    parts.push(content.description);
  }

  return parts.join('\n');
}

/**
 * Chunk support content - keep Q&A together
 */
function chunkSupportContent(
  content: ExtractedContent,
  config: ChunkConfig,
  baseMetadata: Omit<ChunkMetadata, 'chunk_text'>
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  // Try to identify Q&A pairs in the content
  const qaPattern = /(?:Q:|Question:?|FAQ:?)\s*([^\n]+)\n+(?:A:|Answer:?)\s*([^\n]+(?:\n(?!Q:|Question:|FAQ:)[^\n]+)*)/gi;
  const bodyText = content.bodyText;
  let match;
  let lastIndex = 0;

  while ((match = qaPattern.exec(bodyText)) !== null) {
    // Chunk any text before this Q&A
    if (match.index > lastIndex) {
      const beforeText = bodyText.slice(lastIndex, match.index).trim();
      if (beforeText) {
        const beforeChunks = chunkText(beforeText, config);
        for (const text of beforeChunks) {
          chunks.push(createChunk(content.url, chunkIndex++, text, baseMetadata));
        }
      }
    }

    // Keep Q&A together as one chunk
    const qa = `Q: ${match[1].trim()}\nA: ${match[2].trim()}`;
    chunks.push(createChunk(content.url, chunkIndex++, qa, baseMetadata));

    lastIndex = match.index + match[0].length;
  }

  // Chunk any remaining text
  if (lastIndex < bodyText.length) {
    const remainingText = bodyText.slice(lastIndex).trim();
    if (remainingText) {
      const remainingChunks = chunkText(remainingText, config);
      for (const text of remainingChunks) {
        chunks.push(createChunk(content.url, chunkIndex++, text, baseMetadata));
      }
    }
  }

  // If no Q&A pairs found, fall back to generic chunking
  if (chunks.length === 0) {
    return chunkGenericContent(content, config, baseMetadata);
  }

  return chunks;
}

/**
 * Generic content chunking (editorial, brand content)
 */
function chunkGenericContent(
  content: ExtractedContent,
  config: ChunkConfig,
  baseMetadata: Omit<ChunkMetadata, 'chunk_text'>
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let chunkIndex = 0;

  // Create a summary chunk with title and description
  if (content.title || content.description) {
    const summary = [content.title, content.description].filter(Boolean).join('\n\n');
    chunks.push(createChunk(content.url, chunkIndex++, summary, baseMetadata));
  }

  // Chunk the body text
  const bodyChunks = chunkText(content.bodyText, config);
  for (const text of bodyChunks) {
    chunks.push(createChunk(content.url, chunkIndex++, text, baseMetadata));
  }

  return chunks;
}

/**
 * Split text into chunks with overlap
 */
function chunkText(text: string, config: ChunkConfig): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Approximate token count (rough: 1 token ≈ 4 characters)
  const approxTokens = (str: string) => Math.ceil(str.length / 4);

  // If text is small enough, return as single chunk
  if (approxTokens(text) <= config.maxChunkSize) {
    return [text.trim()];
  }

  const chunks: string[] = [];

  // Split by paragraphs first
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim();
    if (!trimmedPara) continue;

    const potentialChunk = currentChunk
      ? currentChunk + '\n\n' + trimmedPara
      : trimmedPara;

    if (approxTokens(potentialChunk) <= config.maxChunkSize) {
      currentChunk = potentialChunk;
    } else {
      // Save current chunk if it meets minimum size
      if (currentChunk && approxTokens(currentChunk) >= config.minChunkSize) {
        chunks.push(currentChunk);
      }

      // Handle very long paragraphs by splitting on sentences
      if (approxTokens(trimmedPara) > config.maxChunkSize) {
        const sentenceChunks = splitLongParagraph(trimmedPara, config);
        chunks.push(...sentenceChunks);
        currentChunk = '';
      } else {
        currentChunk = trimmedPara;
      }
    }
  }

  // Don't forget the last chunk
  if (currentChunk && approxTokens(currentChunk) >= config.minChunkSize) {
    chunks.push(currentChunk);
  }

  // Add overlap between chunks
  return addOverlap(chunks, config.overlapSize);
}

/**
 * Split a long paragraph into sentence-based chunks
 */
function splitLongParagraph(paragraph: string, config: ChunkConfig): string[] {
  const approxTokens = (str: string) => Math.ceil(str.length / 4);

  // Split by sentences (simple approach)
  const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];

  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    const potentialChunk = currentChunk
      ? currentChunk + ' ' + trimmedSentence
      : trimmedSentence;

    if (approxTokens(potentialChunk) <= config.maxChunkSize) {
      currentChunk = potentialChunk;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      currentChunk = trimmedSentence;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Add overlap between chunks for context continuity
 */
function addOverlap(chunks: string[], overlapSize: number): string[] {
  if (chunks.length <= 1 || overlapSize === 0) {
    return chunks;
  }

  const approxTokens = (str: string) => Math.ceil(str.length / 4);
  const overlappedChunks: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];

    // Add end of previous chunk as prefix (if not first)
    if (i > 0) {
      const prevChunk = chunks[i - 1];
      const overlap = getOverlapText(prevChunk, overlapSize);
      if (overlap) {
        chunk = overlap + '... ' + chunk;
      }
    }

    overlappedChunks.push(chunk);
  }

  return overlappedChunks;
}

/**
 * Get the last N tokens worth of text for overlap
 */
function getOverlapText(text: string, overlapTokens: number): string {
  // Approximate characters for overlap
  const overlapChars = overlapTokens * 4;

  if (text.length <= overlapChars) {
    return text;
  }

  // Try to break at a sentence or word boundary
  const endPortion = text.slice(-overlapChars);

  // Find a good break point (sentence or word)
  const sentenceBreak = endPortion.search(/[.!?]\s+/);
  if (sentenceBreak > 0 && sentenceBreak < overlapChars / 2) {
    return endPortion.slice(sentenceBreak + 1).trim();
  }

  const wordBreak = endPortion.search(/\s+/);
  if (wordBreak > 0) {
    return endPortion.slice(wordBreak).trim();
  }

  return endPortion;
}

/**
 * Create a chunk object with ID and metadata
 */
function createChunk(
  url: string,
  index: number,
  text: string,
  baseMetadata: Omit<ChunkMetadata, 'chunk_text'>
): TextChunk {
  // Create a deterministic ID based on URL and content
  const id = generateChunkId(url, index, text);

  return {
    id,
    text,
    metadata: {
      ...baseMetadata,
      chunk_text: text,
    },
  };
}

/**
 * Generate a unique chunk ID
 */
function generateChunkId(url: string, index: number, text: string): string {
  // Create a simple hash of the content for uniqueness
  const urlHash = simpleHash(url);
  const contentHash = simpleHash(text.slice(0, 100));

  return `${urlHash}-${index}-${contentHash}`;
}

/**
 * Simple string hash function
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
