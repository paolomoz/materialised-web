import type { Env, ImageRequest, GeneratedImage } from '../types';
import { buildImagePrompt } from '../prompts/image';

/**
 * Imagen 3 API client for image generation
 */

interface ImagenResponse {
  predictions: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
}

/**
 * Size configurations for different block types
 */
const SIZE_CONFIG: Record<string, { width: number; height: number; aspectRatio: string }> = {
  hero: { width: 2000, height: 800, aspectRatio: '5:2' },
  card: { width: 750, height: 562, aspectRatio: '4:3' },
  column: { width: 600, height: 400, aspectRatio: '3:2' },
  thumbnail: { width: 300, height: 225, aspectRatio: '4:3' },
};

/**
 * Generate an image using Imagen 3
 */
export async function generateImage(
  request: ImageRequest,
  env: Env
): Promise<GeneratedImage> {
  const sizeConfig = SIZE_CONFIG[request.size] || SIZE_CONFIG.card;

  // Build the full prompt with Vitamix style guidance
  const fullPrompt = buildImagePrompt(request.prompt, request.size);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: fullPrompt,
            },
          ],
          parameters: {
            sampleCount: 1,
            aspectRatio: sizeConfig.aspectRatio,
            safetyFilterLevel: 'block_medium_and_above',
            personGeneration: 'allow_adult',
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Imagen API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as ImagenResponse;

    if (!result.predictions || result.predictions.length === 0) {
      throw new Error('No image generated');
    }

    // Decode the base64 image
    const imageData = result.predictions[0].bytesBase64Encoded;
    const mimeType = result.predictions[0].mimeType || 'image/png';

    // Store in R2
    const filename = `generated/${request.id}.${mimeType.split('/')[1]}`;
    const imageBuffer = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));

    await env.IMAGES.put(filename, imageBuffer, {
      httpMetadata: {
        contentType: mimeType,
      },
      customMetadata: {
        prompt: request.prompt,
        blockId: request.blockId,
        generatedAt: new Date().toISOString(),
      },
    });

    // Return the R2 URL (would need to be proxied or use public bucket)
    return {
      id: request.id,
      url: `/images/${filename}`,
      prompt: request.prompt,
    };
  } catch (error) {
    console.error('Image generation failed:', error);

    // Return a placeholder image on failure
    return {
      id: request.id,
      url: getPlaceholderImage(request.size),
      prompt: request.prompt,
    };
  }
}

/**
 * Generate multiple images in parallel
 */
export async function generateImages(
  requests: ImageRequest[],
  env: Env
): Promise<GeneratedImage[]> {
  // Limit concurrent generations
  const concurrencyLimit = 3;
  const results: GeneratedImage[] = [];

  for (let i = 0; i < requests.length; i += concurrencyLimit) {
    const batch = requests.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map(request => generateImage(request, env))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Decide whether to use existing images or generate new ones
 */
export async function decideImageStrategy(
  blockContent: any,
  ragContext: any,
  env: Env
): Promise<{
  useExisting: boolean;
  existingUrl?: string;
  generateNew: boolean;
  generationPrompt?: string;
  reason: string;
}> {
  // Check if we have product content - prefer existing product images
  if (blockContent.productSku) {
    const existingImage = findExistingImage(blockContent.productSku, ragContext);
    if (existingImage) {
      return {
        useExisting: true,
        existingUrl: existingImage,
        generateNew: false,
        reason: 'Using official product image',
      };
    }
  }

  // Check if RAG context has relevant images
  if (ragContext?.chunks) {
    for (const chunk of ragContext.chunks) {
      if (chunk.metadata?.image_url && isRelevantImage(chunk, blockContent)) {
        return {
          useExisting: true,
          existingUrl: chunk.metadata.image_url,
          generateNew: false,
          reason: 'Using relevant image from content source',
        };
      }
    }
  }

  // Generate new image
  return {
    useExisting: false,
    generateNew: true,
    generationPrompt: blockContent.imagePrompt || buildDefaultPrompt(blockContent),
    reason: 'No suitable existing image found',
  };
}

/**
 * Find existing image for a product
 */
function findExistingImage(productSku: string, ragContext: any): string | undefined {
  if (!ragContext?.chunks) return undefined;

  for (const chunk of ragContext.chunks) {
    if (chunk.metadata?.product_sku === productSku && chunk.metadata?.image_url) {
      return chunk.metadata.image_url;
    }
  }

  return undefined;
}

/**
 * Check if a RAG chunk's image is relevant to block content
 */
function isRelevantImage(chunk: any, blockContent: any): boolean {
  // Simple relevance check based on content type match
  if (chunk.metadata?.content_type === 'product' && blockContent.type === 'product') {
    return true;
  }

  if (chunk.metadata?.content_type === 'recipe' && blockContent.type === 'recipe') {
    return true;
  }

  return false;
}

/**
 * Build a default image prompt from block content
 */
function buildDefaultPrompt(blockContent: any): string {
  if (blockContent.headline) {
    return `Professional photography related to: ${blockContent.headline}`;
  }

  if (blockContent.title) {
    return `Professional photography related to: ${blockContent.title}`;
  }

  return 'Modern kitchen scene with Vitamix blender and fresh ingredients';
}

/**
 * Get a placeholder image URL for fallback
 */
function getPlaceholderImage(size: string): string {
  const config = SIZE_CONFIG[size] || SIZE_CONFIG.card;

  // Return a simple SVG placeholder
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${config.width}" height="${config.height}" viewBox="0 0 ${config.width} ${config.height}">
      <rect fill="#f0f0f0" width="100%" height="100%"/>
      <text fill="#999" font-family="Arial" font-size="24" text-anchor="middle" x="50%" y="50%">
        Image Loading...
      </text>
    </svg>
  `)}`;
}

/**
 * Create an SVG placeholder with specific dimensions
 */
export function createPlaceholderSVG(width: number, height: number, label?: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#f0f0f0">
            <animate attributeName="offset" values="-2;1" dur="2s" repeatCount="indefinite"/>
          </stop>
          <stop offset="50%" style="stop-color:#e0e0e0">
            <animate attributeName="offset" values="-1;2" dur="2s" repeatCount="indefinite"/>
          </stop>
          <stop offset="100%" style="stop-color:#f0f0f0">
            <animate attributeName="offset" values="0;3" dur="2s" repeatCount="indefinite"/>
          </stop>
        </linearGradient>
      </defs>
      <rect fill="url(#shimmer)" width="100%" height="100%"/>
      ${label ? `<text fill="#999" font-family="Arial" font-size="16" text-anchor="middle" x="50%" y="50%">${label}</text>` : ''}
    </svg>
  `)}`;
}
