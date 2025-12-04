/**
 * Image Dimension Extraction and Caching
 *
 * Extracts dimensions from R2 images and caches them in KV.
 * Used to filter images by aspect ratio for block-appropriate selection.
 */

import type { Env } from '../types';

export interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;  // width / height
  aspectCategory: AspectCategory;
}

export type AspectCategory = 'landscape-wide' | 'landscape' | 'square' | 'portrait';

/**
 * Aspect ratio ranges for categorization
 */
const ASPECT_CATEGORIES: Record<AspectCategory, { min: number; max: number }> = {
  'landscape-wide': { min: 1.7, max: Infinity },  // 16:9 and wider
  'landscape': { min: 1.2, max: 1.7 },            // 4:3 to 16:9
  'square': { min: 0.8, max: 1.2 },               // roughly 1:1
  'portrait': { min: 0, max: 0.8 },               // taller than wide
};

/**
 * Block type to ideal aspect category mapping
 * For tiered hero fallback, we have both strict and relaxed preferences
 */
export const BLOCK_ASPECT_PREFERENCES: Record<string, AspectCategory[]> = {
  // Hero blocks - strict (ideal)
  'hero': ['landscape-wide', 'landscape'],
  'recipe-hero': ['landscape-wide', 'landscape'],
  'recipe-hero-detail': ['landscape-wide', 'landscape'],
  // Hero blocks - relaxed (fallback, will need CSS crop)
  'hero-relaxed': ['landscape', 'square'],
  'recipe-hero-relaxed': ['landscape', 'square'],
  // Hero blocks - any (last resort, will definitely need CSS crop)
  'hero-any': ['landscape-wide', 'landscape', 'square', 'portrait'],
  // Other blocks
  'cards': ['square', 'portrait'],
  'columns': ['square', 'landscape'],
  'split-content': ['landscape', 'square'],
  'product-hero': ['square', 'landscape'],
  'recipe-cards': ['square'],
  'product-cards': ['square'],
  'thumbnails': ['square'],
};

const DIMENSION_CACHE_PREFIX = 'img-dim:';
const DIMENSION_CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

/**
 * Get cached dimensions for an image URL
 */
export async function getCachedDimensions(
  imageUrl: string,
  env: Env
): Promise<ImageDimensions | null> {
  const cacheKey = DIMENSION_CACHE_PREFIX + hashUrl(imageUrl);
  const cached = await env.CACHE.get(cacheKey, 'json');
  return cached as ImageDimensions | null;
}

/**
 * Cache dimensions for an image URL
 */
export async function cacheDimensions(
  imageUrl: string,
  dimensions: ImageDimensions,
  env: Env
): Promise<void> {
  const cacheKey = DIMENSION_CACHE_PREFIX + hashUrl(imageUrl);
  await env.CACHE.put(cacheKey, JSON.stringify(dimensions), {
    expirationTtl: DIMENSION_CACHE_TTL,
  });
}

/**
 * Extract dimensions from an image URL
 * Fetches only the first few KB to read image header
 */
export async function extractDimensions(imageUrl: string): Promise<ImageDimensions | null> {
  try {
    // Fetch first 64KB - enough for any image header
    const response = await fetch(imageUrl, {
      headers: { Range: 'bytes=0-65535' },
    });

    if (!response.ok && response.status !== 206) {
      console.error(`[Dimensions] Failed to fetch ${imageUrl}: ${response.status}`);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    let width: number | null = null;
    let height: number | null = null;

    // Detect format and extract dimensions
    if (isJPEG(bytes)) {
      const dims = extractJPEGDimensions(bytes);
      width = dims?.width ?? null;
      height = dims?.height ?? null;
    } else if (isPNG(bytes)) {
      const dims = extractPNGDimensions(bytes);
      width = dims?.width ?? null;
      height = dims?.height ?? null;
    } else if (isWebP(bytes)) {
      const dims = extractWebPDimensions(bytes);
      width = dims?.width ?? null;
      height = dims?.height ?? null;
    } else if (isGIF(bytes)) {
      const dims = extractGIFDimensions(bytes);
      width = dims?.width ?? null;
      height = dims?.height ?? null;
    }

    if (width && height) {
      const aspectRatio = width / height;
      return {
        width,
        height,
        aspectRatio,
        aspectCategory: categorizeAspectRatio(aspectRatio),
      };
    }

    console.warn(`[Dimensions] Could not extract dimensions from ${imageUrl}`);
    return null;
  } catch (error) {
    console.error(`[Dimensions] Error extracting from ${imageUrl}:`, error);
    return null;
  }
}

/**
 * Get dimensions with caching - extract if not cached
 */
export async function getDimensions(
  imageUrl: string,
  env: Env
): Promise<ImageDimensions | null> {
  // Check cache first
  const cached = await getCachedDimensions(imageUrl, env);
  if (cached) {
    return cached;
  }

  // Extract and cache
  const dimensions = await extractDimensions(imageUrl);
  if (dimensions) {
    await cacheDimensions(imageUrl, dimensions, env);
  }

  return dimensions;
}

/**
 * Check if image dimensions are suitable for a block type
 */
export function isDimensionsSuitableForBlock(
  dimensions: ImageDimensions,
  blockType: string
): boolean {
  const preferences = BLOCK_ASPECT_PREFERENCES[blockType];
  if (!preferences) {
    return true; // No preference, accept any
  }
  return preferences.includes(dimensions.aspectCategory);
}

/**
 * Categorize aspect ratio into named category
 */
function categorizeAspectRatio(ratio: number): AspectCategory {
  for (const [category, { min, max }] of Object.entries(ASPECT_CATEGORIES)) {
    if (ratio >= min && ratio < max) {
      return category as AspectCategory;
    }
  }
  return 'square'; // Default fallback
}

/**
 * Simple URL hash for cache key
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// === Format detection ===

function isJPEG(bytes: Uint8Array): boolean {
  return bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
}

function isPNG(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
}

function isWebP(bytes: Uint8Array): boolean {
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
         bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

function isGIF(bytes: Uint8Array): boolean {
  return bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
}

// === Dimension extraction ===

function extractPNGDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG dimensions are at bytes 16-23 in IHDR chunk
  if (bytes.length < 24) return null;

  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];

  return { width, height };
}

function extractJPEGDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // JPEG dimensions are in SOF marker (0xFFC0-0xFFC3)
  let i = 2; // Skip SOI marker

  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xFF) {
      i++;
      continue;
    }

    const marker = bytes[i + 1];

    // SOF markers contain dimensions
    if (marker >= 0xC0 && marker <= 0xC3) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return { width, height };
    }

    // Skip to next marker
    if (marker === 0xD8 || marker === 0xD9) {
      i += 2;
    } else {
      const length = (bytes[i + 2] << 8) | bytes[i + 3];
      i += 2 + length;
    }
  }

  return null;
}

function extractWebPDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // WebP has multiple formats (VP8, VP8L, VP8X)
  if (bytes.length < 30) return null;

  const format = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (format === 'VP8 ') {
    // Lossy WebP
    const width = ((bytes[26] | (bytes[27] << 8)) & 0x3FFF);
    const height = ((bytes[28] | (bytes[29] << 8)) & 0x3FFF);
    return { width, height };
  } else if (format === 'VP8L') {
    // Lossless WebP
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    const width = (bits & 0x3FFF) + 1;
    const height = ((bits >> 14) & 0x3FFF) + 1;
    return { width, height };
  } else if (format === 'VP8X') {
    // Extended WebP
    const width = ((bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) & 0xFFFFFF) + 1;
    const height = ((bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) & 0xFFFFFF) + 1;
    return { width, height };
  }

  return null;
}

function extractGIFDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // GIF dimensions are at bytes 6-9
  if (bytes.length < 10) return null;

  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);

  return { width, height };
}

/**
 * Batch extract dimensions for multiple images
 * Returns a map of URL to dimensions
 */
export async function batchExtractDimensions(
  imageUrls: string[],
  env: Env,
  options: { concurrency?: number; skipCached?: boolean } = {}
): Promise<Map<string, ImageDimensions | null>> {
  const { concurrency = 10, skipCached = true } = options;
  const results = new Map<string, ImageDimensions | null>();

  // Filter to uncached URLs if requested
  let urlsToProcess = imageUrls;
  if (skipCached) {
    const cacheChecks = await Promise.all(
      imageUrls.map(async (url) => ({
        url,
        cached: await getCachedDimensions(url, env),
      }))
    );

    for (const { url, cached } of cacheChecks) {
      if (cached) {
        results.set(url, cached);
      }
    }

    urlsToProcess = cacheChecks.filter(c => !c.cached).map(c => c.url);
  }

  // Process in batches
  for (let i = 0; i < urlsToProcess.length; i += concurrency) {
    const batch = urlsToProcess.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (url) => {
        const dims = await extractDimensions(url);
        if (dims) {
          await cacheDimensions(url, dims, env);
        }
        return { url, dims };
      })
    );

    for (const { url, dims } of batchResults) {
      results.set(url, dims);
    }
  }

  return results;
}
