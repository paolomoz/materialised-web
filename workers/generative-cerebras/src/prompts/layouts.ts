/**
 * Layout Templates
 *
 * Predefined page layouts based on Vitamix design system.
 * Each layout defines the exact block structure for a page type.
 *
 * These templates ensure consistent, well-designed pages that:
 * - Match the vitamix.com visual patterns
 * - Work correctly with DA (Document Authoring)
 * - Render properly with our EDS blocks
 */

export interface BlockTemplate {
  type: 'hero' | 'cards' | 'columns' | 'split-content' | 'text' | 'cta' | 'faq'
    | 'benefits-grid' | 'recipe-cards' | 'product-recommendation' | 'tips-banner'
    | 'ingredient-search' | 'recipe-filter-bar' | 'recipe-grid' | 'quick-view-modal' | 'technique-spotlight'
    | 'support-hero' | 'diagnosis-card' | 'troubleshooting-steps' | 'support-cta'
    | 'comparison-table' | 'use-case-cards' | 'verdict-card' | 'comparison-cta'
    | 'product-hero' | 'specs-table' | 'feature-highlights' | 'included-accessories' | 'product-cta'
    | 'product-cards'
    // Single Recipe blocks
    | 'recipe-hero' | 'ingredients-list' | 'recipe-steps' | 'nutrition-facts' | 'recipe-tips'
    // Single Recipe Detail blocks (vitamix.com style)
    | 'recipe-hero-detail' | 'recipe-tabs' | 'recipe-sidebar' | 'recipe-directions'
    // Campaign Landing blocks
    | 'countdown-timer' | 'testimonials'
    // About/Story blocks
    | 'timeline' | 'team-cards';
  variant?: string;
  width?: 'full' | 'contained';
  config?: {
    itemCount?: number; // For cards, columns, faq, benefits-grid, recipe-cards, tips-banner, recipe-grid, troubleshooting-steps, comparison-table
    hasImage?: boolean;
    [key: string]: any;
  };
}

export interface SectionTemplate {
  style?: 'default' | 'highlight' | 'dark';
  blocks: BlockTemplate[];
}

export interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  useCases: string[];
  sections: SectionTemplate[];
}

/**
 * Layout 1: Product Detail
 * Matches vitamix.com product page structure:
 * - Split hero with product image + details
 * - Specs table grid
 * - Feature highlights with images
 * - Included accessories
 * - Product CTA
 */
export const LAYOUT_PRODUCT_DETAIL: LayoutTemplate = {
  id: 'product-detail',
  name: 'Product Detail',
  description: 'Detailed view of a single Vitamix product (matches vitamix.com)',
  useCases: [
    'Tell me about the A3500',
    'Vitamix Venturist features',
    'What can the Explorian do',
  ],
  sections: [
    {
      // Split hero with product image and details
      blocks: [
        { type: 'product-hero' },
      ],
    },
    {
      // Specs table grid
      style: 'highlight',
      blocks: [
        { type: 'specs-table', config: { itemCount: 8 } },
      ],
    },
    {
      // Feature highlights with images
      blocks: [
        { type: 'feature-highlights', config: { itemCount: 3, hasImage: true } },
      ],
    },
    {
      // Included accessories
      style: 'highlight',
      blocks: [
        { type: 'included-accessories', config: { itemCount: 4, hasImage: true } },
      ],
    },
    {
      // Product CTA
      style: 'dark',
      blocks: [
        { type: 'product-cta' },
      ],
    },
  ],
};

/**
 * Layout 2: Product Comparison
 * Side-by-side comparison of 2-5 Vitamix products with specs, recommendations, and verdict.
 */
export const LAYOUT_PRODUCT_COMPARISON: LayoutTemplate = {
  id: 'product-comparison',
  name: 'Product Comparison',
  description: 'Side-by-side comparison of 2-5 Vitamix products',
  useCases: [
    'A3500 vs A2500',
    'Compare Ascent models',
    'Which Vitamix should I buy',
    'Help me choose a blender',
    'Compare Vitamix blenders',
  ],
  sections: [
    {
      blocks: [
        { type: 'hero', variant: 'centered', config: { hasImage: false } },
      ],
    },
    {
      // Spec comparison grid with winner indicators
      style: 'highlight',
      blocks: [
        { type: 'comparison-table', config: { itemCount: 8 } },
      ],
    },
    {
      // Summary recommendation with per-product guidance
      style: 'highlight',
      blocks: [
        { type: 'verdict-card' },
      ],
    },
  ],
};

/**
 * Layout 3: Recipe Collection
 * Interactive recipe collection with filtering, search, and quick view modal.
 *
 * Uses specialized blocks:
 * - ingredient-search: AI-powered ingredient input with tag chips
 * - recipe-filter-bar: Difficulty slider + time filter buttons
 * - recipe-grid: Filterable cards with favorites toggle
 * - quick-view-modal: Recipe preview overlay (triggered by card click)
 * - technique-spotlight: 50/50 split with tips and video/image
 */
export const LAYOUT_RECIPE_COLLECTION: LayoutTemplate = {
  id: 'recipe-collection',
  name: 'Recipe Collection',
  description: 'Interactive recipe collection with filtering',
  useCases: [
    'Soup recipes',
    'Smoothie ideas',
    'Healthy breakfast recipes',
    'Recipes with bananas',
    'Quick dinner ideas',
  ],
  sections: [
    {
      // Hero section - full width with collection title
      blocks: [
        { type: 'hero', variant: 'full-width', width: 'full', config: { hasImage: true } },
      ],
    },
    {
      // Filter bar (sticky) - difficulty slider + time buttons
      blocks: [
        { type: 'recipe-filter-bar' },
      ],
    },
    {
      // Recipe grid - filterable cards with favorites
      blocks: [
        { type: 'recipe-grid', config: { itemCount: 6 } },
      ],
    },
    {
      // Technique spotlight - 50/50 split with tips
      style: 'dark',
      blocks: [
        { type: 'technique-spotlight', config: { hasImage: true } },
      ],
    },
    {
      // Quick view modal container (hidden, triggered by card clicks)
      blocks: [
        { type: 'quick-view-modal' },
      ],
    },
    {
      // CTA section
      style: 'highlight',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 3b: Recipe Invention
 * AI-powered recipe creation based on ingredients the user has on hand.
 * This layout is for when users want to INVENT new recipes, not find existing ones.
 *
 * Uses specialized blocks:
 * - ingredient-search: AI-powered ingredient input for recipe invention
 * - recipe-grid: Displays AI-generated recipe ideas based on ingredients
 * - tips-banner: Blending tips relevant to ingredient combinations
 */
export const LAYOUT_RECIPE_INVENTION: LayoutTemplate = {
  id: 'recipe-invention',
  name: 'Recipe Invention',
  description: 'AI-powered recipe creation from ingredients you have on hand',
  useCases: [
    'What can I make with bananas and spinach',
    'Invent a recipe with these ingredients',
    'I have carrots, apples and ginger - what can I blend',
    'Create a smoothie from what I have',
    'Make something with leftover vegetables',
    'What recipes can I create with milk, oats, and berries',
  ],
  sections: [
    {
      // Hero section - explains the ingredient-to-recipe concept
      blocks: [
        { type: 'hero', variant: 'centered', config: { hasImage: false } },
      ],
    },
    {
      // AI-powered ingredient search - the main interaction point
      style: 'highlight',
      blocks: [
        { type: 'ingredient-search' },
      ],
    },
    {
      // Recipe grid - shows AI-invented recipes based on ingredients
      blocks: [
        { type: 'recipe-grid', config: { itemCount: 4 } },
      ],
    },
    {
      // Tips for combining ingredients effectively
      style: 'highlight',
      blocks: [
        { type: 'tips-banner', config: { itemCount: 3 } },
      ],
    },
    {
      // Quick view modal container (hidden, triggered by card clicks)
      blocks: [
        { type: 'quick-view-modal' },
      ],
    },
    {
      // CTA to explore more recipes or products
      style: 'dark',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 4: Use Case Landing
 * Focused on a specific use case with recipes, tips, and product recommendation
 * Example: "I want to make smoothies every morning"
 *
 * Uses specialized blocks:
 * - benefits-grid: Icon-based benefit highlights (replaces generic columns)
 * - recipe-cards: Recipe cards with difficulty/time metadata (replaces generic cards)
 * - product-recommendation: 50/50 split product feature (replaces split-content)
 * - tips-banner: Numbered tips grid (replaces second columns block)
 */
export const LAYOUT_USE_CASE_LANDING: LayoutTemplate = {
  id: 'use-case-landing',
  name: 'Use Case Landing',
  description: 'Landing page for a specific use case with recipes, tips, and product',
  useCases: [
    'I want to make smoothies every morning',
    'Best smoothie for energy',
    'Making baby food at home',
    'Meal prep for the week',
  ],
  sections: [
    {
      // Hero section - full width with dark overlay
      blocks: [
        { type: 'hero', variant: 'full-width', width: 'full', config: { hasImage: true } },
      ],
    },
    {
      // Benefits section - icon-based feature highlights
      blocks: [
        { type: 'benefits-grid', config: { itemCount: 3 } },
      ],
    },
    {
      // Recipe cards with metadata (difficulty, time)
      blocks: [
        { type: 'recipe-cards', config: { itemCount: 3 } },
      ],
    },
    {
      // Product recommendation - 50/50 split with product details
      style: 'highlight',
      blocks: [
        { type: 'product-recommendation', variant: 'reverse', config: { hasImage: true } },
      ],
    },
    {
      // Tips section - numbered tips grid
      blocks: [
        { type: 'tips-banner', config: { itemCount: 3 } },
      ],
    },
    {
      // CTA section
      style: 'dark',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 5: Support/Troubleshooting (Enhanced)
 *
 * Specialized support layout with empathetic design:
 * - support-hero: Acknowledges the user's issue with icon
 * - diagnosis-card: Color-coded severity assessment (minor/moderate/serious)
 * - troubleshooting-steps: Numbered step-by-step fix instructions
 * - faq: Common questions about the issue
 * - support-cta: Dual CTAs for escalation (contact support + order parts)
 */
export const LAYOUT_SUPPORT: LayoutTemplate = {
  id: 'support',
  name: 'Support & Troubleshooting',
  description: 'Empathetic troubleshooting with step-by-step guidance',
  useCases: [
    'My Vitamix is making a grinding noise',
    'How to fix leaking',
    'Blender not turning on',
    'Vitamix smells like burning',
    'Container won\'t lock in place',
  ],
  sections: [
    {
      // Support hero - empathetic, text-focused with icon
      blocks: [
        { type: 'support-hero' },
      ],
    },
    {
      // Diagnosis card - quick severity assessment
      style: 'highlight',
      blocks: [
        { type: 'diagnosis-card', config: { itemCount: 3 } },
      ],
    },
    {
      // Troubleshooting steps - numbered instructions
      blocks: [
        { type: 'troubleshooting-steps', config: { itemCount: 3, hasImage: true } },
      ],
    },
    {
      // FAQ - common questions about the issue
      style: 'highlight',
      blocks: [
        { type: 'faq', config: { itemCount: 4 } },
      ],
    },
    {
      // Support CTA - dual escalation options
      style: 'dark',
      blocks: [
        { type: 'support-cta' },
      ],
    },
  ],
};

/**
 * Layout 6: Category Browse
 * Browse products in a category with specialized product cards
 */
export const LAYOUT_CATEGORY_BROWSE: LayoutTemplate = {
  id: 'category-browse',
  name: 'Category Browse',
  description: 'Browse products in a category with product cards',
  useCases: [
    'Show me all blenders',
    'Vitamix accessories',
    'Container options',
  ],
  sections: [
    {
      blocks: [
        { type: 'hero', variant: 'centered', config: { hasImage: false } },
      ],
    },
    {
      // Product grid with images, prices, ratings
      blocks: [
        { type: 'product-cards', config: { itemCount: 4 } },
      ],
    },
    {
      // Benefits/features of the category
      style: 'highlight',
      blocks: [
        { type: 'benefits-grid', config: { itemCount: 3 } },
      ],
    },
    {
      style: 'dark',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 7: Educational/How-To
 * Step-by-step instructions or educational content
 */
export const LAYOUT_EDUCATIONAL: LayoutTemplate = {
  id: 'educational',
  name: 'Educational / How-To',
  description: 'Educational content with steps and tips',
  useCases: [
    'How to clean my Vitamix',
    'Blending techniques',
    'How to make nut butter',
  ],
  sections: [
    {
      blocks: [
        { type: 'hero', variant: 'split', config: { hasImage: true } },
      ],
    },
    {
      blocks: [
        { type: 'text' },
      ],
    },
    {
      style: 'highlight',
      blocks: [
        { type: 'columns', config: { itemCount: 3 } },
      ],
    },
    {
      blocks: [
        { type: 'faq', config: { itemCount: 4 } },
      ],
    },
    {
      style: 'dark',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 8: Promotional
 * Sales, offers, and promotional content
 */
export const LAYOUT_PROMOTIONAL: LayoutTemplate = {
  id: 'promotional',
  name: 'Promotional',
  description: 'Sales and promotional content',
  useCases: [
    'Vitamix deals',
    'Current promotions',
    'Best value blender',
  ],
  sections: [
    {
      style: 'dark',
      blocks: [
        { type: 'hero', variant: 'full-width', width: 'full', config: { hasImage: true } },
      ],
    },
    {
      blocks: [
        { type: 'cards', config: { itemCount: 3 } },
      ],
    },
    {
      style: 'highlight',
      blocks: [
        { type: 'split-content', config: { hasImage: true } },
      ],
    },
    {
      style: 'dark',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 9: Quick Answer
 * Simple, direct answer to a question
 */
export const LAYOUT_QUICK_ANSWER: LayoutTemplate = {
  id: 'quick-answer',
  name: 'Quick Answer',
  description: 'Direct answer to a simple question',
  useCases: [
    'What is the warranty',
    'Vitamix return policy',
    'Where is Vitamix made',
  ],
  sections: [
    {
      blocks: [
        { type: 'hero', variant: 'light', config: { hasImage: false } },
      ],
    },
    {
      blocks: [
        { type: 'text' },
      ],
    },
    {
      style: 'highlight',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 10: Lifestyle/Inspiration
 * Inspirational content about healthy living
 */
export const LAYOUT_LIFESTYLE: LayoutTemplate = {
  id: 'lifestyle',
  name: 'Lifestyle & Inspiration',
  description: 'Inspirational content about healthy living with Vitamix',
  useCases: [
    'Healthy eating tips',
    'Whole food nutrition',
    'Kitchen wellness',
  ],
  sections: [
    {
      blocks: [
        { type: 'hero', variant: 'full-width', width: 'full', config: { hasImage: true } },
      ],
    },
    {
      blocks: [
        { type: 'cards', config: { itemCount: 3 } },
      ],
    },
    {
      style: 'highlight',
      blocks: [
        { type: 'split-content', variant: 'reverse', config: { hasImage: true } },
      ],
    },
    {
      blocks: [
        { type: 'columns', config: { itemCount: 3 } },
      ],
    },
    {
      style: 'dark',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 11: Single Recipe
 * Detailed recipe page matching vitamix.com design with:
 * - Split hero with dish image, title, rating, metadata icons
 * - Tab navigation (recipe, nutrition, related, reviews)
 * - Two-column content: sidebar (actions, container size, nutrition) + main (ingredients, directions)
 * - CTA at the end
 *
 * Uses specialized blocks:
 * - recipe-hero-detail: Split hero with image left, title/rating/metadata/dietary right
 * - recipe-tabs: Tab navigation bar with cook mode toggle
 * - recipe-sidebar: Left sidebar with actions, container size selector, nutrition facts
 * - ingredients-list: Ingredients with Imperial/Metric unit toggle
 * - recipe-directions: Numbered step-by-step directions with circular indicators
 * - cta: Final call-to-action
 */
export const LAYOUT_SINGLE_RECIPE: LayoutTemplate = {
  id: 'single-recipe',
  name: 'Single Recipe',
  description: 'Detailed recipe page with sidebar, ingredients, directions, and nutrition',
  useCases: [
    'How to make tomato soup',
    'Green smoothie recipe',
    'Vitamix banana ice cream recipe',
    'Show me a hummus recipe',
    'Apple acorn squash soup recipe',
  ],
  sections: [
    {
      // Recipe hero with dish image, title, metadata icons
      blocks: [
        { type: 'recipe-hero-detail', config: { hasImage: true } },
      ],
    },
    {
      // Main content area: sidebar + ingredients + directions
      // CSS will create 2-column layout with sidebar on left
      blocks: [
        { type: 'recipe-sidebar' },
        { type: 'ingredients-list' },
        { type: 'recipe-directions', config: { itemCount: 3 } },
      ],
    },
    {
      // CTA section
      style: 'dark',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 12: Campaign Landing
 * Seasonal or event-specific promotional campaigns.
 *
 * Uses specialized blocks:
 * - hero: Full-width campaign hero
 * - countdown-timer: Urgency-building countdown
 * - product-cards: Featured products
 * - testimonials: Customer quotes
 * - cta: Campaign call-to-action
 */
export const LAYOUT_CAMPAIGN_LANDING: LayoutTemplate = {
  id: 'campaign-landing',
  name: 'Campaign Landing',
  description: 'Seasonal or event-specific promotional campaigns',
  useCases: [
    'Mother\'s Day gifts',
    'Holiday blender deals',
    'Valentine\'s Day recipes',
    'Black Friday Vitamix',
    'Summer smoothie campaign',
  ],
  sections: [
    {
      // Campaign hero - full width with event imagery
      style: 'dark',
      blocks: [
        { type: 'hero', variant: 'full-width', width: 'full', config: { hasImage: true } },
      ],
    },
    {
      // Countdown timer - urgency builder
      style: 'highlight',
      blocks: [
        { type: 'countdown-timer' },
      ],
    },
    {
      // Featured products for the campaign
      blocks: [
        { type: 'product-cards', config: { itemCount: 3 } },
      ],
    },
    {
      // Customer testimonials
      style: 'highlight',
      blocks: [
        { type: 'testimonials', config: { itemCount: 3, hasImage: true } },
      ],
    },
    {
      // Campaign CTA
      style: 'dark',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * Layout 13: About / Brand Story
 * Brand story, company history, values, and mission.
 *
 * Uses specialized blocks:
 * - hero: Brand story hero
 * - text: Company mission/vision
 * - timeline: Company history milestones
 * - benefits-grid: Company values (repurposed)
 * - team-cards: Leadership team
 * - cta: Join/connect CTA
 */
export const LAYOUT_ABOUT_STORY: LayoutTemplate = {
  id: 'about-story',
  name: 'About / Brand Story',
  description: 'Brand story, company history, values, and mission',
  useCases: [
    'Vitamix history',
    'About Vitamix',
    'Who makes Vitamix',
    'Vitamix company story',
    'Vitamix brand values',
  ],
  sections: [
    {
      // Brand hero
      blocks: [
        { type: 'hero', variant: 'full-width', width: 'full', config: { hasImage: true } },
      ],
    },
    {
      // Mission statement
      blocks: [
        { type: 'text' },
      ],
    },
    {
      // Company timeline
      style: 'highlight',
      blocks: [
        { type: 'timeline', config: { itemCount: 5 } },
      ],
    },
    {
      // Company values - using benefits-grid with values focus
      blocks: [
        { type: 'benefits-grid', config: { itemCount: 4 } },
      ],
    },
    {
      // Leadership team
      style: 'highlight',
      blocks: [
        { type: 'team-cards', config: { itemCount: 4, hasImage: true } },
      ],
    },
    {
      // Connect CTA
      style: 'dark',
      blocks: [
        { type: 'cta' },
      ],
    },
  ],
};

/**
 * All available layouts
 */
export const LAYOUTS: LayoutTemplate[] = [
  LAYOUT_PRODUCT_DETAIL,
  LAYOUT_PRODUCT_COMPARISON,
  LAYOUT_RECIPE_COLLECTION,
  LAYOUT_RECIPE_INVENTION,
  LAYOUT_USE_CASE_LANDING,
  LAYOUT_SUPPORT,
  LAYOUT_CATEGORY_BROWSE,
  LAYOUT_EDUCATIONAL,
  LAYOUT_PROMOTIONAL,
  LAYOUT_QUICK_ANSWER,
  LAYOUT_LIFESTYLE,
  LAYOUT_SINGLE_RECIPE,
  LAYOUT_CAMPAIGN_LANDING,
  LAYOUT_ABOUT_STORY,
];

/**
 * Get layout by ID
 */
export function getLayoutById(id: string): LayoutTemplate | undefined {
  return LAYOUTS.find((layout) => layout.id === id);
}

// ============================================================================
// Semantic Pattern Matching (replaces brittle keyword includes)
// ============================================================================

/** Patterns indicating a use-case/routine-focused query */
const USE_CASE_PATTERNS = [
  /every\s+(morning|day|week|night|evening)/i,
  /daily\s+(routine|habit|use|smoothie|juice)/i,
  /(morning|evening|breakfast|lunch|dinner)\s+routine/i,
  /meal\s+prep/i,
  /for\s+(breakfast|lunch|dinner)\s+(every|daily|each)/i,
  /\b(weekly|daily)\s+(meal|food|nutrition)/i,
  /start\s+(my|the|your)\s+(day|morning)/i,
  /each\s+(morning|day|week)/i,
];

/** Patterns indicating a single specific recipe request */
const SINGLE_RECIPE_PATTERNS = [
  /how\s+(do\s+i|to|can\s+i)\s+make/i,
  /recipe\s+for\s+\w+/i,
  /make\s+(a|me|some)\s+\w+/i,
  /\w+\s+recipe$/i,  // ends with "recipe" (e.g., "hummus recipe")
  /show\s+me\s+(a|the)\s+\w+\s+recipe/i,
];

/** Patterns indicating recipe INVENTION from ingredients (not finding existing recipes) */
const RECIPE_INVENTION_PATTERNS = [
  /what\s+can\s+i\s+(make|blend|create)\s+with/i,
  /invent\s+(a|me)?\s*recipe/i,
  /create\s+(a|me)?\s*(new|custom)?\s*(recipe|smoothie|soup|blend)/i,
  /i\s+have\s+[\w\s,]+\s*([-–]|and)\s*what\s+can/i,  // "I have X, Y and Z - what can I..."
  /(make|blend)\s+something\s+(with|from|using)/i,
  /what\s+(recipes?|smoothies?|soups?)\s+can\s+i\s+(create|make|invent)\s+with/i,
  /leftover\s+\w+.*what\s+can/i,  // "leftover vegetables what can I make"
  /using\s+(what\s+i\s+have|these\s+ingredients|my\s+ingredients)/i,
  /from\s+(what\s+i\s+have|my\s+ingredients)/i,
];

/** Patterns indicating campaign/seasonal content */
const CAMPAIGN_PATTERNS = [
  /mother'?s?\s*day/i,
  /father'?s?\s*day/i,
  /valentine'?s?\s*(day)?/i,
  /black\s*friday/i,
  /cyber\s*monday/i,
  /(christmas|holiday|thanksgiving)\s*(gift|deal|sale|special)?/i,
  /(summer|winter|spring|fall)\s+(sale|special|campaign|collection)/i,
  /\b(gift\s+guide|gift\s+ideas?)\b/i,
  /\bseasonal\s+(offer|deal|special)/i,
];

/** Patterns indicating brand/about content */
const ABOUT_PATTERNS = [
  /\b(vitamix|company|brand)\s*(history|story|heritage)/i,
  /\babout\s+(vitamix|the\s+company|us)\b/i,
  /\b(who|what)\s+(makes?|is)\s+vitamix/i,
  /\b(our|vitamix)\s+(values|mission|vision)\b/i,
  /\bfounded|founder|origins?\b/i,
];

function matchesPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

/** Known Vitamix product names (lowercase for matching) */
const KNOWN_PRODUCTS = [
  'a3500', 'a2500', 'a2300',           // Ascent Series
  'e310', 'e320',                       // Explorian Series
  'pro 750', 'pro750', 'pro 500', 'pro500',  // Professional Series
  '5200', '5300', '7500',               // Legacy Series
  'immersion blender',                  // Immersion
];

/**
 * Check if query is a bare product name (just the product, nothing else)
 * This catches queries like "a3500" or "A3500" or "pro 750"
 */
function isBareProductQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return KNOWN_PRODUCTS.some(product =>
    normalized === product ||
    normalized === `the ${product}` ||
    normalized === `vitamix ${product}`
  );
}

// ============================================================================
// Layout Selection
// ============================================================================

/**
 * Get layout for intent type
 * Maps intent types to appropriate layouts
 *
 * Priority:
 * 0. Bare product query always → product-detail (highest priority override)
 * 1. Trust LLM's layoutId if confidence >= 0.85
 * 2. Apply rule-based fallback logic for edge cases
 */
export function getLayoutForIntent(
  intentType: string,
  contentTypes: string[],
  entities: { products: string[]; goals: string[]; ingredients?: string[] },
  llmLayoutId?: string,
  confidence?: number,
  originalQuery?: string
): LayoutTemplate {
  // 0a. HIGHEST PRIORITY: Bare product query always gets product-detail
  // This catches "a3500", "A3500", "the A3500", "Vitamix A3500" etc.
  if (originalQuery && isBareProductQuery(originalQuery)) {
    console.log(`[Layout] Override: bare product query "${originalQuery}" → product-detail`);
    return LAYOUT_PRODUCT_DETAIL;
  }

  // 0b. Defensive override: Single product in entities should not be comparison
  if (entities.products.length === 1 &&
      (llmLayoutId === 'product-comparison' || intentType === 'comparison')) {
    console.log('[Layout] Override: single product detected → product-detail (not comparison)');
    return LAYOUT_PRODUCT_DETAIL;
  }

  // 1. Trust LLM's layout choice when confident
  if (llmLayoutId && confidence !== undefined && confidence >= 0.85) {
    const llmLayout = getLayoutById(llmLayoutId);
    if (llmLayout) {
      console.log(`[Layout] Trusting LLM choice: ${llmLayoutId} (confidence: ${confidence})`);
      return llmLayout;
    }
  }

  // 2. Fallback: Rule-based logic for low confidence or invalid layout
  console.log(`[Layout] Using rule-based fallback (LLM confidence: ${confidence ?? 'N/A'})`);

  const goalsText = entities.goals.map((g) => g.toLowerCase()).join(' ');

  // Support/troubleshooting queries
  if (intentType === 'support') {
    return LAYOUT_SUPPORT;
  }

  // Product comparison queries
  // But if only 1 product is detected, it's likely a single product query misclassified
  if (intentType === 'comparison') {
    if (entities.products.length === 1) {
      console.log('[Layout] Demoting comparison → product-detail (only 1 product detected)');
      return LAYOUT_PRODUCT_DETAIL;
    }
    return LAYOUT_PRODUCT_COMPARISON;
  }

  // Single product queries
  if (intentType === 'product_info' && entities.products.length === 1) {
    return LAYOUT_PRODUCT_DETAIL;
  }

  // Category browsing
  if (intentType === 'product_info' && entities.products.length === 0) {
    return LAYOUT_CATEGORY_BROWSE;
  }

  // Recipe queries - use semantic patterns instead of includes()
  if (intentType === 'recipe') {
    // Check for recipe INVENTION patterns (user wants to create new recipes from ingredients)
    // This must come before other recipe patterns to catch "what can I make with..." queries
    if (matchesPatterns(goalsText, RECIPE_INVENTION_PATTERNS) ||
        (originalQuery && matchesPatterns(originalQuery.toLowerCase(), RECIPE_INVENTION_PATTERNS))) {
      console.log('[Layout] Recipe invention query detected → recipe-invention');
      return LAYOUT_RECIPE_INVENTION;
    }

    // Check for specific recipe request patterns
    if (matchesPatterns(goalsText, SINGLE_RECIPE_PATTERNS) ||
        (entities.ingredients && entities.ingredients.length >= 2)) {
      return LAYOUT_SINGLE_RECIPE;
    }

    // Check for use-case/routine patterns
    if (matchesPatterns(goalsText, USE_CASE_PATTERNS)) {
      return LAYOUT_USE_CASE_LANDING;
    }

    return LAYOUT_RECIPE_COLLECTION;
  }

  // Campaign/promotional queries - use semantic patterns
  if (matchesPatterns(goalsText, CAMPAIGN_PATTERNS)) {
    return LAYOUT_CAMPAIGN_LANDING;
  }

  // About/brand story queries - use semantic patterns
  if (intentType === 'general' && matchesPatterns(goalsText, ABOUT_PATTERNS)) {
    return LAYOUT_ABOUT_STORY;
  }

  // Educational/how-to queries
  if (contentTypes.includes('support') || contentTypes.includes('editorial')) {
    return LAYOUT_EDUCATIONAL;
  }

  // Default to lifestyle for general queries
  return LAYOUT_LIFESTYLE;
}

// ============================================================================
// Post-RAG Layout Adjustment
// ============================================================================

/**
 * Adjust layout based on RAG retrieval results
 * Called after RAG to ensure layout matches available content
 */
export function adjustLayoutForRAGContent(
  layout: LayoutTemplate,
  ragContext: {
    hasProductInfo: boolean;
    hasRecipes: boolean;
    chunks: Array<{ metadata: { content_type: string } }>;
  },
  originalQuery?: string
): LayoutTemplate {
  const productCount = ragContext.chunks.filter(
    c => c.metadata.content_type === 'product'
  ).length;
  const recipeCount = ragContext.chunks.filter(
    c => c.metadata.content_type === 'recipe'
  ).length;

  // If we chose single-recipe but found no recipes, fall back to educational
  if (layout.id === 'single-recipe' && recipeCount === 0) {
    console.log('[Layout Adjust] single-recipe → educational (no recipes in RAG)');
    return LAYOUT_EDUCATIONAL;
  }

  // If we chose recipe-collection but found no recipes, fall back to lifestyle
  if (layout.id === 'recipe-collection' && recipeCount === 0) {
    console.log('[Layout Adjust] recipe-collection → lifestyle (no recipes in RAG)');
    return LAYOUT_LIFESTYLE;
  }

  // If we chose product-detail but found multiple products, switch to comparison
  // UNLESS the query is a bare product name - then user wants that specific product
  if (layout.id === 'product-detail' && productCount > 1) {
    // Don't override if user asked for a specific product by name
    if (originalQuery && isBareProductQuery(originalQuery)) {
      console.log('[Layout Adjust] Keeping product-detail (bare product query, ignoring multiple RAG products)');
    } else {
      console.log('[Layout Adjust] product-detail → product-comparison (multiple products in RAG)');
      return LAYOUT_PRODUCT_COMPARISON;
    }
  }

  // If we chose product-detail but found no products, fall back to category-browse
  if (layout.id === 'product-detail' && productCount === 0) {
    console.log('[Layout Adjust] product-detail → category-browse (no products in RAG)');
    return LAYOUT_CATEGORY_BROWSE;
  }

  // If we chose category-browse but found only 1 product, switch to product-detail
  if (layout.id === 'category-browse' && productCount === 1) {
    console.log('[Layout Adjust] category-browse → product-detail (single product in RAG)');
    return LAYOUT_PRODUCT_DETAIL;
  }

  return layout;
}

/**
 * Convert LayoutTemplate to LayoutDecision
 * This creates the block mapping used for HTML generation
 */
export type BlockType = 'hero' | 'cards' | 'columns' | 'split-content' | 'text' | 'cta' | 'faq'
  | 'benefits-grid' | 'recipe-cards' | 'product-recommendation' | 'tips-banner'
  | 'ingredient-search' | 'recipe-filter-bar' | 'recipe-grid' | 'quick-view-modal' | 'technique-spotlight'
  | 'support-hero' | 'diagnosis-card' | 'troubleshooting-steps' | 'support-cta'
  | 'comparison-table' | 'use-case-cards' | 'verdict-card' | 'comparison-cta'
  | 'product-hero' | 'specs-table' | 'feature-highlights' | 'included-accessories' | 'product-cta'
  | 'product-cards'
  // Single Recipe blocks
  | 'recipe-hero' | 'ingredients-list' | 'recipe-steps' | 'nutrition-facts' | 'recipe-tips'
  // Campaign Landing blocks
  | 'countdown-timer' | 'testimonials'
  // About/Story blocks
  | 'timeline' | 'team-cards';

export function templateToLayoutDecision(layout: LayoutTemplate): {
  blocks: Array<{
    blockType: BlockType;
    contentIndex: number;
    variant: string;
    width: 'full' | 'contained';
    sectionStyle?: 'default' | 'highlight' | 'dark';
  }>;
} {
  let contentIndex = 0;
  const blocks: Array<{
    blockType: BlockType;
    contentIndex: number;
    variant: string;
    width: 'full' | 'contained';
    sectionStyle?: 'default' | 'highlight' | 'dark';
  }> = [];

  for (const section of layout.sections) {
    for (const block of section.blocks) {
      blocks.push({
        blockType: block.type,
        contentIndex,
        variant: block.variant || 'default',
        width: block.width || 'contained',
        sectionStyle: section.style,
      });
      contentIndex++;
    }
  }

  return { blocks };
}

/**
 * Format layout template for LLM prompt
 */
export function formatLayoutForPrompt(layout: LayoutTemplate): string {
  const sectionsDesc = layout.sections.map((section, i) => {
    const sectionStyle = section.style ? ` (${section.style} background)` : '';
    const blocksDesc = section.blocks.map((block) => {
      let desc = `- ${block.type}`;
      if (block.variant) desc += ` (${block.variant})`;
      if (block.config?.itemCount) desc += ` - ${block.config.itemCount} items`;
      if (block.config?.hasImage) desc += ` - with image`;
      return desc;
    }).join('\n    ');
    return `Section ${i + 1}${sectionStyle}:\n    ${blocksDesc}`;
  }).join('\n\n');

  return `
Layout: ${layout.name}
ID: ${layout.id}
Description: ${layout.description}

Structure:
${sectionsDesc}
`.trim();
}
