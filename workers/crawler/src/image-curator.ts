import type { Env, ContentType } from './types';
import { zipSync, strToU8 } from 'fflate';

/**
 * Image Curator for LoRA Training
 *
 * Extracts and curates high-quality recipe/food images from the RAG index
 * for training FLUX LoRA models with Vitamix brand style.
 */

export interface CuratedImage {
  url: string;
  alt: string;
  context: string;
  sourceUrl: string;
  contentType: ContentType;
  category: 'hero' | 'card';
  qualityScore: number;
  dimensions?: { width: number; height: number };
  fileSize?: number;
}

export interface CurationResult {
  heroImages: CuratedImage[];
  cardImages: CuratedImage[];
  stats: {
    totalScanned: number;
    heroCount: number;
    cardCount: number;
    filteredOut: number;
    avgQualityScore: number;
  };
}

/**
 * Quality scoring weights
 */
const QUALITY_WEIGHTS = {
  hasAlt: 0.2,
  altLength: 0.15,
  contextRelevance: 0.25,
  urlQuality: 0.2,
  notThumbnail: 0.2,
};

/**
 * Keywords indicating food/recipe content (positive signals)
 */
const FOOD_KEYWORDS = [
  'smoothie', 'recipe', 'blend', 'soup', 'juice', 'dressing', 'sauce',
  'dessert', 'breakfast', 'dinner', 'lunch', 'snack', 'healthy', 'fresh',
  'ingredients', 'delicious', 'homemade', 'nutrition', 'fruit', 'vegetable',
  'green', 'protein', 'organic', 'vegan', 'keto', 'paleo',
];

/**
 * URL patterns to exclude (icons, logos, UI elements)
 */
const EXCLUDE_URL_PATTERNS = [
  '/icons/', '/icon-', '/logo', '/ui/', '/assets/icons/',
  '/favicon', '/sprite', '/placeholder', '/loading',
  'tracking', 'pixel', '1x1', 'spacer', 'arrow', 'chevron',
  'button', 'badge', 'ribbon', 'star-rating',
];

/**
 * URL patterns indicating high-quality food images
 */
const QUALITY_URL_PATTERNS = [
  '/recipes/', '/recipe-images/', '/food/', '/smoothies/',
  '/hero', '/featured', '/gallery', '/main-image',
];

/**
 * Extract and curate images from RAG for LoRA training
 */
export async function curateImagesForTraining(
  env: Env,
  options: {
    minImages?: number;
    maxImages?: number;
    minQualityScore?: number;
  } = {}
): Promise<CurationResult> {
  const {
    minImages = 15,
    maxImages = 50,
    minQualityScore = 0.5,
  } = options;

  // Query Vectorize for recipe content with images
  const recipeImages = await queryRecipeImages(env);

  // Score and categorize each image
  const scoredImages: CuratedImage[] = [];

  for (const img of recipeImages) {
    const score = calculateQualityScore(img);
    const category = categorizeImage(img);

    if (score >= minQualityScore) {
      scoredImages.push({
        ...img,
        category,
        qualityScore: score,
      });
    }
  }

  // Sort by quality score
  scoredImages.sort((a, b) => b.qualityScore - a.qualityScore);

  // Separate into hero and card categories
  const heroImages = scoredImages
    .filter(img => img.category === 'hero')
    .slice(0, Math.ceil(maxImages * 0.3)); // 30% hero images

  const cardImages = scoredImages
    .filter(img => img.category === 'card')
    .slice(0, Math.ceil(maxImages * 0.7)); // 70% card images

  // Calculate stats
  const allSelected = [...heroImages, ...cardImages];
  const avgScore = allSelected.length > 0
    ? allSelected.reduce((sum, img) => sum + img.qualityScore, 0) / allSelected.length
    : 0;

  return {
    heroImages,
    cardImages,
    stats: {
      totalScanned: recipeImages.length,
      heroCount: heroImages.length,
      cardCount: cardImages.length,
      filteredOut: recipeImages.length - allSelected.length,
      avgQualityScore: Math.round(avgScore * 100) / 100,
    },
  };
}

/**
 * Query Vectorize for recipe pages and then scrape actual images from those pages
 */
async function queryRecipeImages(env: Env): Promise<Omit<CuratedImage, 'category' | 'qualityScore'>[]> {
  const images: Omit<CuratedImage, 'category' | 'qualityScore'>[] = [];
  const seenUrls = new Set<string>();
  const seenPages = new Set<string>();

  // Query for recipe-related content
  const queries = [
    'smoothie recipe ingredients',
    'healthy breakfast blend',
    'soup recipe homemade',
    'juice fresh fruits vegetables',
    'dessert frozen treat',
  ];

  // Collect unique recipe page URLs from Vectorize
  const recipePages: Array<{ url: string; title: string }> = [];

  for (const query of queries) {
    try {
      const embedding = await generateEmbedding(query, env);
      // Query without filter - Vectorize has max topK=50 with returnMetadata=all
      const results = await env.VECTORIZE.query(embedding, {
        topK: 50,
        returnMetadata: 'all',
      });

      console.log(`Query "${query}" returned ${results.matches.length} results`);

      for (const match of results.matches) {
        const metadata = match.metadata as Record<string, any>;
        const sourceUrl = metadata?.source_url;
        const pageTitle = metadata?.page_title || '';
        const contentType = metadata?.content_type;

        // Filter for recipe content in code
        if (contentType !== 'recipe') continue;
        if (!sourceUrl || seenPages.has(sourceUrl)) continue;
        if (!sourceUrl.includes('/recipes/')) continue;

        seenPages.add(sourceUrl);
        recipePages.push({ url: sourceUrl, title: pageTitle });
      }
    } catch (error) {
      console.error(`Query failed for "${query}":`, error);
    }
  }

  console.log(`Found ${recipePages.length} unique recipe pages to scrape`);

  // Now scrape actual images from each recipe page
  for (const page of recipePages.slice(0, 100)) { // Limit to 100 pages
    try {
      const pageImages = await scrapeRecipePageImages(page.url, page.title);

      for (const img of pageImages) {
        if (seenUrls.has(img.url)) continue;
        seenUrls.add(img.url);
        images.push(img);
      }
    } catch (error) {
      console.error(`Failed to scrape ${page.url}:`, error);
    }
  }

  return images;
}

/**
 * Scrape actual food images from a Vitamix recipe page
 */
async function scrapeRecipePageImages(
  pageUrl: string,
  pageTitle: string
): Promise<Omit<CuratedImage, 'category' | 'qualityScore'>[]> {
  const images: Omit<CuratedImage, 'category' | 'qualityScore'>[] = [];

  try {
    const response = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'VitamixImageCurator/1.0',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) return images;

    const html = await response.text();

    // Look for og:image (usually the main recipe image)
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
    if (ogImageMatch) {
      const imageUrl = ogImageMatch[1];
      if (isValidFoodImageUrl(imageUrl)) {
        images.push({
          url: imageUrl,
          alt: pageTitle,
          context: `Main recipe image for ${pageTitle}`,
          sourceUrl: pageUrl,
          contentType: 'recipe',
        });
      }
    }

    // Look for recipe-specific image patterns in Vitamix pages
    const imagePatterns = [
      // Vitamix recipe image pattern
      /src=["']([^"']*vitamix[^"']*\/recipes\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
      // Scene7 images (Adobe DAM)
      /src=["']([^"']*scene7[^"']*vitamix[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
      // Contentful or other CDN images
      /src=["']([^"']*(?:images\.ctfassets|cloudinary|imgix)[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
      // General high-res food images
      /<img[^>]*src=["']([^"']+\.(?:jpg|jpeg|png|webp))["'][^>]*alt=["']([^"']*(?:recipe|smoothie|soup|blend|juice)[^"']*)["']/gi,
    ];

    for (const pattern of imagePatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const imageUrl = match[1];
        const altText = match[2] || pageTitle;

        // Resolve relative URLs
        let absoluteUrl = imageUrl;
        try {
          absoluteUrl = new URL(imageUrl, pageUrl).href;
        } catch {
          continue;
        }

        if (!isValidFoodImageUrl(absoluteUrl)) continue;
        if (images.some(img => img.url === absoluteUrl)) continue;

        images.push({
          url: absoluteUrl,
          alt: altText,
          context: `Food image from ${pageTitle}`,
          sourceUrl: pageUrl,
          contentType: 'recipe',
        });
      }
    }
  } catch (error) {
    console.error(`Error scraping ${pageUrl}:`, error);
  }

  return images;
}

/**
 * Check if URL is a valid food/recipe image (not tracking, icon, etc.)
 */
function isValidFoodImageUrl(url: string): boolean {
  const urlLower = url.toLowerCase();

  // Exclude tracking pixels and ads
  if (urlLower.includes('doubleclick') || urlLower.includes('googleads') ||
      urlLower.includes('facebook.com') || urlLower.includes('analytics') ||
      urlLower.includes('pixel') || urlLower.includes('tracking') ||
      urlLower.includes('1x1') || urlLower.includes('beacon')) {
    return false;
  }

  // Exclude common non-food patterns
  if (urlLower.includes('/icons/') || urlLower.includes('/icon-') ||
      urlLower.includes('/logo') || urlLower.includes('/ui/') ||
      urlLower.includes('/button') || urlLower.includes('/arrow') ||
      urlLower.includes('/chevron') || urlLower.includes('sprite') ||
      urlLower.includes('favicon')) {
    return false;
  }

  // Must be an image file
  if (!urlLower.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)) {
    return false;
  }

  return true;
}

/**
 * Generate embedding for query
 */
async function generateEmbedding(text: string, env: Env): Promise<number[]> {
  const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [text],
  });
  return result.data[0];
}

/**
 * Check if URL should be excluded
 */
function shouldExcludeUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  return EXCLUDE_URL_PATTERNS.some(pattern => urlLower.includes(pattern));
}

/**
 * Calculate quality score for an image (0-1)
 */
function calculateQualityScore(img: Omit<CuratedImage, 'category' | 'qualityScore'>): number {
  let score = 0;

  // Has alt text
  if (img.alt && img.alt.trim().length > 0) {
    score += QUALITY_WEIGHTS.hasAlt;
  }

  // Alt text length (longer = more descriptive)
  if (img.alt) {
    const altLength = img.alt.length;
    if (altLength > 30) score += QUALITY_WEIGHTS.altLength;
    else if (altLength > 15) score += QUALITY_WEIGHTS.altLength * 0.5;
  }

  // Context relevance (contains food keywords)
  const contextLower = (img.context + ' ' + img.alt).toLowerCase();
  const keywordMatches = FOOD_KEYWORDS.filter(kw => contextLower.includes(kw));
  const contextScore = Math.min(keywordMatches.length / 5, 1) * QUALITY_WEIGHTS.contextRelevance;
  score += contextScore;

  // URL quality (contains quality patterns)
  const urlLower = img.url.toLowerCase();
  const hasQualityPattern = QUALITY_URL_PATTERNS.some(pattern => urlLower.includes(pattern));
  if (hasQualityPattern) {
    score += QUALITY_WEIGHTS.urlQuality;
  }

  // Not a thumbnail (URL doesn't contain thumbnail indicators)
  const thumbnailIndicators = ['thumb', 'small', 'tiny', '-sm', '-xs', '100x', '150x', '200x'];
  const isThumbnail = thumbnailIndicators.some(ind => urlLower.includes(ind));
  if (!isThumbnail) {
    score += QUALITY_WEIGHTS.notThumbnail;
  }

  return Math.min(score, 1);
}

/**
 * Categorize image as hero (landscape) or card (square/portrait)
 * Based on URL patterns since we don't have dimensions yet
 */
function categorizeImage(img: Omit<CuratedImage, 'category' | 'qualityScore'>): 'hero' | 'card' {
  const urlLower = img.url.toLowerCase();

  // Hero indicators (wide/landscape images)
  const heroIndicators = [
    '/hero', '/banner', '/featured', '/wide', '/landscape',
    '/header', '/cover', '/main-',
  ];

  if (heroIndicators.some(ind => urlLower.includes(ind))) {
    return 'hero';
  }

  // Default to card (most food images are square/portrait)
  return 'card';
}

/**
 * Download images and verify dimensions
 * Returns enriched images with actual dimensions and file sizes
 */
export async function verifyImageDimensions(
  images: CuratedImage[]
): Promise<CuratedImage[]> {
  const verified: CuratedImage[] = [];

  for (const img of images) {
    try {
      const response = await fetch(img.url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'VitamixImageCurator/1.0' },
      });

      if (!response.ok) continue;

      const contentLength = response.headers.get('content-length');
      const fileSize = contentLength ? parseInt(contentLength, 10) : 0;

      // Skip small files (likely icons or thumbnails)
      if (fileSize < 50000) continue; // 50KB minimum

      verified.push({
        ...img,
        fileSize,
      });
    } catch (error) {
      console.error(`Failed to verify ${img.url}:`, error);
    }
  }

  return verified;
}

/**
 * Download images and create ZIP for LoRA training
 * Returns base64-encoded ZIP file
 */
export async function downloadImagesForTraining(
  images: CuratedImage[],
  category: 'hero' | 'card'
): Promise<{ images: Array<{ filename: string; data: ArrayBuffer }>; captions: string }> {
  const downloadedImages: Array<{ filename: string; data: ArrayBuffer }> = [];
  const captions: string[] = [];

  let index = 0;
  for (const img of images.filter(i => i.category === category)) {
    try {
      const response = await fetch(img.url, {
        headers: { 'User-Agent': 'VitamixImageCurator/1.0' },
      });

      if (!response.ok) continue;

      const data = await response.arrayBuffer();

      // Determine extension from content-type
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const ext = contentType.includes('png') ? 'png' : 'jpg';

      const filename = `vitamix-${category}-${index.toString().padStart(3, '0')}.${ext}`;

      downloadedImages.push({ filename, data });

      // Create caption from alt text and context
      const caption = img.alt || extractCaptionFromContext(img.context);
      captions.push(`${filename}: ${caption}`);

      index++;
    } catch (error) {
      console.error(`Failed to download ${img.url}:`, error);
    }
  }

  return {
    images: downloadedImages,
    captions: captions.join('\n'),
  };
}

/**
 * Extract a caption from context text
 */
function extractCaptionFromContext(context: string): string {
  // Take first sentence or first 100 chars
  const firstSentence = context.match(/^[^.!?]+[.!?]/);
  if (firstSentence) {
    return firstSentence[0].trim();
  }
  return context.slice(0, 100).trim();
}

/**
 * Create a ZIP file with curated images ready for fal.ai LoRA training
 * Returns the ZIP as a Uint8Array
 */
export async function createTrainingZip(
  images: CuratedImage[],
  triggerWord: string = 'vitamixstyle'
): Promise<{ zip: Uint8Array; manifest: string }> {
  const files: Record<string, Uint8Array> = {};
  const captions: string[] = [];
  let index = 0;

  console.log(`Creating training ZIP with ${images.length} images...`);

  for (const img of images) {
    try {
      // Download image
      const response = await fetch(img.url, {
        headers: { 'User-Agent': 'VitamixImageCurator/1.0' },
      });

      if (!response.ok) {
        console.log(`Skipping ${img.url}: ${response.status}`);
        continue;
      }

      const data = await response.arrayBuffer();

      // Skip small files
      if (data.byteLength < 10000) {
        console.log(`Skipping small file: ${img.url} (${data.byteLength} bytes)`);
        continue;
      }

      // Determine extension from content-type or URL
      const contentType = response.headers.get('content-type') || '';
      let ext = 'jpg';
      if (contentType.includes('png') || img.url.toLowerCase().includes('.png')) {
        ext = 'png';
      } else if (contentType.includes('webp') || img.url.toLowerCase().includes('.webp')) {
        ext = 'webp';
      }

      const filename = `${index.toString().padStart(3, '0')}.${ext}`;
      files[filename] = new Uint8Array(data);

      // Create caption for this image (fal.ai uses .txt files with same name)
      // Format: trigger_word, description
      const caption = `${triggerWord}, ${img.alt || extractCaptionFromContext(img.context)}`;
      const captionFilename = `${index.toString().padStart(3, '0')}.txt`;
      files[captionFilename] = strToU8(caption);

      captions.push(`${filename}: ${caption}`);
      index++;

      console.log(`Added ${filename} (${Math.round(data.byteLength / 1024)}KB)`);
    } catch (error) {
      console.error(`Failed to download ${img.url}:`, error);
    }
  }

  // Create manifest/README
  const manifest = `Vitamix LoRA Training Dataset
==============================

Trigger Word: ${triggerWord}
Images: ${index}
Created: ${new Date().toISOString()}

Training Settings for fal.ai:
  - Endpoint: fal-ai/flux-lora-fast-training
  - is_style: true
  - steps: ${Math.min(Math.max(index * 100, 500), 2000)}
  - trigger_word: ${triggerWord}

Captions:
${captions.join('\n')}

Usage after training:
  prompt: "${triggerWord} a fresh green smoothie with spinach and banana"
  loras: [{ path: "YOUR_LORA_ID", scale: 0.8 }]
`;

  files['README.txt'] = strToU8(manifest);

  // Create ZIP
  console.log(`Creating ZIP with ${Object.keys(files).length} files...`);
  const zip = zipSync(files, { level: 6 });

  return { zip, manifest };
}

/**
 * Generate training dataset info for fal.ai
 */
export function generateTrainingConfig(
  heroImages: CuratedImage[],
  cardImages: CuratedImage[]
): {
  trigger_word: string;
  is_style: boolean;
  steps: number;
  dataset_info: string;
} {
  const totalImages = heroImages.length + cardImages.length;

  // Recommended steps based on dataset size
  // ~100 steps per image is a good starting point
  const steps = Math.min(Math.max(totalImages * 100, 500), 2000);

  return {
    trigger_word: 'vitamixstyle',
    is_style: true,
    steps,
    dataset_info: `
Vitamix Brand Style LoRA Training Dataset
==========================================

Total Images: ${totalImages}
- Hero Images (landscape, 16:9): ${heroImages.length}
- Card Images (square/4:3): ${cardImages.length}

Recommended Training Settings:
- Steps: ${steps}
- Trigger Word: vitamixstyle
- Style Training: Yes (is_style: true)

Dataset Characteristics:
- Food photography from Vitamix recipes
- Professional lighting and staging
- Fresh ingredients and vibrant colors
- Clean, modern kitchen settings
- Hero images: Wide shots, banner-style
- Card images: Close-up food shots, recipe cards

Usage after training:
  prompt: "vitamixstyle a fresh green smoothie with spinach and banana"
  loras: [{ path: "YOUR_LORA_ID", scale: 0.8 }]
`.trim(),
  };
}
