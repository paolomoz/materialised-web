/**
 * Image Migration Script
 *
 * Migrates images from adaptive-web's D1 database to materialised-web's IMAGE_INDEX.
 * Only imports images that have usable metadata (alt_text or context).
 */

import type { Env as MainEnv } from './types';

// Re-export Env with required bindings for migration
type Env = MainEnv & {
  IMAGE_INDEX: VectorizeIndex;
  ADAPTIVE_WEB_DB: D1Database;
};

interface AdaptiveWebImage {
  id: string;
  source_id: string;
  source_url: string;
  r2_url: string;
  alt_text: string | null;
  image_type: string;
  context: string | null;
  file_size: number | null;
  content_type: string | null;
  created_at: string;
  ai_caption: string | null;
}

interface MigrationStats {
  total: number;
  processed: number;
  indexed: number;
  skipped: number;
  errors: number;
  batches: number;
}

/**
 * Main migration function - call this from an API endpoint
 */
export async function migrateImages(
  env: Env,
  options: {
    batchSize?: number;
    limit?: number;
    imageTypes?: string[];
    dryRun?: boolean;
  } = {}
): Promise<{ success: boolean; stats: MigrationStats; message: string }> {
  const {
    batchSize = 50,
    limit = 10000,
    imageTypes = ['recipe', 'product', 'blog', 'page'],
    dryRun = false,
  } = options;

  const stats: MigrationStats = {
    total: 0,
    processed: 0,
    indexed: 0,
    skipped: 0,
    errors: 0,
    batches: 0,
  };

  console.log(`[Migration] Starting image migration (dryRun: ${dryRun})`);
  console.log(`[Migration] Options: batchSize=${batchSize}, limit=${limit}, types=${imageTypes.join(',')}`);

  try {
    // Query images with usable metadata from adaptive-web
    const typeFilter = imageTypes.map(t => `'${t}'`).join(',');
    const query = `
      SELECT id, source_id, source_url, r2_url, alt_text, image_type, context,
             file_size, content_type, created_at, ai_caption
      FROM vitamix_images
      WHERE image_type IN (${typeFilter})
        AND (
          (alt_text IS NOT NULL AND alt_text != '')
          OR (context IS NOT NULL AND context != '')
          OR (ai_caption IS NOT NULL AND ai_caption != '')
        )
      LIMIT ?
    `;

    console.log(`[Migration] Querying adaptive-web database...`);
    const result = await env.ADAPTIVE_WEB_DB.prepare(query).bind(limit).all<AdaptiveWebImage>();

    if (!result.results || result.results.length === 0) {
      return {
        success: true,
        stats,
        message: 'No images found with usable metadata',
      };
    }

    stats.total = result.results.length;
    console.log(`[Migration] Found ${stats.total} images with metadata`);

    // Process in batches
    const images = result.results;
    for (let i = 0; i < images.length; i += batchSize) {
      const batch = images.slice(i, i + batchSize);
      stats.batches++;

      console.log(`[Migration] Processing batch ${stats.batches} (${i + 1}-${Math.min(i + batchSize, images.length)} of ${images.length})`);

      try {
        const vectors = await processBatch(batch, env, dryRun);

        if (!dryRun && vectors.length > 0) {
          await env.IMAGE_INDEX.upsert(vectors);
          stats.indexed += vectors.length;
        } else if (dryRun) {
          stats.indexed += vectors.length;
        }

        stats.processed += batch.length;
        stats.skipped += batch.length - vectors.length;

      } catch (batchError) {
        console.error(`[Migration] Batch ${stats.batches} failed:`, batchError);
        stats.errors += batch.length;
      }

      // Log progress every 5 batches
      if (stats.batches % 5 === 0) {
        console.log(`[Migration] Progress: ${stats.processed}/${stats.total} processed, ${stats.indexed} indexed, ${stats.errors} errors`);
      }
    }

    const message = dryRun
      ? `Dry run complete: would index ${stats.indexed} images`
      : `Migration complete: indexed ${stats.indexed} images`;

    console.log(`[Migration] ${message}`);

    return {
      success: true,
      stats,
      message,
    };

  } catch (error) {
    console.error('[Migration] Fatal error:', error);
    return {
      success: false,
      stats,
      message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Process a batch of images - generate embeddings and prepare vectors
 */
async function processBatch(
  images: AdaptiveWebImage[],
  env: Env,
  dryRun: boolean
): Promise<VectorizeVector[]> {
  const vectors: VectorizeVector[] = [];
  const textsToEmbed: { image: AdaptiveWebImage; text: string }[] = [];

  // Prepare text for embedding
  for (const image of images) {
    const text = buildSearchableText(image);

    if (!text || text.length < 10) {
      continue;
    }

    textsToEmbed.push({ image, text });
  }

  if (textsToEmbed.length === 0) {
    return vectors;
  }

  // Generate embeddings in batch
  const texts = textsToEmbed.map(t => t.text);

  if (dryRun) {
    // In dry run, just count what would be indexed
    return textsToEmbed.map(({ image }) => ({
      id: image.id,
      values: [],
      metadata: buildMetadata(image),
    }));
  }

  try {
    const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: texts,
    }) as { data: number[][] };

    const embeddings = result.data;

    for (let i = 0; i < textsToEmbed.length; i++) {
      const { image } = textsToEmbed[i];
      const embedding = embeddings[i];

      if (!embedding || embedding.length === 0) {
        console.warn(`[Migration] Empty embedding for image ${image.id}`);
        continue;
      }

      vectors.push({
        id: image.id,
        values: embedding,
        metadata: buildMetadata(image),
      });
    }
  } catch (error) {
    console.error('[Migration] Embedding generation failed:', error);
    throw error;
  }

  return vectors;
}

/**
 * Build searchable text from image metadata
 * Prioritizes AI caption > context > alt_text
 */
function buildSearchableText(image: AdaptiveWebImage): string {
  const parts: string[] = [];

  // Prefer AI caption if available
  if (image.ai_caption) {
    parts.push(image.ai_caption);
  }

  // Add context (often contains recipe name, description)
  if (image.context) {
    // Clean up context - remove excessive whitespace
    const cleanContext = image.context.replace(/\s+/g, ' ').trim();
    if (cleanContext.length > 10) {
      parts.push(cleanContext);
    }
  }

  // Add alt text
  if (image.alt_text && image.alt_text.toLowerCase() !== 'recipe header image') {
    parts.push(image.alt_text);
  }

  // Add image type for filtering
  if (image.image_type) {
    parts.push(image.image_type);
  }

  return parts.join(' ').slice(0, 500);
}

/**
 * Build metadata for the vector
 */
function buildMetadata(image: AdaptiveWebImage): Record<string, string | number | boolean> {
  return {
    url: image.r2_url,
    image_url: image.r2_url,
    source_url: image.source_url,
    alt_text: image.alt_text || '',
    image_type: image.image_type,
    context: (image.context || '').slice(0, 200),
    file_size: image.file_size || 0,
    migrated_from: 'adaptive-web',
    migrated_at: new Date().toISOString(),
  };
}

/**
 * Get current index stats
 */
export async function getIndexStats(env: Env): Promise<{
  imageIndex: { vectorCount: number } | null;
  adaptiveWebImages: number;
  imagesWithMetadata: number;
}> {
  // Count images in adaptive-web with metadata
  const countQuery = `
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN (alt_text IS NOT NULL AND alt_text != '')
               OR (context IS NOT NULL AND context != '')
               OR (ai_caption IS NOT NULL AND ai_caption != '')
          THEN 1 ELSE 0 END) as with_metadata
    FROM vitamix_images
  `;

  const result = await env.ADAPTIVE_WEB_DB.prepare(countQuery).first<{
    total: number;
    with_metadata: number;
  }>();

  return {
    imageIndex: null, // Vectorize doesn't expose count via API
    adaptiveWebImages: result?.total || 0,
    imagesWithMetadata: result?.with_metadata || 0,
  };
}

/**
 * Clear all vectors from IMAGE_INDEX (use with caution!)
 */
export async function clearImageIndex(env: Env): Promise<{ success: boolean; message: string }> {
  console.log('[Migration] WARNING: Clearing IMAGE_INDEX is not directly supported by Vectorize API');
  console.log('[Migration] To clear the index, delete and recreate it via wrangler:');
  console.log('[Migration]   npx wrangler vectorize delete vitamix-images');
  console.log('[Migration]   npx wrangler vectorize create vitamix-images --dimensions 768 --metric cosine');

  return {
    success: false,
    message: 'Manual deletion required. See console logs for instructions.',
  };
}
