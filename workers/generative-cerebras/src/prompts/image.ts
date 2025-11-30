/**
 * Image Generation Prompts
 *
 * Templates and utilities for generating Vitamix brand-consistent images
 */

/**
 * Base Vitamix image style guidelines
 */
const VITAMIX_IMAGE_STYLE = `
Style: Professional food photography, modern kitchen setting
Lighting: Bright, natural light with soft shadows
Color palette: Clean whites, fresh greens, vibrant produce colors
Atmosphere: Aspirational, healthy lifestyle, premium quality
Camera: High-quality DSLR, sharp focus on subject
Composition: Rule of thirds, clean backgrounds, shallow depth of field
Focus on food and ingredients only, no appliances or products
`;

/**
 * Size-specific style additions
 */
const SIZE_STYLES: Record<string, string> = {
  hero: `
    Wide cinematic composition
    Dramatic but inviting atmosphere
    Strong visual impact
    Space for text overlay consideration
  `,
  card: `
    Square or 4:3 composition
    Clean, product-focused framing
    Single subject or small group
    Eye-catching but not overwhelming
  `,
  column: `
    Vertical or horizontal balance
    Lifestyle context
    Supporting imagery role
    Complements text content
  `,
  thumbnail: `
    Clear at small sizes
    Simple composition
    High contrast
    Recognizable subject
  `,
};

/**
 * Content type specific prompts
 */
const CONTENT_TYPE_PROMPTS: Record<string, string> = {
  recipe: `
    Finished dish beautifully plated, overhead or 45-degree angle shot
    Fresh ingredients artfully arranged on table
    Natural daylight streaming through window
    Appetizing presentation, restaurant quality
    Garnishes and textures visible
    Tight framing on food and plate only, no appliances in frame
  `,
  product: `
    Clean studio lighting
    Product as hero, sharp focus
    Subtle gradient background
    Professional product photography
    Highlighting design and quality
  `,
  lifestyle: `
    Modern kitchen environment
    Person preparing healthy food (optional)
    Morning light atmosphere
    Premium, aspirational setting
    Family or wellness context
  `,
  smoothie: `
    Colorful smoothie in clear glass, close-up shot
    Fresh ingredients scattered nearby on counter
    Droplets of condensation for freshness
    Vibrant colors (greens, berries, tropical)
    Tight crop on glass and ingredients, nothing else in frame
    No appliances visible, food only photography
  `,
  soup: `
    Steaming hot soup in white bowl
    Garnish on top (herbs, cream swirl)
    Warm, cozy atmosphere
    Wooden cutting board with ingredients
    Comfort food appeal
  `,
};

/**
 * Build a complete image prompt with all style guidance
 */
export function buildImagePrompt(basePrompt: string, size: string): string {
  // Determine content type from prompt keywords
  const contentType = detectContentType(basePrompt);

  const parts = [
    // Base description from the content generation
    basePrompt,

    // Add size-specific styling
    SIZE_STYLES[size] || SIZE_STYLES.card,

    // Add content-type specific guidance
    CONTENT_TYPE_PROMPTS[contentType] || '',

    // Add base Vitamix style
    VITAMIX_IMAGE_STYLE,

    // Quality and format instructions
    'Professional photography, high resolution, 4K quality',
    'No text, logos, or watermarks in the image',
    'Photorealistic, not illustration or cartoon',
  ];

  return parts.filter(Boolean).join('\n\n');
}

/**
 * Detect content type from prompt text
 */
function detectContentType(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('smoothie') || lowerPrompt.includes('shake') || lowerPrompt.includes('blend')) {
    return 'smoothie';
  }

  if (lowerPrompt.includes('soup') || lowerPrompt.includes('hot') || lowerPrompt.includes('warm')) {
    return 'soup';
  }

  if (lowerPrompt.includes('recipe') || lowerPrompt.includes('dish') || lowerPrompt.includes('food')) {
    return 'recipe';
  }

  if (lowerPrompt.includes('blender') || lowerPrompt.includes('product') || lowerPrompt.includes('vitamix')) {
    return 'product';
  }

  if (lowerPrompt.includes('kitchen') || lowerPrompt.includes('lifestyle') || lowerPrompt.includes('family')) {
    return 'lifestyle';
  }

  return 'lifestyle'; // Default
}

/**
 * Generate a recipe image prompt
 */
export function buildRecipeImagePrompt(
  recipeName: string,
  ingredients: string[],
  description?: string
): string {
  return `
A professional food photography shot of ${recipeName}.
${description || ''}
Key ingredients visible: ${ingredients.slice(0, 5).join(', ')}.
Served in modern white dishware.
Vitamix blender visible in soft focus background.
${CONTENT_TYPE_PROMPTS.recipe}
${VITAMIX_IMAGE_STYLE}
`.trim();
}

/**
 * Generate a product image prompt
 */
export function buildProductImagePrompt(
  productName: string,
  features?: string[]
): string {
  return `
Professional product photography of ${productName}.
${features ? `Highlighting: ${features.slice(0, 3).join(', ')}.` : ''}
Clean studio environment with subtle gradient background.
${CONTENT_TYPE_PROMPTS.product}
${VITAMIX_IMAGE_STYLE}
`.trim();
}

/**
 * Generate a lifestyle/hero image prompt
 */
export function buildLifestyleImagePrompt(
  scene: string,
  mood?: string,
  includePerson?: boolean
): string {
  return `
Lifestyle photography showing ${scene}.
${mood ? `Mood: ${mood}.` : 'Mood: Aspirational, healthy, premium.'}
Modern, bright kitchen with white countertops.
${includePerson ? 'Person preparing food, natural expression.' : ''}
Natural morning light streaming through windows.
${CONTENT_TYPE_PROMPTS.lifestyle}
${VITAMIX_IMAGE_STYLE}
`.trim();
}

/**
 * Negative prompt elements to avoid
 */
export const NEGATIVE_PROMPT_ELEMENTS = [
  'text',
  'watermark',
  'logo',
  'signature',
  'cartoon',
  'illustration',
  'anime',
  'drawing',
  'low quality',
  'blurry',
  'out of focus',
  'oversaturated',
  'artificial looking',
  'stock photo feel',
  'staged',
  'unnatural poses',
];

/**
 * Strong negative prompt for excluding products/appliances
 * These are repeated and emphasized to override LoRA training
 */
const NO_PRODUCTS_NEGATIVE = [
  'blender',
  'Vitamix',
  'vitamix blender',
  'kitchen appliance',
  'appliance',
  'food processor',
  'machine',
  'electric device',
  'product',
  'black blender',
  'blender in background',
  'blender base',
  'blender container',
  'motor base',
];

/**
 * Build the negative prompt string
 */
export function buildNegativePrompt(): string {
  // Combine standard negatives with strong product exclusions
  const allNegatives = [...NEGATIVE_PROMPT_ELEMENTS, ...NO_PRODUCTS_NEGATIVE];
  return allNegatives.join(', ');
}
