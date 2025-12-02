/**
 * Content Provenance Tracker
 *
 * Tracks the source of generated content to determine:
 * - How much content comes from RAG vs AI generation
 * - Whether recipes are from Vitamix sources or AI-invented
 * - Attribution and citation accuracy
 */

import type { GeneratedContent, RAGContext, RAGChunk, ContentBlock } from '../types';

// ============================================================================
// Types
// ============================================================================

export type ContentSource = 'rag' | 'generated' | 'hybrid';

export type RecipeSource =
  | 'vitamix_official'   // Exact match to vitamix.com recipe
  | 'rag_adapted'        // Based on RAG but modified
  | 'ai_generated'       // No RAG source, fully generated
  | 'unknown';           // Unable to determine

export interface RAGChunkAttribution {
  chunkId: string;
  sourceUrl: string;
  relevanceScore: number;
  contentType: string;
  pageTitle: string;
  textSample: string;          // First 100 chars of chunk text
}

export interface BlockProvenance {
  blockId: string;
  blockType: string;
  source: ContentSource;
  ragContribution: number;     // 0-100 percentage
  ragChunks: RAGChunkAttribution[];
  generatedFields: string[];   // Fields with no RAG match
}

export interface RecipeProvenance {
  recipeName: string;
  source: RecipeSource;
  originalUrl?: string;
  matchScore?: number;         // Similarity to original (0-1)
  adaptations: string[];       // What was changed from original
  ingredientsFromRag: string[];
  ingredientsGenerated: string[];
}

export interface ContentProvenance {
  generatedAt: string;
  query: string;
  overall: {
    source: ContentSource;
    ragContribution: number;   // 0-100 average across all blocks
    ragChunksUsed: number;
    ragSourceUrls: string[];
  };
  blocks: BlockProvenance[];
  recipes: RecipeProvenance[];
  metadata: {
    intentType: string;
    layoutId: string;
    ragQuality: string;
    totalBlocks: number;
    recipeBlocks: number;
  };
}

// ============================================================================
// Text Similarity Utilities
// ============================================================================

/**
 * Simple Jaccard similarity for text comparison
 * Returns 0-1 score based on word overlap
 */
function textSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2);

  const words1 = new Set(normalize(text1));
  const words2 = new Set(normalize(text2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Find the best matching RAG chunk for a piece of text
 */
function findBestRAGMatch(
  text: string,
  ragChunks: RAGChunk[]
): { chunk: RAGChunk | null; similarity: number } {
  if (!text || ragChunks.length === 0) {
    return { chunk: null, similarity: 0 };
  }

  let bestMatch: RAGChunk | null = null;
  let bestScore = 0;

  for (const chunk of ragChunks) {
    const similarity = textSimilarity(text, chunk.text);
    if (similarity > bestScore) {
      bestScore = similarity;
      bestMatch = chunk;
    }
  }

  return { chunk: bestMatch, similarity: bestScore };
}

// ============================================================================
// Block Provenance Analysis
// ============================================================================

/**
 * Extract text content from a block for analysis
 */
function extractBlockText(block: ContentBlock): string[] {
  const texts: string[] = [];
  const content = block.content as any;

  // Direct text fields
  if (content.headline) texts.push(content.headline);
  if (content.subheadline) texts.push(content.subheadline);
  if (content.body) texts.push(content.body);
  if (content.text) texts.push(content.text);
  if (content.description) texts.push(content.description);

  // Array fields
  if (content.cards) {
    for (const card of content.cards) {
      if (card.title) texts.push(card.title);
      if (card.description) texts.push(card.description);
    }
  }
  if (content.recipes) {
    for (const recipe of content.recipes) {
      if (recipe.title) texts.push(recipe.title);
      if (recipe.description) texts.push(recipe.description);
    }
  }
  if (content.items) {
    for (const item of content.items) {
      if (item.question) texts.push(item.question);
      if (item.answer) texts.push(item.answer);
    }
  }
  if (content.steps) {
    for (const step of content.steps) {
      if (step.title) texts.push(step.title);
      if (step.description) texts.push(step.description);
      if (step.instruction) texts.push(step.instruction);
    }
  }
  if (content.features) {
    for (const feature of content.features) {
      if (feature.title) texts.push(feature.title);
      if (feature.description) texts.push(feature.description);
    }
  }

  return texts.filter(Boolean);
}

/**
 * Analyze provenance for a single block
 */
function analyzeBlockProvenance(
  block: ContentBlock,
  ragChunks: RAGChunk[]
): BlockProvenance {
  const texts = extractBlockText(block);
  const ragChunksUsed: RAGChunkAttribution[] = [];
  const generatedFields: string[] = [];
  const usedChunkIds = new Set<string>();

  let totalSimilarity = 0;
  let fieldCount = 0;

  for (const text of texts) {
    const { chunk, similarity } = findBestRAGMatch(text, ragChunks);

    if (chunk && similarity > 0.3) {
      // Significant RAG contribution
      if (!usedChunkIds.has(chunk.id)) {
        usedChunkIds.add(chunk.id);
        ragChunksUsed.push({
          chunkId: chunk.id,
          sourceUrl: chunk.metadata.source_url,
          relevanceScore: similarity,
          contentType: chunk.metadata.content_type,
          pageTitle: chunk.metadata.page_title,
          textSample: chunk.text.slice(0, 100) + (chunk.text.length > 100 ? '...' : ''),
        });
      }
      totalSimilarity += similarity;
    } else {
      // Likely generated
      generatedFields.push(text.slice(0, 50));
    }
    fieldCount++;
  }

  const ragContribution = fieldCount > 0
    ? Math.round((totalSimilarity / fieldCount) * 100)
    : 0;

  const source: ContentSource =
    ragContribution >= 70 ? 'rag' :
    ragContribution >= 30 ? 'hybrid' :
    'generated';

  return {
    blockId: block.id,
    blockType: block.type,
    source,
    ragContribution,
    ragChunks: ragChunksUsed,
    generatedFields: generatedFields.slice(0, 5), // Limit to first 5
  };
}

// ============================================================================
// Recipe Provenance Analysis
// ============================================================================

/**
 * Check if a block is a recipe block
 */
function isRecipeBlock(blockType: string): boolean {
  return [
    'recipe-cards',
    'recipe-grid',
    'recipe-hero',
    'recipe-hero-detail',
    'ingredients-list',
    'recipe-steps',
    'recipe-directions',
    'recipe-tabs',
    'recipe-sidebar',
  ].includes(blockType);
}

/**
 * Extract recipe names from a block
 */
function extractRecipeNames(block: ContentBlock): string[] {
  const content = block.content as any;
  const names: string[] = [];

  if (content.title) names.push(content.title);
  if (content.recipeName) names.push(content.recipeName);
  if (content.recipes) {
    for (const recipe of content.recipes) {
      if (recipe.title) names.push(recipe.title);
      if (recipe.name) names.push(recipe.name);
    }
  }

  return names.filter(Boolean);
}

/**
 * Find matching Vitamix recipe in RAG context
 */
function findMatchingRecipe(
  recipeName: string,
  ragChunks: RAGChunk[]
): { chunk: RAGChunk | null; score: number } {
  const recipeChunks = ragChunks.filter(c => c.metadata.content_type === 'recipe');

  if (recipeChunks.length === 0) {
    return { chunk: null, score: 0 };
  }

  let bestChunk: RAGChunk | null = null;
  let bestScore = 0;

  for (const chunk of recipeChunks) {
    // Check title similarity
    const titleSimilarity = textSimilarity(recipeName, chunk.metadata.page_title);

    // Also check text content
    const textSimilarity2 = textSimilarity(recipeName, chunk.text);

    const score = Math.max(titleSimilarity, textSimilarity2 * 0.8);

    if (score > bestScore) {
      bestScore = score;
      bestChunk = chunk;
    }
  }

  return { chunk: bestChunk, score: bestScore };
}

/**
 * Analyze recipe provenance
 */
function analyzeRecipeProvenance(
  recipeName: string,
  block: ContentBlock,
  ragChunks: RAGChunk[]
): RecipeProvenance {
  const { chunk, score } = findMatchingRecipe(recipeName, ragChunks);
  const content = block.content as any;

  // Determine source based on match score
  let source: RecipeSource;
  if (chunk && score >= 0.85) {
    source = 'vitamix_official';
  } else if (chunk && score >= 0.5) {
    source = 'rag_adapted';
  } else if (chunk && score >= 0.3) {
    source = 'rag_adapted';
  } else {
    source = 'ai_generated';
  }

  // Extract ingredients if available
  const ingredientsFromRag: string[] = [];
  const ingredientsGenerated: string[] = [];

  if (content.ingredients && Array.isArray(content.ingredients)) {
    for (const ingredient of content.ingredients) {
      const ingredientText = typeof ingredient === 'string' ? ingredient : ingredient.name || ingredient.item;
      if (!ingredientText) continue;

      // Check if this ingredient appears in RAG
      const inRAG = ragChunks.some(c =>
        c.text.toLowerCase().includes(ingredientText.toLowerCase().split(' ')[0])
      );

      if (inRAG) {
        ingredientsFromRag.push(ingredientText);
      } else {
        ingredientsGenerated.push(ingredientText);
      }
    }
  }

  // Detect adaptations (things that differ from original)
  const adaptations: string[] = [];
  if (source === 'rag_adapted' && chunk) {
    if (content.servings && !chunk.text.includes(String(content.servings))) {
      adaptations.push('Modified serving size');
    }
    if (content.prepTime && !chunk.text.toLowerCase().includes('prep')) {
      adaptations.push('Added prep time');
    }
    if (ingredientsGenerated.length > 0) {
      adaptations.push(`Added ${ingredientsGenerated.length} ingredient(s)`);
    }
  }

  return {
    recipeName,
    source,
    originalUrl: chunk?.metadata.source_url,
    matchScore: score,
    adaptations,
    ingredientsFromRag,
    ingredientsGenerated,
  };
}

// ============================================================================
// Main Provenance Tracking
// ============================================================================

/**
 * Analyze full content provenance
 */
export function analyzeContentProvenance(
  content: GeneratedContent,
  ragContext: RAGContext,
  query: string,
  intentType: string,
  layoutId: string
): ContentProvenance {
  const blocks: BlockProvenance[] = [];
  const recipes: RecipeProvenance[] = [];
  const allRagChunks = ragContext.chunks;

  // Analyze each block
  for (const block of content.blocks) {
    const blockProv = analyzeBlockProvenance(block, allRagChunks);
    blocks.push(blockProv);

    // Check for recipes in recipe blocks
    if (isRecipeBlock(block.type)) {
      const recipeNames = extractRecipeNames(block);
      for (const name of recipeNames) {
        const recipeProv = analyzeRecipeProvenance(name, block, allRagChunks);
        // Avoid duplicates
        if (!recipes.some(r => r.recipeName === name)) {
          recipes.push(recipeProv);
        }
      }
    }
  }

  // Calculate overall metrics
  const totalRagContribution = blocks.length > 0
    ? Math.round(blocks.reduce((sum, b) => sum + b.ragContribution, 0) / blocks.length)
    : 0;

  const ragSourceUrls = [...new Set(
    blocks.flatMap(b => b.ragChunks.map(c => c.sourceUrl))
  )];

  const overallSource: ContentSource =
    totalRagContribution >= 70 ? 'rag' :
    totalRagContribution >= 30 ? 'hybrid' :
    'generated';

  return {
    generatedAt: new Date().toISOString(),
    query,
    overall: {
      source: overallSource,
      ragContribution: totalRagContribution,
      ragChunksUsed: ragContext.chunks.length,
      ragSourceUrls,
    },
    blocks,
    recipes,
    metadata: {
      intentType,
      layoutId,
      ragQuality: ragContext.quality,
      totalBlocks: blocks.length,
      recipeBlocks: blocks.filter(b => isRecipeBlock(b.blockType)).length,
    },
  };
}

/**
 * Get a summary of content provenance for logging
 */
export function getProvenanceSummary(provenance: ContentProvenance): {
  overallSource: ContentSource;
  ragPercentage: number;
  recipeBreakdown: Record<RecipeSource, number>;
  sourceUrls: string[];
} {
  const recipeBreakdown: Record<RecipeSource, number> = {
    vitamix_official: 0,
    rag_adapted: 0,
    ai_generated: 0,
    unknown: 0,
  };

  for (const recipe of provenance.recipes) {
    recipeBreakdown[recipe.source]++;
  }

  return {
    overallSource: provenance.overall.source,
    ragPercentage: provenance.overall.ragContribution,
    recipeBreakdown,
    sourceUrls: provenance.overall.ragSourceUrls,
  };
}

/**
 * Check if any recipes are AI-generated (for warnings)
 */
export function hasAIGeneratedRecipes(provenance: ContentProvenance): boolean {
  return provenance.recipes.some(r => r.source === 'ai_generated');
}

/**
 * Get AI-generated recipe names for labeling
 */
export function getAIGeneratedRecipeNames(provenance: ContentProvenance): string[] {
  return provenance.recipes
    .filter(r => r.source === 'ai_generated')
    .map(r => r.recipeName);
}
