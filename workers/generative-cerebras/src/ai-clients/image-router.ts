/**
 * Image Generation Router
 *
 * Routes image generation requests to the configured provider:
 * - 'imagen': Google Imagen 3 via Vertex AI (~3-5s per image) - DEFAULT
 * - 'fal': FLUX Schnell via fal.ai (~0.8-1s per image, $0.003/megapixel)
 * - 'lora': FLUX Dev with Vitamix LoRA (~3-5s per image, brand-consistent)
 * - 'zimage': Z-Image Turbo via fal.ai (~0.5-1s per image, $0.005/megapixel)
 *
 * Default: 'imagen' for high-quality images
 * Set IMAGE_PROVIDER='fal' for faster but lower quality
 * Set IMAGE_PROVIDER='lora' for brand-consistent images with custom LoRA
 * Set IMAGE_PROVIDER='zimage' for ultra-fast generation with Z-Image Turbo
 */

import type { Env, ImageRequest, GeneratedImage } from '../types';
import { generateImagesWithImagen, decideImageStrategy } from './imagen';
import { generateImagesWithFal, generateImagesWithFalLora } from './fal';
import { generateImagesWithZImage } from './zimage';

export type ImageProvider = 'fal' | 'lora' | 'imagen' | 'zimage';

/**
 * Generate images using the configured provider
 * @param requests Image generation requests
 * @param slug Page slug for organizing images
 * @param env Environment with provider config
 * @param overrideProvider Optional provider override (from query param)
 */
export async function generateImages(
  requests: ImageRequest[],
  slug: string,
  env: Env,
  overrideProvider?: ImageProvider
): Promise<GeneratedImage[]> {
  const provider = overrideProvider || env.IMAGE_PROVIDER || 'imagen';

  // Detailed logging to debug provider selection
  console.log(`[ImageRouter] Provider selection:`, {
    requested: overrideProvider || '(none)',
    envDefault: env.IMAGE_PROVIDER || '(none)',
    resolved: provider,
    hasFalKey: !!env.FAL_API_KEY,
    requestCount: requests.length,
  });

  if (provider === 'zimage') {
    if (!env.FAL_API_KEY) {
      console.warn('[ImageRouter] FAL_API_KEY not configured, FALLING BACK to Imagen 3');
      return generateImagesWithImagen(requests, slug, env);
    }
    console.log('[ImageRouter] ACTUALLY USING: Z-Image Turbo (fal.ai)');
    return generateImagesWithZImage(requests, slug, env);
  }

  if (provider === 'lora') {
    if (!env.FAL_API_KEY) {
      console.warn('[ImageRouter] FAL_API_KEY not configured, FALLING BACK to Imagen 3');
      return generateImagesWithImagen(requests, slug, env);
    }
    console.log('[ImageRouter] ACTUALLY USING: FLUX Dev with LoRA');
    return generateImagesWithFalLora(requests, slug, env);
  }

  if (provider === 'fal') {
    if (!env.FAL_API_KEY) {
      console.warn('[ImageRouter] FAL_API_KEY not configured, FALLING BACK to Imagen 3');
      return generateImagesWithImagen(requests, slug, env);
    }
    console.log('[ImageRouter] ACTUALLY USING: FLUX Schnell (fal.ai)');
    return generateImagesWithFal(requests, slug, env);
  }

  // Default to Imagen
  console.log('[ImageRouter] ACTUALLY USING: Google Imagen 3');
  return generateImagesWithImagen(requests, slug, env);
}

// Re-export decideImageStrategy from imagen.ts
export { decideImageStrategy };
