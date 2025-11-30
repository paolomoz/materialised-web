/**
 * Image Generation Router
 *
 * Routes image generation requests to the configured provider:
 * - 'imagen': Google Imagen 3 via Vertex AI (~3-5s per image) - DEFAULT
 * - 'fal': FLUX Schnell via fal.ai (~0.8-1s per image, $0.003/megapixel)
 * - 'lora': FLUX Dev with Vitamix LoRA (~3-5s per image, brand-consistent)
 *
 * Default: 'imagen' for high-quality images
 * Set IMAGE_PROVIDER='fal' for faster but lower quality
 * Set IMAGE_PROVIDER='lora' for brand-consistent images with custom LoRA
 */

import type { Env, ImageRequest, GeneratedImage } from '../types';
import { generateImagesWithImagen, decideImageStrategy } from './imagen';
import { generateImagesWithFal, generateImagesWithFalLora } from './fal';

export type ImageProvider = 'fal' | 'lora' | 'imagen';

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

  console.log(`Image generation provider: ${provider}, requests: ${requests.length}`);

  if (provider === 'lora') {
    if (!env.FAL_API_KEY) {
      console.warn('FAL_API_KEY not configured, falling back to Imagen 3');
      return generateImagesWithImagen(requests, slug, env);
    }
    console.log('Using FLUX Dev with Vitamix LoRA for brand-consistent images');
    return generateImagesWithFalLora(requests, slug, env);
  }

  if (provider === 'fal') {
    if (!env.FAL_API_KEY) {
      console.warn('FAL_API_KEY not configured, falling back to Imagen 3');
      return generateImagesWithImagen(requests, slug, env);
    }
    return generateImagesWithFal(requests, slug, env);
  }

  // Default to Imagen
  return generateImagesWithImagen(requests, slug, env);
}

// Re-export decideImageStrategy from imagen.ts
export { decideImageStrategy };
