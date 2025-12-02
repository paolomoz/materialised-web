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
  description: 'Interactive recipe collection with filtering and AI-powered ingredient search',
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
      // AI-powered ingredient search
      style: 'highlight',
      blocks: [
        { type: 'ingredient-search' },
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
 * Detailed view of a single recipe with ingredients, steps, nutrition, and tips.
 *
 * Uses specialized blocks:
 * - recipe-hero: Full-width hero with dish image and recipe metadata
 * - ingredients-list: Two-column ingredient list
 * - recipe-steps: Step-by-step instructions with optional images
 * - nutrition-facts: Nutrition information grid
 * - recipe-tips: Pro tips and variations
 * - recipe-cards: Related recipes
 */
export const LAYOUT_SINGLE_RECIPE: LayoutTemplate = {
  id: 'single-recipe',
  name: 'Single Recipe',
  description: 'Detailed view of a single recipe with ingredients, steps, and nutrition',
  useCases: [
    'How to make tomato soup',
    'Green smoothie recipe',
    'Vitamix banana ice cream recipe',
    'Show me a hummus recipe',
  ],
  sections: [
    {
      // Recipe hero with dish image and metadata
      blocks: [
        { type: 'recipe-hero', config: { hasImage: true } },
      ],
    },
    {
      // Ingredients list - two columns
      style: 'highlight',
      blocks: [
        { type: 'ingredients-list' },
      ],
    },
    {
      // Step-by-step instructions
      blocks: [
        { type: 'recipe-steps', config: { itemCount: 5, hasImage: true } },
      ],
    },
    {
      // Nutrition facts
      style: 'highlight',
      blocks: [
        { type: 'nutrition-facts' },
      ],
    },
    {
      // Pro tips and variations
      blocks: [
        { type: 'recipe-tips', config: { itemCount: 3 } },
      ],
    },
    {
      // Related recipes
      style: 'highlight',
      blocks: [
        { type: 'recipe-cards', config: { itemCount: 3 } },
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

/**
 * Get layout for intent type
 * Maps intent types to appropriate layouts
 */
export function getLayoutForIntent(
  intentType: string,
  contentTypes: string[],
  entities: { products: string[]; goals: string[]; ingredients?: string[] }
): LayoutTemplate {
  // Support/troubleshooting queries
  if (intentType === 'support') {
    return LAYOUT_SUPPORT;
  }

  // Product comparison queries
  if (intentType === 'comparison') {
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

  // Recipe queries
  if (intentType === 'recipe') {
    // Check for specific recipe indicators (single recipe page)
    const singleRecipeIndicators = ['how to make', 'recipe for', 'make a', 'make me'];
    const goalsLower = entities.goals.map((g) => g.toLowerCase()).join(' ');

    // If query has specific recipe keywords and mentions specific ingredients, it's likely a single recipe
    if (singleRecipeIndicators.some((ind) => goalsLower.includes(ind)) ||
        (entities.ingredients && entities.ingredients.length >= 2)) {
      return LAYOUT_SINGLE_RECIPE;
    }

    // If it's a use-case oriented query (morning routine, meal prep, etc.)
    if (entities.goals.some((g) =>
      g.includes('morning') ||
      g.includes('daily') ||
      g.includes('routine') ||
      g.includes('every') ||
      g.includes('prep')
    )) {
      return LAYOUT_USE_CASE_LANDING;
    }
    return LAYOUT_RECIPE_COLLECTION;
  }

  // Campaign/promotional queries (check before general)
  const campaignKeywords = [
    'mother\'s day', 'mothers day', 'father\'s day', 'fathers day',
    'holiday', 'christmas', 'valentine', 'black friday', 'cyber monday',
    'summer', 'winter', 'spring', 'fall', 'seasonal', 'gift', 'campaign',
  ];
  const goalsLower = entities.goals.map((g) => g.toLowerCase()).join(' ');
  if (campaignKeywords.some((kw) => goalsLower.includes(kw))) {
    return LAYOUT_CAMPAIGN_LANDING;
  }

  // About/brand story queries
  const aboutKeywords = ['history', 'about', 'company', 'brand', 'story', 'heritage', 'values', 'mission'];
  if (intentType === 'general' && aboutKeywords.some((kw) => goalsLower.includes(kw))) {
    return LAYOUT_ABOUT_STORY;
  }

  // Educational/how-to queries
  if (contentTypes.includes('support') || contentTypes.includes('editorial')) {
    return LAYOUT_EDUCATIONAL;
  }

  // Default to lifestyle for general queries
  return LAYOUT_LIFESTYLE;
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
