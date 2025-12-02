import type { Env, ImageRequest, GeneratedImage, RAGContext } from '../types';
import { buildImagePrompt } from '../prompts/image';
import { findBestImage, logImageDecision, type ImageContext } from '../lib/rag';

/**
 * Imagen 3 API client for image generation via Vertex AI
 */

interface VertexAIImagenResponse {
  predictions: Array<{
    bytesBase64Encoded: string;
    mimeType: string;
  }>;
}

/**
 * Size configurations for different block types
 */
const SIZE_CONFIG: Record<string, { width: number; height: number; aspectRatio: string }> = {
  hero: { width: 2000, height: 800, aspectRatio: '16:9' },
  card: { width: 750, height: 562, aspectRatio: '4:3' },
  column: { width: 600, height: 400, aspectRatio: '3:4' },
  thumbnail: { width: 300, height: 225, aspectRatio: '4:3' },
};

/**
 * Diverse fallback images for when generation fails
 * Multiple high-quality Vitamix-appropriate images for variety
 */
const HERO_FALLBACKS = [
  'https://images.unsplash.com/photo-1638176066666-ffb2f013c7dd?w=2000&h=800&fit=crop&q=80', // Smoothie pour
  'https://images.unsplash.com/photo-1502741224143-90386d7f8c82?w=2000&h=800&fit=crop&q=80', // Fresh fruits
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=2000&h=800&fit=crop&q=80', // Colorful bowl
  'https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=2000&h=800&fit=crop&q=80', // Fresh produce
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=2000&h=800&fit=crop&q=80', // Healthy salad
  'https://images.unsplash.com/photo-1622597467836-f3285f2131b8?w=2000&h=800&fit=crop&q=80', // Smoothie bowl
];

const CARD_FALLBACKS = [
  'https://images.unsplash.com/photo-1590301157890-4810ed352733?w=750&h=562&fit=crop&q=80', // Smoothie bowl
  'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=750&h=562&fit=crop&q=80', // Fresh ingredients
  'https://images.unsplash.com/photo-1571575173700-afb9492e6a50?w=750&h=562&fit=crop&q=80', // Berry smoothie
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=750&h=562&fit=crop&q=80', // Food plating
];

const COLUMN_FALLBACKS = [
  'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=600&h=400&fit=crop&q=80', // Fresh ingredients
  'https://images.unsplash.com/photo-1498837167922-ddd27525d352?w=600&h=400&fit=crop&q=80', // Veggies
  'https://images.unsplash.com/photo-1505253716362-afaea1d3d1af?w=600&h=400&fit=crop&q=80', // Healthy prep
];

/**
 * Get a consistent fallback based on image ID (hash-based selection)
 */
function getConsistentFallback(imageId: string, type: 'hero' | 'card' | 'column'): string {
  // Simple hash for consistent selection
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

// Token cache to avoid generating new tokens for every request
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Generate a JWT and exchange it for an access token
 */
async function getAccessToken(env: Env): Promise<string> {
  // Check if we have a valid cached token
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60000) {
    console.log('Using cached access token');
    return cachedAccessToken.token;
  }

  console.log('Generating new access token for Vertex AI...');

  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON secret is not configured');
  }

  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  console.log('Service account email:', serviceAccount.client_email);
  console.log('Project ID:', serviceAccount.project_id);
  const now = Math.floor(Date.now() / 1000);

  // Create JWT header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // Create JWT payload
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Sign the JWT using the private key
  const signature = await signJWT(signatureInput, serviceAccount.private_key);
  const jwt = `${signatureInput}.${signature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Token exchange failed:', tokenResponse.status, error);
    throw new Error(`Failed to get access token: ${tokenResponse.status} - ${error}`);
  }

  console.log('Access token obtained successfully');

  const tokenData = await tokenResponse.json() as { access_token: string; expires_in: number };

  // Cache the token
  cachedAccessToken = {
    token: tokenData.access_token,
    expiresAt: Date.now() + (tokenData.expires_in * 1000),
  };

  return tokenData.access_token;
}

/**
 * Base64 URL encode a string
 */
function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Sign the JWT using RSA-SHA256
 */
async function signJWT(input: string, privateKeyPem: string): Promise<string> {
  // Parse the PEM private key
  const pemContents = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '');

  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  // Import the key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  // Sign the input
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(input)
  );

  // Convert to base64url
  const signatureArray = new Uint8Array(signature);
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  return signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generate an image using Imagen 3 via Vertex AI
 */
export async function generateImageWithImagen(
  request: ImageRequest,
  slug: string,
  env: Env
): Promise<GeneratedImage> {
  const sizeConfig = SIZE_CONFIG[request.size] || SIZE_CONFIG.card;

  // Build the full prompt with Vitamix style guidance
  const fullPrompt = buildImagePrompt(request.prompt, request.size);

  try {
    // Get access token
    const accessToken = await getAccessToken(env);

    const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const projectId = serviceAccount.project_id;
    const region = env.VERTEX_AI_REGION || 'us-east4';

    console.log('Calling Imagen 3 API:', {
      projectId,
      region,
      promptLength: fullPrompt.length,
      aspectRatio: sizeConfig.aspectRatio,
    });

    // Call Vertex AI Imagen API
    const response = await fetch(
      `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/imagen-3.0-generate-001:predict`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
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
            safetyFilterLevel: 'block_only_high',
            personGeneration: 'allow_adult',
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Imagen API error response:', response.status, error);
      throw new Error(`Imagen API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as VertexAIImagenResponse;
    console.log('Imagen API response received, predictions:', result.predictions?.length || 0);

    if (!result.predictions || result.predictions.length === 0) {
      console.error('No predictions in response:', JSON.stringify(result).substring(0, 500));
      throw new Error('No image generated');
    }

    // Decode the base64 image
    const imageData = result.predictions[0].bytesBase64Encoded;
    const mimeType = result.predictions[0].mimeType || 'image/png';

    // Store in R2 with slug in path for uniqueness per page
    // Path format: {slug}/{imageId}.png (e.g., "my-smoothie-xyz/hero.png")
    const filename = `${slug}/${request.id}.${mimeType.split('/')[1]}`;
    const imageBuffer = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));

    await env.IMAGES.put(filename, imageBuffer, {
      httpMetadata: {
        contentType: mimeType,
      },
      customMetadata: {
        prompt: request.prompt,
        blockId: request.blockId,
        slug,
        generatedAt: new Date().toISOString(),
      },
    });

    // Return the R2 URL - matches the predictable URL format used in HTML
    return {
      id: request.id,
      url: `/images/${filename}`,
      prompt: request.prompt,
    };
  } catch (error) {
    // Log detailed error info
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Image generation failed:', {
      error: errorMessage,
      stack: errorStack,
      requestId: request.id,
      prompt: request.prompt.substring(0, 100),
    });

    // Return a placeholder image on failure
    return {
      id: request.id,
      url: getPlaceholderImage(request.size),
      prompt: request.prompt,
    };
  }
}

/**
 * Check if a generated image is a failure (placeholder SVG)
 */
function isFailedImage(image: GeneratedImage): boolean {
  return image.url.startsWith('data:');
}

/**
 * Get the image type from an image ID (e.g., "card-0" -> "card", "hero" -> "hero")
 */
function getImageType(imageId: string): string {
  if (imageId === 'hero') return 'hero';
  if (imageId.startsWith('card-')) return 'card';
  if (imageId.startsWith('col-')) return 'column';
  if (imageId.startsWith('recipe-')) return 'card';
  if (imageId.startsWith('grid-recipe-')) return 'card';
  if (imageId.startsWith('technique-')) return 'card';
  return 'card'; // default
}

/**
 * Generate multiple images in parallel with smart fallback strategy
 *
 * Fallback logic:
 * 1. For hero: use DEFAULT_FALLBACK_IMAGES.hero
 * 2. For cards/columns: reuse a successfully generated sibling image
 * 3. If no siblings succeeded: use DEFAULT_FALLBACK_IMAGES for that type
 */
export async function generateImagesWithImagen(
  requests: ImageRequest[],
  slug: string,
  env: Env
): Promise<GeneratedImage[]> {
  // Limit concurrent generations
  const concurrencyLimit = 3;
  const results: GeneratedImage[] = [];

  for (let i = 0; i < requests.length; i += concurrencyLimit) {
    const batch = requests.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map(request => generateImageWithImagen(request, slug, env))
    );
    results.push(...batchResults);
  }

  // Apply fallback strategy for failed images
  return applyFallbackStrategy(results);
}

/**
 * Apply fallback strategy for any failed image generations
 */
function applyFallbackStrategy(results: GeneratedImage[]): GeneratedImage[] {
  // Group images by type to find successful siblings
  const successByType: Record<string, GeneratedImage[]> = {
    hero: [],
    card: [],
    column: [],
  };

  // First pass: identify successful images by type
  for (const image of results) {
    if (!isFailedImage(image)) {
      const type = getImageType(image.id);
      if (successByType[type]) {
        successByType[type].push(image);
      }
    }
  }

  // Second pass: apply fallbacks for failed images
  return results.map((image) => {
    if (!isFailedImage(image)) {
      return image; // Already successful
    }

    const type = getImageType(image.id);
    const successfulSiblings = successByType[type] || [];

    let fallbackUrl: string;

    if (type === 'hero') {
      // Hero uses diverse fallback based on image ID
      fallbackUrl = getConsistentFallback(image.id + image.prompt, 'hero');
      console.log(`Hero image failed, using diverse fallback`);
    } else if (successfulSiblings.length > 0) {
      // Reuse a random successful sibling image
      const randomSibling = successfulSiblings[Math.floor(Math.random() * successfulSiblings.length)];
      fallbackUrl = randomSibling.url;
      console.log(`Image ${image.id} failed, reusing sibling ${randomSibling.id}`);
    } else {
      // No siblings succeeded, use diverse fallback based on image ID
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
 * Decide whether to use existing images or generate new ones
 * Uses the comprehensive findBestImage() which checks:
 * 1. Product image map (Priority 1)
 * 2. Enhanced RAG chunk metadata (Priority 2)
 * 3. Dedicated IMAGE_INDEX (Priority 3)
 */
export async function decideImageStrategy(
  blockContent: any,
  ragContext: RAGContext | undefined,
  env: Env
): Promise<{
  useExisting: boolean;
  existingUrl?: string;
  generateNew: boolean;
  generationPrompt?: string;
  reason: string;
}> {
  // Determine image context from block content
  const imageContext = determineImageContext(blockContent);
  const imageQuery = extractImageQuery(blockContent);

  // Use the comprehensive image lookup
  if (ragContext && imageQuery) {
    const result = await findBestImage(imageContext, imageQuery, ragContext, env);

    // Log the decision for debugging/analytics
    logImageDecision(blockContent.type || 'unknown', imageQuery, result);

    if (result) {
      return {
        useExisting: true,
        existingUrl: result.url,
        generateNew: false,
        reason: `Using ${result.source} image${result.score ? ` (score: ${result.score.toFixed(2)})` : ''}`,
      };
    }
  }

  // Fallback: check for legacy product SKU lookup
  if (blockContent.productSku && ragContext) {
    const existingImage = findExistingImage(blockContent.productSku, ragContext);
    if (existingImage) {
      return {
        useExisting: true,
        existingUrl: existingImage,
        generateNew: false,
        reason: 'Using official product image (legacy lookup)',
      };
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
 * Determine image context (product, recipe, lifestyle) from block content
 */
function determineImageContext(blockContent: any): ImageContext {
  // Check block type
  const type = (blockContent.type || '').toLowerCase();

  if (type.includes('product') || blockContent.productSku || blockContent.productName) {
    return 'product';
  }

  if (type.includes('recipe') || blockContent.recipeName || blockContent.ingredients) {
    return 'recipe';
  }

  // Check for recipe-like content
  if (blockContent.recipes || blockContent.recipeTitle) {
    return 'recipe';
  }

  // Default to lifestyle for editorial/hero content
  return 'lifestyle';
}

/**
 * Extract a meaningful image query from block content
 */
function extractImageQuery(blockContent: any): string {
  // Product content
  if (blockContent.productName) {
    return blockContent.productName;
  }
  if (blockContent.productSku) {
    return blockContent.productSku;
  }

  // Recipe content
  if (blockContent.recipeName) {
    return blockContent.recipeName;
  }
  if (blockContent.recipeTitle) {
    return blockContent.recipeTitle;
  }

  // General content
  if (blockContent.imagePrompt) {
    return blockContent.imagePrompt;
  }
  if (blockContent.headline) {
    return blockContent.headline;
  }
  if (blockContent.title) {
    return blockContent.title;
  }

  return '';
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
