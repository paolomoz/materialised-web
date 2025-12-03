import type { Env, ImageRequest, GeneratedImage } from '../types';
import { buildImagePrompt, buildNegativePrompt } from '../prompts/image';

/**
 * fal.ai FLUX API client for image generation
 *
 * Supports two modes:
 * - FLUX Schnell: Ultra-fast (~1s), no LoRA support
 * - FLUX Dev with LoRA: Brand-consistent images (~3-5s), trained on Vitamix recipes
 *
 * The LoRA model was trained on curated Vitamix recipe images with trigger word "vitamixstyle"
 */

const FAL_SCHNELL_URL = 'https://fal.run/fal-ai/flux/schnell';
const FAL_LORA_URL = 'https://fal.run/fal-ai/flux-lora';

// Vitamix LoRA model trained on recipe images
const VITAMIX_LORA_URL = 'https://v3b.fal.media/files/b/0a84789f/bkBtIxTG7W6t34QFfNMyx_pytorch_lora_weights.safetensors';
const VITAMIX_TRIGGER_WORD = 'vitamixstyle';

/**
 * Size configurations for different block types
 * fal.ai uses image_size parameter with width/height
 */
const SIZE_CONFIG: Record<string, { width: number; height: number }> = {
  hero: { width: 1344, height: 768 },    // ~16:9 aspect ratio
  card: { width: 768, height: 576 },      // ~4:3 aspect ratio
  column: { width: 576, height: 768 },    // ~3:4 aspect ratio
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

// Legacy object for backward compatibility
const DEFAULT_FALLBACK_IMAGES = {
  hero: HERO_FALLBACKS[0],
  card: CARD_FALLBACKS[0],
  column: COLUMN_FALLBACKS[0],
};

/**
 * fal.ai API response type
 */
interface FalImageResponse {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
  timings: {
    inference: number;
  };
  seed: number;
  has_nsfw_concepts: boolean[];
  prompt: string;
}

/**
 * Generate an image using FLUX Schnell via fal.ai (fast, no LoRA)
 */
export async function generateImageWithFal(
  request: ImageRequest,
  slug: string,
  env: Env
): Promise<GeneratedImage> {
  return generateImageWithFalInternal(request, slug, env, false);
}

/**
 * Generate an image using FLUX Dev with Vitamix LoRA (brand-consistent)
 */
export async function generateImageWithFalLora(
  request: ImageRequest,
  slug: string,
  env: Env
): Promise<GeneratedImage> {
  return generateImageWithFalInternal(request, slug, env, true);
}

/**
 * Internal function that handles both Schnell and LoRA modes
 */
async function generateImageWithFalInternal(
  request: ImageRequest,
  slug: string,
  env: Env,
  useLora: boolean
): Promise<GeneratedImage> {
  if (!env.FAL_API_KEY) {
    throw new Error('FAL_API_KEY is not configured');
  }

  const sizeConfig = SIZE_CONFIG[request.size] || SIZE_CONFIG.card;
  let fullPrompt = buildImagePrompt(request.prompt, request.size);

  // Prepend trigger word for LoRA mode
  if (useLora) {
    fullPrompt = `${VITAMIX_TRIGGER_WORD} ${fullPrompt}`;
  }

  const startTime = Date.now();
  const apiUrl = useLora ? FAL_LORA_URL : FAL_SCHNELL_URL;
  const provider = useLora ? 'fal-flux-lora' : 'fal-flux-schnell';

  try {
    console.log(`Calling fal.ai FLUX ${useLora ? 'LoRA' : 'Schnell'}:`, {
      promptLength: fullPrompt.length,
      size: `${sizeConfig.width}x${sizeConfig.height}`,
      useLora,
    });

    const requestBody: Record<string, unknown> = {
      prompt: fullPrompt,
      negative_prompt: buildNegativePrompt(),
      image_size: {
        width: sizeConfig.width,
        height: sizeConfig.height,
      },
      num_images: 1,
      enable_safety_checker: true,
      output_format: 'png',
    };

    if (useLora) {
      // FLUX Dev with LoRA settings
      // Lower scale (0.5) to reduce LoRA influence, allowing negative prompts to exclude products
      requestBody.loras = [{
        path: VITAMIX_LORA_URL,
        scale: 0.5,
      }];
      requestBody.num_inference_steps = 28; // FLUX Dev optimal: 20-30 steps
      requestBody.guidance_scale = 4.5; // Higher guidance to respect prompts more strictly
    } else {
      // FLUX Schnell settings
      requestBody.num_inference_steps = 4; // FLUX Schnell optimal: 1-4 steps
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${env.FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('fal.ai API error:', response.status, error);
      throw new Error(`fal.ai API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as FalImageResponse;
    const elapsed = Date.now() - startTime;

    console.log('fal.ai response received:', {
      elapsed: `${elapsed}ms`,
      inference: `${result.timings?.inference?.toFixed(2)}s`,
      imageCount: result.images?.length || 0,
      mode: useLora ? 'lora' : 'schnell',
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
        provider,
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
    console.error('fal.ai image generation failed:', {
      error: errorMessage,
      requestId: request.id,
      prompt: request.prompt.substring(0, 100),
      mode: useLora ? 'lora' : 'schnell',
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
 * Generate multiple images in parallel using fal.ai (Schnell - fast mode)
 */
export async function generateImagesWithFal(
  requests: ImageRequest[],
  slug: string,
  env: Env
): Promise<GeneratedImage[]> {
  return generateImagesWithFalInternal(requests, slug, env, false);
}

/**
 * Generate multiple images in parallel using fal.ai with LoRA (brand-consistent)
 */
export async function generateImagesWithFalLora(
  requests: ImageRequest[],
  slug: string,
  env: Env
): Promise<GeneratedImage[]> {
  return generateImagesWithFalInternal(requests, slug, env, true);
}

/**
 * Internal batch function supporting both modes
 */
async function generateImagesWithFalInternal(
  requests: ImageRequest[],
  slug: string,
  env: Env,
  useLora: boolean
): Promise<GeneratedImage[]> {
  // fal.ai concurrent request limit (20 for paid tier)
  // Use lower concurrency for LoRA as it's more compute-intensive
  const concurrencyLimit = useLora ? 10 : 20;
  const results: GeneratedImage[] = [];

  for (let i = 0; i < requests.length; i += concurrencyLimit) {
    const batch = requests.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map(request => generateImageWithFalInternal(request, slug, env, useLora))
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
      // Hero uses diverse fallback based on image ID
      fallbackUrl = getConsistentFallback(image.id + image.prompt, 'hero');
      console.log(`Hero image failed, using diverse fallback`);
    } else if (successfulSiblings.length > 0) {
      const randomSibling = successfulSiblings[Math.floor(Math.random() * successfulSiblings.length)];
      fallbackUrl = randomSibling.url;
      console.log(`Image ${image.id} failed, reusing sibling ${randomSibling.id}`);
    } else {
      // Use diverse fallback based on image ID
      const fallbackType = type === 'column' ? 'column' : 'card';
      fallbackUrl = getConsistentFallback(image.id + image.prompt, fallbackType);
      console.log(`Image ${image.id} failed with no siblings, using diverse fallback`);
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
