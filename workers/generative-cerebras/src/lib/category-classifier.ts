import type { IntentClassification } from '../types';

/**
 * Category paths for generated content.
 * Maps intent types to semantic URL categories.
 */
export type CategoryPath =
  | 'smoothies'
  | 'recipes'
  | 'products'
  | 'compare'
  | 'tips'
  | 'discover';

/**
 * Keywords that indicate smoothie-specific content
 */
const SMOOTHIE_KEYWORDS = [
  'smoothie',
  'smoothies',
  'shake',
  'shakes',
  'blend',
  'blended',
  'juice',
  'juices',
  'frozen drink',
  'protein shake',
  'green drink',
];

/**
 * Classify query into a URL category based on intent and content
 */
export function classifyCategory(
  intent: IntentClassification,
  query: string
): CategoryPath {
  const queryLower = query.toLowerCase();

  // Recipe intent - check for smoothie subcategory
  if (intent.intentType === 'recipe') {
    if (SMOOTHIE_KEYWORDS.some((k) => queryLower.includes(k))) {
      return 'smoothies';
    }
    return 'recipes';
  }

  // Map other intent types to categories
  const categoryMap: Record<string, CategoryPath> = {
    product_info: 'products',
    comparison: 'compare',
    support: 'tips',
    general: 'discover',
  };

  return categoryMap[intent.intentType] || 'discover';
}

/**
 * All valid category routes the worker should handle
 */
export const CATEGORY_ROUTES = [
  '/smoothies/',
  '/recipes/',
  '/products/',
  '/compare/',
  '/tips/',
  '/discover/',
] as const;

/**
 * Check if a pathname matches a category route
 */
export function isCategoryPath(pathname: string): boolean {
  return CATEGORY_ROUTES.some((route) => pathname.startsWith(route));
}

/**
 * Extract category from a path
 */
export function getCategoryFromPath(pathname: string): CategoryPath | null {
  for (const route of CATEGORY_ROUTES) {
    if (pathname.startsWith(route)) {
      return route.slice(1, -1) as CategoryPath; // Remove leading/trailing slashes
    }
  }
  return null;
}

/**
 * Generate a semantic slug from query and intent entities.
 * Uses extracted entities (products, ingredients, goals) to create
 * meaningful URL slugs like "spinach-banana-energy".
 */
export function generateSemanticSlug(
  query: string,
  intent: IntentClassification
): string {
  // Try to build slug from entities first
  const concepts = [
    ...intent.entities.ingredients.slice(0, 2),
    ...intent.entities.goals.slice(0, 1),
    ...intent.entities.products.slice(0, 1),
  ].filter(Boolean);

  let baseSlug: string;

  if (concepts.length >= 2) {
    // Use entities for semantic slug
    baseSlug = concepts
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .substring(0, 50);
  } else {
    // Fall back to extracting keywords from query
    baseSlug = extractKeywords(query).slice(0, 4).join('-').substring(0, 50);
  }

  // Add short hash for uniqueness
  const hash = simpleHash(query + Date.now()).slice(0, 6);
  return `${baseSlug}-${hash}`;
}

/**
 * Extract meaningful keywords from a query string
 */
function extractKeywords(query: string): string[] {
  // Common stop words to filter out
  const stopWords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'is', 'it', 'as', 'be', 'this', 'that',
    'are', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do',
    'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'can', 'what', 'how', 'why', 'when', 'where', 'which', 'who',
    'my', 'your', 'me', 'i', 'we', 'you', 'make', 'get', 'want', 'need',
    'like', 'best', 'good', 'great', 'some', 'any', 'please', 'help',
  ]);

  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.has(word))
    .slice(0, 6);
}

/**
 * Simple hash function for generating unique suffixes
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Build the full categorized path for generated content
 */
export function buildCategorizedPath(
  category: CategoryPath,
  slug: string
): string {
  return `/${category}/${slug}`;
}
