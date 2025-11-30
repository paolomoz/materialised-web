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
    | 'ingredient-search' | 'recipe-filter-bar' | 'recipe-grid' | 'quick-view-modal' | 'technique-spotlight';
  variant?: string;
  width?: 'full' | 'contained';
  config?: {
    itemCount?: number; // For cards, columns, faq, benefits-grid, recipe-cards, tips-banner, recipe-grid
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
 * Single product focus with specs, features, and FAQ
 */
export const LAYOUT_PRODUCT_DETAIL: LayoutTemplate = {
  id: 'product-detail',
  name: 'Product Detail',
  description: 'Detailed view of a single Vitamix product',
  useCases: [
    'Tell me about the A3500',
    'Vitamix Venturist features',
    'What can the Explorian do',
  ],
  sections: [
    {
      blocks: [
        { type: 'hero', variant: 'split', width: 'full', config: { hasImage: true } },
      ],
    },
    {
      blocks: [
        { type: 'columns', variant: 'highlight', config: { itemCount: 3 } },
      ],
    },
    {
      blocks: [
        { type: 'text' },
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
 * Layout 2: Product Comparison
 * Side-by-side comparison of 2-3 products
 */
export const LAYOUT_PRODUCT_COMPARISON: LayoutTemplate = {
  id: 'product-comparison',
  name: 'Product Comparison',
  description: 'Compare multiple Vitamix products',
  useCases: [
    'A3500 vs A2500',
    'Compare Ascent models',
    'Which Vitamix should I buy',
  ],
  sections: [
    {
      blocks: [
        { type: 'hero', variant: 'centered', config: { hasImage: false } },
      ],
    },
    {
      blocks: [
        { type: 'columns', variant: 'highlight', config: { itemCount: 2 } },
      ],
    },
    {
      blocks: [
        { type: 'cards', config: { itemCount: 2 } },
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
 * Layout 5: Support/Troubleshooting
 * Help content with FAQ focus
 */
export const LAYOUT_SUPPORT: LayoutTemplate = {
  id: 'support',
  name: 'Support & Troubleshooting',
  description: 'Help and troubleshooting content',
  useCases: [
    'My Vitamix is making a grinding noise',
    'How to fix leaking',
    'Blender not turning on',
  ],
  sections: [
    {
      blocks: [
        { type: 'hero', variant: 'light', config: { hasImage: false } },
      ],
    },
    {
      blocks: [
        { type: 'faq', config: { itemCount: 5 } },
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
 * Layout 6: Category Browse
 * Browse products in a category
 */
export const LAYOUT_CATEGORY_BROWSE: LayoutTemplate = {
  id: 'category-browse',
  name: 'Category Browse',
  description: 'Browse products in a category',
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
      blocks: [
        { type: 'cards', config: { itemCount: 4 } },
      ],
    },
    {
      style: 'highlight',
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
  entities: { products: string[]; goals: string[] }
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
  | 'ingredient-search' | 'recipe-filter-bar' | 'recipe-grid' | 'quick-view-modal' | 'technique-spotlight';

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
