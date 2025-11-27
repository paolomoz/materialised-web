import type { Env, ImageRequest, GeneratedImage } from '../types';
import { buildImagePrompt } from '../prompts/image';

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

// Token cache to avoid generating new tokens for every request
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Generate a JWT and exchange it for an access token
 */
async function getAccessToken(env: Env): Promise<string> {
  // Check if we have a valid cached token
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60000) {
    return cachedAccessToken.token;
  }

  const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
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
    throw new Error(`Failed to get access token: ${tokenResponse.status} - ${error}`);
  }

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
export async function generateImage(
  request: ImageRequest,
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
      throw new Error(`Imagen API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as VertexAIImagenResponse;

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

    // Return the R2 URL
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
