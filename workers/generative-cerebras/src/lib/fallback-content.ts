/**
 * Fallback Content Templates
 *
 * Provides safe, pre-approved content to serve when generated content
 * is blocked for safety reasons. All content follows Vitamix brand guidelines.
 */

import type { GeneratedContent, ContentBlock, LayoutDecision } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface FallbackContentConfig {
  headline: string;
  subheadline: string;
  blocks: ContentBlock[];
  meta: {
    title: string;
    description: string;
  };
  reason: string;
}

export type FallbackIntent =
  | 'recipe'
  | 'product'
  | 'support'
  | 'general'
  | 'comparison'
  | 'educational';

// ============================================================================
// Pre-approved Fallback Content Templates
// ============================================================================

const FALLBACK_TEMPLATES: Record<FallbackIntent, FallbackContentConfig> = {
  recipe: {
    headline: 'Explore Vitamix Recipes',
    subheadline: 'Discover delicious, healthy recipes crafted for your Vitamix',
    blocks: [
      {
        id: 'fallback-hero',
        type: 'hero',
        variant: 'centered',
        content: {
          headline: 'Explore Vitamix Recipes',
          subheadline: 'From smoothies to soups, discover endless possibilities with your Vitamix blender',
          ctaText: 'Browse All Recipes',
          ctaUrl: '/recipes',
          imagePrompt: 'Colorful array of fresh fruits, vegetables, and healthy smoothies on a clean kitchen counter',
        },
      },
      {
        id: 'fallback-text',
        type: 'text',
        variant: 'centered',
        content: {
          headline: 'Wholesome Recipes for Every Occasion',
          body: 'Whether you\'re starting your day with a nutrient-packed smoothie, preparing a warming soup for dinner, or crafting homemade nut butters, your Vitamix opens up a world of culinary possibilities. Explore our collection of chef-tested recipes designed to help you make the most of your blender.',
        },
      },
      {
        id: 'fallback-cta',
        type: 'cta',
        variant: 'primary',
        content: {
          headline: 'Ready to Get Started?',
          text: 'Visit vitamix.com for hundreds of tested recipes and cooking inspiration.',
          buttonText: 'Explore Recipes',
          buttonUrl: 'https://www.vitamix.com/us/en_us/recipes',
          ctaType: 'external',
        },
      },
    ],
    meta: {
      title: 'Vitamix Recipes - Discover Healthy Blending Ideas',
      description: 'Explore delicious, healthy recipes designed for your Vitamix blender. From smoothies to soups, discover endless possibilities.',
    },
    reason: 'content_safety_block',
  },

  product: {
    headline: 'Vitamix Blenders',
    subheadline: 'Professional-grade performance for your kitchen',
    blocks: [
      {
        id: 'fallback-hero',
        type: 'hero',
        variant: 'centered',
        content: {
          headline: 'Vitamix Blenders',
          subheadline: 'Experience professional-grade blending with our award-winning lineup of blenders',
          ctaText: 'Explore Products',
          ctaUrl: '/products',
          imagePrompt: 'Premium Vitamix blender on a modern kitchen counter with fresh ingredients',
        },
      },
      {
        id: 'fallback-text',
        type: 'text',
        variant: 'centered',
        content: {
          headline: 'Built to Last. Backed by Our Commitment.',
          body: 'Since 1921, Vitamix has been the trusted choice of home cooks and professional chefs alike. Every Vitamix blender is built to deliver consistent, reliable performance backed by our industry-leading warranty. From whole-food nutrition to culinary creativity, Vitamix empowers you to achieve your goals.',
        },
      },
      {
        id: 'fallback-cta',
        type: 'cta',
        variant: 'primary',
        content: {
          headline: 'Find Your Perfect Vitamix',
          text: 'Explore our full lineup of blenders and find the one that\'s right for you.',
          buttonText: 'Shop Now',
          buttonUrl: 'https://www.vitamix.com/us/en_us/shop',
          ctaType: 'shop',
        },
      },
    ],
    meta: {
      title: 'Vitamix Blenders - Professional-Grade Performance',
      description: 'Discover Vitamix blenders with professional-grade performance for your kitchen. Built to last with industry-leading warranty.',
    },
    reason: 'content_safety_block',
  },

  support: {
    headline: 'Vitamix Support',
    subheadline: 'We\'re here to help you get the most from your Vitamix',
    blocks: [
      {
        id: 'fallback-hero',
        type: 'hero',
        variant: 'centered',
        content: {
          headline: 'How Can We Help?',
          subheadline: 'Get support for your Vitamix blender',
          ctaText: 'Contact Support',
          ctaUrl: '/support',
          imagePrompt: 'Customer service representative helping with Vitamix blender',
        },
      },
      {
        id: 'fallback-text',
        type: 'text',
        variant: 'centered',
        content: {
          headline: 'Vitamix Customer Care',
          body: 'Our dedicated team is here to help you get the most from your Vitamix. Whether you need assistance with your blender, have questions about recipes, or want to learn more about our products, we\'re here to support you.',
        },
      },
      {
        id: 'fallback-cta',
        type: 'cta',
        variant: 'primary',
        content: {
          headline: 'Contact Us',
          text: 'Reach out to our customer care team for personalized assistance.',
          buttonText: 'Get Support',
          buttonUrl: 'https://www.vitamix.com/us/en_us/support',
          ctaType: 'external',
        },
      },
    ],
    meta: {
      title: 'Vitamix Support - Customer Care & Help',
      description: 'Get support for your Vitamix blender. Our customer care team is here to help.',
    },
    reason: 'content_safety_block',
  },

  comparison: {
    headline: 'Compare Vitamix Blenders',
    subheadline: 'Find the right Vitamix for your kitchen',
    blocks: [
      {
        id: 'fallback-hero',
        type: 'hero',
        variant: 'centered',
        content: {
          headline: 'Compare Vitamix Blenders',
          subheadline: 'Discover the features and capabilities that matter most to you',
          ctaText: 'View Comparison',
          ctaUrl: '/compare',
          imagePrompt: 'Multiple Vitamix blender models arranged on a kitchen counter',
        },
      },
      {
        id: 'fallback-text',
        type: 'text',
        variant: 'centered',
        content: {
          headline: 'Every Vitamix Delivers Professional Results',
          body: 'All Vitamix blenders share the same commitment to quality, durability, and performance. The differences lie in features like container sizes, preset programs, and smart connectivity. Compare our lineup to find the blender that best fits your lifestyle and cooking needs.',
        },
      },
      {
        id: 'fallback-cta',
        type: 'cta',
        variant: 'primary',
        content: {
          headline: 'Need Help Deciding?',
          text: 'Take our quiz to find the perfect Vitamix for you.',
          buttonText: 'Find My Blender',
          buttonUrl: 'https://www.vitamix.com/us/en_us/shop/blender-quiz',
          ctaType: 'external',
        },
      },
    ],
    meta: {
      title: 'Compare Vitamix Blenders - Find Your Perfect Match',
      description: 'Compare Vitamix blender models to find the right one for your kitchen. Professional-grade performance in every model.',
    },
    reason: 'content_safety_block',
  },

  educational: {
    headline: 'Vitamix Tips & Techniques',
    subheadline: 'Master your Vitamix with expert guidance',
    blocks: [
      {
        id: 'fallback-hero',
        type: 'hero',
        variant: 'centered',
        content: {
          headline: 'Tips & Techniques',
          subheadline: 'Learn how to get the most from your Vitamix blender',
          ctaText: 'Explore Tips',
          ctaUrl: '/tips',
          imagePrompt: 'Chef demonstrating blending technique with a Vitamix in a professional kitchen',
        },
      },
      {
        id: 'fallback-text',
        type: 'text',
        variant: 'centered',
        content: {
          headline: 'Unlock Your Vitamix Potential',
          body: 'From proper ingredient layering to advanced blending techniques, there\'s always more to discover with your Vitamix. Our expert guides and video tutorials help you master everything from silky-smooth smoothies to hot soups made right in your blender.',
        },
      },
      {
        id: 'fallback-cta',
        type: 'cta',
        variant: 'primary',
        content: {
          headline: 'Ready to Learn More?',
          text: 'Explore our complete library of tips, tutorials, and cooking guides.',
          buttonText: 'View All Tips',
          buttonUrl: 'https://www.vitamix.com/us/en_us/recipes/demo-videos',
          ctaType: 'external',
        },
      },
    ],
    meta: {
      title: 'Vitamix Tips & Techniques - Expert Blending Guidance',
      description: 'Master your Vitamix with expert tips and techniques. From smoothies to soups, learn how to get the most from your blender.',
    },
    reason: 'content_safety_block',
  },

  general: {
    headline: 'Welcome to Vitamix',
    subheadline: 'Professional-grade blending for every kitchen',
    blocks: [
      {
        id: 'fallback-hero',
        type: 'hero',
        variant: 'centered',
        content: {
          headline: 'Welcome to Vitamix',
          subheadline: 'Discover what\'s possible with professional-grade blending',
          ctaText: 'Explore',
          ctaUrl: '/',
          imagePrompt: 'Vitamix blender surrounded by fresh fruits and vegetables in a bright modern kitchen',
        },
      },
      {
        id: 'fallback-cards',
        type: 'cards',
        variant: 'grid-3',
        content: {
          cards: [
            {
              title: 'Recipes',
              description: 'Explore hundreds of delicious recipes from smoothies to soups',
              imagePrompt: 'Colorful smoothie in a glass with fresh berries',
              linkText: 'Browse Recipes',
              linkUrl: '/recipes',
            },
            {
              title: 'Products',
              description: 'Find the perfect Vitamix blender for your kitchen',
              imagePrompt: 'Premium Vitamix blender product shot',
              linkText: 'Shop Now',
              linkUrl: '/products',
            },
            {
              title: 'Support',
              description: 'Get help and tips for your Vitamix experience',
              imagePrompt: 'Friendly customer service representative',
              linkText: 'Get Help',
              linkUrl: '/support',
            },
          ],
        },
      },
      {
        id: 'fallback-text',
        type: 'text',
        variant: 'centered',
        content: {
          headline: 'Since 1921',
          body: 'For over 100 years, Vitamix has been the trusted choice of home cooks and professional chefs worldwide. Every blender we make is built to deliver consistent, reliable performance backed by our commitment to quality.',
        },
      },
    ],
    meta: {
      title: 'Vitamix - Professional-Grade Blenders',
      description: 'Welcome to Vitamix. Discover professional-grade blenders, delicious recipes, and expert support.',
    },
    reason: 'content_safety_block',
  },
};

// ============================================================================
// Fallback Content Functions
// ============================================================================

/**
 * Map intent type to fallback category
 */
function mapIntentToFallback(
  intentType: string
): FallbackIntent {
  switch (intentType) {
    case 'recipe':
      return 'recipe';
    case 'product_info':
      return 'product';
    case 'support':
      return 'support';
    case 'comparison':
      return 'comparison';
    default:
      return 'general';
  }
}

/**
 * Get fallback content for a blocked generation
 *
 * @param intentType - The original intent type from classification
 * @param blockReason - Why the content was blocked
 */
export function getFallbackContent(
  intentType: string,
  blockReason?: string
): GeneratedContent {
  const fallbackType = mapIntentToFallback(intentType);
  const template = FALLBACK_TEMPLATES[fallbackType];

  return {
    headline: template.headline,
    subheadline: template.subheadline,
    blocks: template.blocks,
    meta: {
      ...template.meta,
      // Add indicator that this is fallback content
      description: template.meta.description + ' [Fallback content]',
    },
    citations: [],
  };
}

/**
 * Get fallback layout decision matching the fallback content
 */
export function getFallbackLayout(
  intentType: string
): LayoutDecision {
  const fallbackType = mapIntentToFallback(intentType);
  const template = FALLBACK_TEMPLATES[fallbackType];

  return {
    blocks: template.blocks.map((block, index) => ({
      blockType: block.type,
      contentIndex: index,
      variant: block.variant || 'default',
      width: 'contained' as const,
      sectionStyle: index === 0 ? 'highlight' as const : 'default' as const,
    })),
  };
}

/**
 * Check if content is fallback content
 */
export function isFallbackContent(content: GeneratedContent): boolean {
  return content.meta.description.includes('[Fallback content]');
}

/**
 * Get all available fallback templates (for testing/documentation)
 */
export function getAllFallbackTemplates(): Record<FallbackIntent, FallbackContentConfig> {
  return FALLBACK_TEMPLATES;
}
