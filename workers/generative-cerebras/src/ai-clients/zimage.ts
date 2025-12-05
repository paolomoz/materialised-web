/**
 * fal.ai z-image/turbo API client for image generation
 *
 * Z-Image Turbo is an ultra-fast latent-consistency image generation model.
 * - Speed: ~0.5-1s per image
 * - Cost: $0.005 per megapixel
 * - Configurable inference steps (1-8)
 * - High quality with fewer steps than FLUX
 *
 * @see https://fal.ai/models/fal-ai/z-image/turbo
 */

import type { Env, ImageRequest, GeneratedImage } from '../types';
import { buildImagePrompt, buildNegativePrompt } from '../prompts/image';

const FAL_ZIMAGE_URL = 'https://fal.run/fal-ai/z-image/turbo';

/**
 * Size configurations for different block types
 * Z-Image uses image_size parameter with predefined sizes or custom dimensions
 * Max 4 megapixels (14,142px width/height limit)
 */
const SIZE_CONFIG: Record<string, { width: number; height: number }> = {
  hero: { width: 1344, height: 768 },    // ~16:9 aspect ratio, landscape_16_9
  card: { width: 768, height: 576 },      // ~4:3 aspect ratio
  column: { width: 576, height: 768 },    // ~3:4 aspect ratio (portrait)
  thumbnail: { width: 384, height: 288 }, // ~4:3 aspect ratio
};

/**
 * Diverse fallback images for when generation fails
 */
const HERO_FALLBACKS = [
  'https://images.unsplash.com/photo-1638176066666-ffb2f013c7dd?w=2000&h=800&fit=crop&q=80',
  'https://images.unsplash.com/photo-1502741224143-90386d7f8c82?w=2000&h=800&fit=crop&q=80',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=2000&h=800&fit=crop&q=80',
  'https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=2000&h=800&fit=crop&q=80',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=2000&h=800&fit=crop&q=80',
  'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=2000&h=800&fit=crop&q=80',
];

const CARD_FALLBACKS = [
  'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=750&h=562&fit=crop&q=80',
  'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=750&h=562&fit=crop&q=80',
  'https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=750&h=562&fit=crop&q=80',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=750&h=562&fit=crop&q=80',
];

const COLUMN_FALLBACKS = [
  'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=600&h=400&fit=crop&q=80',
  'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=400&fit=crop&q=80',
  'https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?w=600&h=400&fit=crop&q=80',
];

/**
 * Get a consistent fallback based on image ID (hash-based selection)
 */
function getConsistentFallback(imageId: string, type: 'hero' | 'card' | 'column'): string {
  let hash = 0;
  for (let i = 0; i < imageId.length; i++) {
    hash = ((hash << 5) - hash) + imageId.charCodeAt(i);
    hash = hash & hash;
  }
  hash = Math.abs(hash);

  switch (type) {
    case 'hero':
      return HERO_FALLBACKS[hash % HERO_FALLBACKS.length];
    case 'card':
      return CARD_FALLBACKS[hash % CARD_FALLBACKS.length];
    case 'column':
      return COLUMN_FALLBACKS[hash % COLUMN_FALLBACKS.length];
    default:
      return CARD_FALLBACKS[hash % CARD_FALLBACKS.length];
  }
}

/**
 * fal.ai z-image API response type
 */
interface ZImageResponse {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
  timings?: {
    inference?: number;
  };
  seed: number;
  has_nsfw_concepts?: boolean[];
  prompt: string;
}

/**
 * Generate an image using z-image/turbo via fal.ai
 *
 * @param request - Image generation request with prompt and size
 * @param slug - Page slug for organizing images in R2
 * @param env - Environment with FAL_API_KEY and IMAGES bucket
 */
export async function generateImageWithZImage(
  request: ImageRequest,
  slug: string,
  env: Env
): Promise<GeneratedImage> {
  if (!env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY is not configured');
  }

  const sizeConfig = SIZE_CONFIG[request.size] || SIZE_CONFIG.card;
  const fullPrompt = buildImagePrompt(request.prompt, request.size);

  const startTime = Date.now();

  try {
    console.log(`[z-image] Generating image:`, {
      promptLength: fullPrompt.length,
      size: `${sizeConfig.width}x${sizeConfig.height}`,
      blockId: request.blockId,
    });

    const requestBody = {
      prompt: fullPrompt,
      image_size: {
        width: sizeConfig.width,
        height: sizeConfig.height,
      },
      num_images: 1,
      num_inference_steps: 8, // Max for best quality (1-8 range)
      enable_safety_checker: true,
      output_format: 'png',
      // Note: z-image/turbo doesn't support negative_prompt
    };

    const response = await fetch(FAL_ZIMAGE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${env.FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[z-image] API error:', response.status, error);
      throw new Error(`z-image API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as ZImageResponse;
    const elapsed = Date.now() - startTime;

    console.log('[z-image] Response received:', {
      elapsed: `${elapsed}ms`,
      inference: result.timings?.inference ? `${result.timings.inference.toFixed(2)}s` : 'N/A',
      imageCount: result.images?.length || 0,
    });

    if (!result.images || result.images.length === 0) {
      throw new Error('No image generated');
    }

    // Download the image from fal.ai's temporary URL
    const imageUrl = result.images[0].url;
    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      throw new Error(`Failed to download image from fal.ai: ${imageResponse.status}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = result.images[0].content_type || 'image/png';
    const extension = contentType.split('/')[1] || 'png';

    // Store in R2
    const filename = `${slug}/${request.id}.${extension}`;
    await env.IMAGES.put(filename, imageBuffer, {
      httpMetadata: {
        contentType,
      },
      customMetadata: {
        prompt: request.prompt,
        blockId: request.blockId,
        slug,
        generatedAt: new Date().toISOString(),
        provider: 'fal-zimage-turbo',
        generationTime: `${elapsed}ms`,
      },
    });

    return {
      id: request.id,
      url: `/images/${filename}`,
      prompt: request.prompt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[z-image] Generation failed:', {
      error: errorMessage,
      requestId: request.id,
      prompt: request.prompt.substring(0, 100),
    });

    // Return placeholder on failure
    return {
      id: request.id,
      url: getPlaceholderImage(request.size),
      prompt: request.prompt,
    };
  }
}

/**
 * Generate multiple images in parallel using z-image/turbo
 *
 * @param requests - Array of image generation requests
 * @param slug - Page slug for organizing images
 * @param env - Environment with FAL_API_KEY
 */
export async function generateImagesWithZImage(
  requests: ImageRequest[],
  slug: string,
  env: Env
): Promise<GeneratedImage[]> {
  // Z-image is very fast, can handle higher concurrency
  const concurrencyLimit = 20;
  const results: GeneratedImage[] = [];

  for (let i = 0; i < requests.length; i += concurrencyLimit) {
    const batch = requests.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map(request => generateImageWithZImage(request, slug, env))
    );
    results.push(...batchResults);
  }

  return applyFallbackStrategy(results);
}

/**
 * Check if a generated image is a failure (placeholder SVG)
 */
function isFailedImage(image: GeneratedImage): boolean {
  return image.url.startsWith('data:');
}

/**
 * Get the image type from an image ID
 */
function getImageType(imageId: string): string {
  if (imageId === 'hero') return 'hero';
  if (imageId.startsWith('card-')) return 'card';
  if (imageId.startsWith('col-')) return 'column';
  if (imageId.startsWith('recipe-')) return 'card';
  if (imageId.startsWith('grid-recipe-')) return 'card';
  if (imageId.startsWith('technique-')) return 'card';
  return 'card';
}

/**
 * Apply fallback strategy for failed images
 * Uses successful siblings of same type, or diverse Unsplash fallbacks
 */
function applyFallbackStrategy(results: GeneratedImage[]): GeneratedImage[] {
  const successByType: Record<string, GeneratedImage[]> = {
    hero: [],
    card: [],
    column: [],
  };

  for (const image of results) {
    if (!isFailedImage(image)) {
      const type = getImageType(image.id);
      if (successByType[type]) {
        successByType[type].push(image);
      }
    }
  }

  return results.map((image) => {
    if (!isFailedImage(image)) {
      return image;
    }

    const type = getImageType(image.id);
    const successfulSiblings = successByType[type] || [];

    let fallbackUrl: string;

    if (type === 'hero') {
      fallbackUrl = getConsistentFallback(image.id + image.prompt, 'hero');
      console.log(`[z-image] Hero image failed, using diverse fallback`);
    } else if (successfulSiblings.length > 0) {
      const randomSibling = successfulSiblings[Math.floor(Math.random() * successfulSiblings.length)];
      fallbackUrl = randomSibling.url;
      console.log(`[z-image] Image ${image.id} failed, reusing sibling ${randomSibling.id}`);
    } else {
      const fallbackType = type === 'column' ? 'column' : 'card';
      fallbackUrl = getConsistentFallback(image.id + image.prompt, fallbackType);
      console.log(`[z-image] Image ${image.id} failed with no siblings, using diverse fallback`);
    }

    return {
      ...image,
      url: fallbackUrl,
    };
  });
}

/**
 * Get a placeholder image URL for fallback
 */
function getPlaceholderImage(size: string): string {
  const config = SIZE_CONFIG[size] || SIZE_CONFIG.card;

  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}">
      <rect fill="#f0f0f0" width="100%" height="100%"/>
      <text fill="#999" font-family="Arial" font-size="24" text-anchor="middle" x="50%" y="50%">
        Image Loading...
      </text>
    </svg>
  `)}`;
}
