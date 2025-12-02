/**
 * Retrieval Strategy Planner
 *
 * Analyzes queries to determine the optimal retrieval strategy.
 * Different query types need different approaches:
 * - Catalog browsing: Get all items, dedupe by product
 * - Ingredient search: Semantic + boost matching ingredients
 * - Comparison: Get comprehensive product data
 * - Filtered: Semantic + metadata filters
 * - Semantic: Pure embedding similarity (default)
 */

import type { ContentType, IntentClassification } from '../types';

/**
 * Retrieval strategies for different query types
 */
export type RetrievalStrategy =
  | 'semantic'       // Pure embedding similarity (default)
  | 'catalog'        // Get all items in category, dedupe by item
  | 'filtered'       // Semantic + metadata filters
  | 'comprehensive'  // Get ALL items of a type for comparison
  | 'ingredient';    // Semantic with ingredient boost

/**
 * Deduplication modes
 */
export type DedupeMode = 'similarity' | 'by-sku' | 'by-url';

/**
 * The retrieval plan produced by the planner
 */
export interface RetrievalPlan {
  strategy: RetrievalStrategy;

  // Query modification
  semanticQuery: string;  // What to embed (may differ from original)

  // Vectorize parameters
  topK: number;           // How many to fetch (higher for catalog)
  relevanceThreshold: number;
  filters: {
    contentTypes?: ContentType[];
    productCategory?: string;
    recipeCategory?: string;
  };

  // Post-processing
  dedupeMode: DedupeMode;
  maxResults: number;

  // For ingredient queries - terms to boost in results
  boostTerms?: string[];

  // Debug info
  reasoning: string;
}

/**
 * Common ingredient list for extraction
 */
const COMMON_INGREDIENTS = [
  // Fruits
  'banana', 'apple', 'orange', 'mango', 'pineapple', 'strawberry', 'blueberry',
  'raspberry', 'blackberry', 'peach', 'pear', 'grape', 'watermelon', 'lemon',
  'lime', 'avocado', 'coconut', 'cherry', 'kiwi', 'papaya', 'acai', 'date',
  // Vegetables
  'spinach', 'kale', 'carrot', 'celery', 'cucumber', 'tomato', 'beet', 'ginger',
  'garlic', 'onion', 'pepper', 'broccoli', 'cauliflower', 'zucchini', 'squash',
  'sweet potato', 'potato', 'pumpkin', 'corn',
  // Proteins & Dairy
  'milk', 'yogurt', 'protein', 'almond milk', 'oat milk', 'soy milk', 'cheese',
  'cream', 'butter', 'egg', 'chicken', 'tofu',
  // Nuts & Seeds
  'almond', 'cashew', 'walnut', 'peanut', 'chia', 'flax', 'hemp', 'sunflower',
  // Other
  'oat', 'honey', 'maple', 'chocolate', 'cocoa', 'coffee', 'matcha', 'vanilla',
  'cinnamon', 'turmeric', 'ice',
];

/**
 * Product category mappings
 */
const PRODUCT_CATEGORIES: Record<string, string> = {
  blender: 'blender',
  blenders: 'blender',
  mixer: 'blender',
  container: 'container',
  containers: 'container',
  accessory: 'accessory',
  accessories: 'accessory',
  attachment: 'accessory',
  attachments: 'accessory',
  blade: 'accessory',
  blades: 'accessory',
  cup: 'container',
  cups: 'container',
  bowl: 'container',
  bowls: 'container',
};

/**
 * Recipe category mappings
 */
const RECIPE_CATEGORIES: Record<string, string> = {
  smoothie: 'smoothie',
  smoothies: 'smoothie',
  shake: 'smoothie',
  shakes: 'smoothie',
  soup: 'soup',
  soups: 'soup',
  sauce: 'sauce',
  sauces: 'sauce',
  dip: 'dip',
  dips: 'dip',
  dessert: 'dessert',
  desserts: 'dessert',
  'ice cream': 'dessert',
  sorbet: 'dessert',
  breakfast: 'breakfast',
  baby: 'baby food',
  'baby food': 'baby food',
  juice: 'juice',
  juices: 'juice',
  cocktail: 'cocktail',
  cocktails: 'cocktail',
  drink: 'drink',
  drinks: 'drink',
  butter: 'nut butter',
  'nut butter': 'nut butter',
  'peanut butter': 'nut butter',
  'almond butter': 'nut butter',
  dough: 'dough',
  batter: 'batter',
  flour: 'flour',
  hummus: 'dip',
  pesto: 'sauce',
  salsa: 'sauce',
  puree: 'puree',
};

/**
 * Analyze query and plan retrieval strategy
 */
export function planRetrieval(
  query: string,
  intent: IntentClassification
): RetrievalPlan {
  const lowerQuery = query.toLowerCase();

  // Pattern 1: Catalog browsing ("all blenders", "show me blenders")
  if (isCatalogQuery(lowerQuery, intent)) {
    const productCategory = extractProductCategory(lowerQuery);
    return {
      strategy: 'catalog',
      // Use category in semantic query (metadata filters not reliably indexed)
      semanticQuery: productCategory
        ? `vitamix ${productCategory} products models`
        : 'vitamix blender products models',
      topK: 50,
      relevanceThreshold: 0.5, // Lower threshold for catalog
      filters: {
        contentTypes: ['product'],
        // Note: productCategory not used as filter - not reliably in metadata
      },
      dedupeMode: 'by-sku',
      maxResults: 12,
      reasoning: `Catalog query detected. Semantic search for "${productCategory || 'blender'}" products, deduping by SKU.`,
    };
  }

  // Pattern 2: Comparison/recommendation ("best for me", "which should I")
  if (isComparisonQuery(lowerQuery, intent)) {
    return {
      strategy: 'comprehensive',
      semanticQuery: buildComparisonQuery(lowerQuery, intent),
      topK: 30,
      relevanceThreshold: 0.5,
      filters: {
        contentTypes: ['product'],
      },
      dedupeMode: 'by-sku',
      maxResults: 10,
      reasoning: 'Comparison query detected. Getting comprehensive product data for comparison.',
    };
  }

  // Pattern 3: Ingredient-based recipe search
  const ingredients = extractIngredients(lowerQuery);
  if (ingredients.length > 0 && intent.intentType === 'recipe') {
    const recipeCategory = extractRecipeCategory(lowerQuery);
    return {
      strategy: 'ingredient',
      // Include category in semantic query (not as filter - metadata not reliable)
      semanticQuery: `vitamix recipes with ${ingredients.join(' and ')}${recipeCategory ? ` ${recipeCategory}` : ''}`,
      topK: 25,
      relevanceThreshold: 0.55, // Lower threshold for ingredient searches
      filters: {
        contentTypes: ['recipe'],
        // Note: recipeCategory not used as filter - not reliably in metadata
      },
      dedupeMode: 'by-url',
      maxResults: 8,
      boostTerms: ingredients,
      reasoning: `Ingredient query detected. Searching for recipes with: ${ingredients.join(', ')}. Will boost results containing these ingredients.`,
    };
  }

  // Pattern 4: Recipe with category constraints ("baby soup", "quick breakfast smoothie")
  if (intent.intentType === 'recipe') {
    const recipeCategory = extractRecipeCategory(lowerQuery);
    return {
      strategy: 'filtered',
      // Include category in semantic query (not as filter)
      semanticQuery: recipeCategory ? `vitamix ${recipeCategory} recipes ${query}` : query,
      topK: 20,
      relevanceThreshold: 0.6, // Slightly lower for recipes
      filters: {
        contentTypes: ['recipe'],
        // Note: recipeCategory not used as filter - not reliably in metadata
      },
      dedupeMode: 'by-url',
      maxResults: 8,
      reasoning: `Recipe query with semantic search for "${recipeCategory || 'recipes'}".`,
    };
  }

  // Pattern 5: Support/troubleshooting - need comprehensive results
  if (intent.intentType === 'support') {
    return {
      strategy: 'filtered',
      semanticQuery: expandSupportQuery(query),
      topK: 15,
      relevanceThreshold: 0.65,
      filters: {
        contentTypes: ['support', 'product'],
      },
      dedupeMode: 'by-url',
      maxResults: 6,
      reasoning: 'Support query. Searching support docs and product info.',
    };
  }

  // Pattern 6: Single product info
  if (intent.intentType === 'product_info' && intent.entities.products.length === 1) {
    const product = intent.entities.products[0];
    return {
      strategy: 'filtered',
      semanticQuery: `${product} vitamix blender features specifications`,
      topK: 15,
      relevanceThreshold: 0.6,
      filters: {
        contentTypes: ['product'],
      },
      dedupeMode: 'similarity',
      maxResults: 5,
      reasoning: `Single product query for "${product}".`,
    };
  }

  // Default: Pure semantic search
  return {
    strategy: 'semantic',
    semanticQuery: expandQuery(query),
    topK: 10,
    relevanceThreshold: 0.7,
    filters: {
      contentTypes: intent.contentTypes,
    },
    dedupeMode: 'similarity',
    maxResults: 5,
    reasoning: 'Default semantic search.',
  };
}

/**
 * Check if query is asking for a catalog/listing
 */
function isCatalogQuery(query: string, intent: IntentClassification): boolean {
  const catalogPatterns = [
    /\ball\b\s+(?:the\s+)?(?:vitamix\s+)?(blenders?|products?|models?|containers?|accessories)/i,
    /show\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?(?:vitamix\s+)?(blenders?|products?|models?)/i,
    /list\s+(?:of\s+)?(?:all\s+)?(?:vitamix\s+)?(blenders?|products?|models?)/i,
    /what\s+(blenders?|products?|models?|options?)\s+(?:do\s+you\s+have|are\s+available)/i,
    /(?:vitamix\s+)?(blenders?|products?)\s+(?:you\s+have|available|lineup|range|selection)/i,
    /browse\s+(?:all\s+)?(?:vitamix\s+)?(blenders?|products?)/i,
    /see\s+all\s+(blenders?|products?|models?)/i,
  ];

  if (catalogPatterns.some((p) => p.test(query))) {
    return true;
  }

  // Also check if intent suggests category browsing with no specific products
  return (
    intent.layoutId === 'category-browse' &&
    intent.entities.products.length === 0
  );
}

/**
 * Check if query is asking for comparison/recommendation
 */
function isComparisonQuery(query: string, intent: IntentClassification): boolean {
  const comparisonPatterns = [
    /best\s+(?:vitamix\s+)?(?:blender\s+)?(?:for\s+me|for\s+my)/i,
    /which\s+(?:vitamix\s+)?(?:blender\s+)?(?:should|would|do\s+you)/i,
    /help\s+me\s+(?:choose|pick|decide|select)/i,
    /recommend\s+(?:a\s+)?(?:vitamix|blender)/i,
    /what\s+(?:vitamix|blender)\s+(?:should\s+i|do\s+you\s+recommend)/i,
    /compare\s+(?:vitamix\s+)?(?:blenders?|models?|all)/i,
    /difference\s+between/i,
    /vs\.?\s+|\bversus\b/i,
  ];

  if (comparisonPatterns.some((p) => p.test(query))) {
    return true;
  }

  return intent.intentType === 'comparison';
}

/**
 * Extract product category from query
 */
function extractProductCategory(query: string): string | undefined {
  for (const [term, category] of Object.entries(PRODUCT_CATEGORIES)) {
    if (query.includes(term)) {
      return category;
    }
  }
  return undefined;
}

/**
 * Extract recipe category from query
 */
function extractRecipeCategory(query: string): string | undefined {
  for (const [term, category] of Object.entries(RECIPE_CATEGORIES)) {
    if (query.includes(term)) {
      return category;
    }
  }
  return undefined;
}

/**
 * Extract ingredients from query
 */
function extractIngredients(query: string): string[] {
  const found: string[] = [];

  // Check for explicit ingredient patterns
  const explicitPatterns = [
    /(?:with|using|containing|has|have)\s+([\w\s,]+?)(?:\s+recipes?|\s+smoothies?|\s+ideas?|$)/i,
    /recipes?\s+(?:with|for|using)\s+([\w\s,]+)/i,
    /([\w\s,]+?)\s+(?:recipes?|smoothies?|ideas?)/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = query.match(pattern);
    if (match) {
      const ingredientText = match[1].toLowerCase();
      // Split by common separators
      const parts = ingredientText.split(/[,\s]+and\s+|,\s*|\s+and\s+/);
      for (const part of parts) {
        const trimmed = part.trim();
        if (COMMON_INGREDIENTS.includes(trimmed)) {
          found.push(trimmed);
        }
      }
    }
  }

  // Also check for direct ingredient mentions
  if (found.length === 0) {
    for (const ingredient of COMMON_INGREDIENTS) {
      if (query.includes(ingredient)) {
        found.push(ingredient);
      }
    }
  }

  return [...new Set(found)]; // Dedupe
}

/**
 * Build optimized query for comparison searches
 */
function buildComparisonQuery(query: string, intent: IntentClassification): string {
  const products = intent.entities.products;
  const goals = intent.entities.goals;

  if (products.length >= 2) {
    return `compare ${products.join(' vs ')} vitamix blender features specifications`;
  }

  if (goals.length > 0) {
    return `best vitamix blender for ${goals.join(' ')}`;
  }

  return 'vitamix blender comparison features specifications models';
}

/**
 * Expand support/troubleshooting queries
 */
function expandSupportQuery(query: string): string {
  const expansions: Record<string, string> = {
    noise: 'grinding noise loud sound troubleshooting',
    leak: 'leaking dripping seal gasket troubleshooting',
    'won\'t turn on': 'not turning on power issue troubleshooting',
    'doesn\'t start': 'not starting power issue troubleshooting',
    smoke: 'smoking burning smell overheating troubleshooting',
    smell: 'burning smell odor troubleshooting',
    stuck: 'stuck jammed blade troubleshooting',
    clean: 'cleaning maintenance wash care',
    warranty: 'warranty coverage repair service',
  };

  let expanded = query;
  for (const [term, expansion] of Object.entries(expansions)) {
    if (query.toLowerCase().includes(term)) {
      expanded = `${query} ${expansion}`;
      break;
    }
  }

  return expanded;
}

/**
 * Basic query expansion (moved from rag.ts for reuse)
 */
function expandQuery(query: string): string {
  const expansions: Record<string, string[]> = {
    blender: ['blenders', 'vitamix'],
    smoothie: ['smoothies', 'shake', 'blend'],
    soup: ['soups', 'hot soup', 'blended soup'],
    recipe: ['recipes', 'how to make'],
    clean: ['cleaning', 'wash', 'maintenance'],
  };

  let expandedQuery = query;

  for (const [term, synonyms] of Object.entries(expansions)) {
    if (query.toLowerCase().includes(term)) {
      const synonym = synonyms[0];
      if (!query.toLowerCase().includes(synonym)) {
        expandedQuery += ` ${synonym}`;
      }
      break;
    }
  }

  return expandedQuery;
}
