import type { Env, CrawlJob, CrawlStats, TextChunk, ExtractedContent } from './types';
import { fetchWithBrowser, canCrawl, extractCrawlableLinks } from './browser';
import { extractContent } from './extractor';
import { createChunks } from './chunker';
import {
  curateImagesForTraining,
  verifyImageDimensions,
  downloadImagesForTraining,
  generateTrainingConfig,
  createTrainingZip,
  type CuratedImage,
} from './image-curator';

export default {
  /**
   * Handle HTTP requests to the crawler
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Start a new crawl (synchronous batch mode)
    if (url.pathname === '/crawl/start' && request.method === 'POST') {
      return handleStartCrawl(request, env);
    }

    // Continue an existing crawl (for long-running crawls)
    if (url.pathname === '/crawl/continue' && request.method === 'POST') {
      return handleContinueCrawl(env);
    }

    // Get crawl status
    if (url.pathname === '/crawl/status') {
      return handleGetStatus(env);
    }

    // Manually process a single URL
    if (url.pathname === '/crawl/url' && request.method === 'POST') {
      return handleSingleUrl(request, env);
    }

    // Search the index (for testing)
    if (url.pathname === '/search' && request.method === 'POST') {
      return handleSearch(request, env);
    }

    // Start crawl from sitemap URLs
    if (url.pathname === '/crawl/sitemap' && request.method === 'POST') {
      return handleSitemapCrawl(request, env);
    }

    // Image curation for LoRA training
    if (url.pathname === '/images/curate') {
      return handleCurateImages(request, env);
    }

    // Download curated images as ZIP
    if (url.pathname === '/images/download') {
      return handleDownloadImages(request, env);
    }

    // Generate training ZIP for fal.ai LoRA training
    if (url.pathname === '/images/training-zip') {
      return handleTrainingZip(request, env);
    }

    // Build image asset index from crawled content
    if (url.pathname === '/images/index' && request.method === 'POST') {
      return handleBuildImageIndex(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Start a new crawl from the seed URL
 * Uses synchronous batch processing instead of queues
 */
async function handleStartCrawl(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { seedUrl?: string; maxPages?: number; batchSize?: number };
  const seedUrl = body.seedUrl || `https://www.${env.CRAWL_DOMAIN}`;
  const maxPages = body.maxPages || parseInt(env.MAX_PAGES) || 100;
  const batchSize = body.batchSize || 10; // Process 10 pages per request to stay within Worker limits

  // Reset crawl state
  await env.CRAWL_STATE.put('stats', JSON.stringify({
    totalPages: 0,
    processedPages: 0,
    failedPages: 0,
    totalChunks: 0,
    byContentType: {},
    lastUpdated: new Date().toISOString(),
  } as CrawlStats));

  await env.CRAWL_STATE.put('config', JSON.stringify({
    seedUrl,
    maxPages,
    batchSize,
    startedAt: new Date().toISOString(),
  }));

  // Clear visited URLs and pending queue
  await env.CRAWL_STATE.delete('visited');
  await env.CRAWL_STATE.put('pending', JSON.stringify([{ url: seedUrl, depth: 0 }]));

  // Process first batch
  const result = await processBatch(env, batchSize, maxPages);

  return new Response(JSON.stringify({
    message: 'Crawl started',
    seedUrl,
    maxPages,
    ...result,
    continueUrl: result.pendingCount > 0 ? '/crawl/continue' : null,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Continue an existing crawl
 */
async function handleContinueCrawl(env: Env): Promise<Response> {
  const config = await env.CRAWL_STATE.get('config', 'json') as { maxPages: number; batchSize: number } | null;

  if (!config) {
    return new Response(JSON.stringify({ error: 'No crawl in progress' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await processBatch(env, config.batchSize, config.maxPages);

  return new Response(JSON.stringify({
    ...result,
    continueUrl: result.pendingCount > 0 ? '/crawl/continue' : null,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Process a batch of URLs
 */
async function processBatch(env: Env, batchSize: number, maxPages: number): Promise<{
  processed: number;
  pendingCount: number;
  stats: CrawlStats;
}> {
  const rateLimit = parseInt(env.RATE_LIMIT_MS) || 1000;

  // Get pending URLs
  const pending = await env.CRAWL_STATE.get('pending', 'json') as CrawlJob[] || [];
  const visited = await getVisitedUrls(env);

  let processed = 0;
  const newPending: CrawlJob[] = [];

  // Process up to batchSize URLs
  for (const job of pending.slice(0, batchSize)) {
    if (visited.size >= maxPages) {
      break;
    }

    if (visited.has(job.url)) {
      continue;
    }

    try {
      const result = await processPage(job, env, visited, maxPages);

      // Add discovered links to pending
      if (result.links) {
        newPending.push(...result.links);
      }

      processed++;

      // Rate limit
      if (processed < batchSize) {
        await sleep(rateLimit);
      }
    } catch (error) {
      console.error(`Failed to process ${job.url}:`, error);
      await markFailed(job.url, env, error as Error);
    }
  }

  // Update pending queue (remaining + new discoveries)
  const remainingPending = pending.slice(batchSize);
  const allPending = [...remainingPending, ...newPending].filter(
    job => !visited.has(job.url)
  );
  await env.CRAWL_STATE.put('pending', JSON.stringify(allPending));

  // Get current stats
  const stats = await env.CRAWL_STATE.get('stats', 'json') as CrawlStats;

  return {
    processed,
    pendingCount: allPending.length,
    stats,
  };
}

/**
 * Get current crawl status
 */
async function handleGetStatus(env: Env): Promise<Response> {
  const stats = await env.CRAWL_STATE.get('stats', 'json') as CrawlStats | null;
  const config = await env.CRAWL_STATE.get('config', 'json');
  const pending = await env.CRAWL_STATE.get('pending', 'json') as CrawlJob[] || [];

  return new Response(JSON.stringify({
    stats: stats || { totalPages: 0, processedPages: 0 },
    config,
    pendingCount: pending.length,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Process a single URL (for manual testing)
 */
async function handleSingleUrl(request: Request, env: Env): Promise<Response> {
  const { url } = await request.json() as { url: string };

  if (!url) {
    return new Response('URL required', { status: 400 });
  }

  try {
    const visited = await getVisitedUrls(env);
    const result = await processPage({ url, depth: 0 }, env, visited, 1000);
    return new Response(JSON.stringify({
      url: result.url,
      chunks: result.chunks,
      linksFound: result.links?.length || 0,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: (error as Error).message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Search the Vectorize index
 */
async function handleSearch(request: Request, env: Env): Promise<Response> {
  const { query, topK = 5 } = await request.json() as { query: string; topK?: number };

  if (!query) {
    return new Response('Query required', { status: 400 });
  }

  try {
    // Generate embedding for query
    const embedding = await generateEmbedding(query, env);

    // Search Vectorize
    const results = await env.VECTORIZE.query(embedding, {
      topK,
      returnMetadata: 'all',
    });

    return new Response(JSON.stringify({
      query,
      results: results.matches.map(match => ({
        score: match.score,
        metadata: match.metadata,
      })),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: (error as Error).message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Process a single page: fetch, extract, chunk, embed, store
 */
async function processPage(
  job: CrawlJob,
  env: Env,
  visited: Set<string>,
  maxPages: number
): Promise<{
  url: string;
  chunks: number;
  links: CrawlJob[] | null;
}> {
  const { url, depth } = job;

  // Check if already visited
  if (visited.has(url)) {
    return { url, chunks: 0, links: null };
  }

  // Check page limit
  if (visited.size >= maxPages) {
    console.log(`Max pages (${maxPages}) reached, stopping crawl`);
    return { url, chunks: 0, links: null };
  }

  // Check robots.txt
  if (!(await canCrawl(url))) {
    console.log(`Robots.txt disallows: ${url}`);
    return { url, chunks: 0, links: null };
  }

  // Mark as visited
  await markVisited(url, env);
  visited.add(url);

  // Fetch page content
  console.log(`Fetching: ${url}`);
  const { html, finalUrl } = await fetchWithBrowser(url, env);

  // Store raw HTML in R2
  await env.RAW_HTML.put(urlToKey(finalUrl), html, {
    customMetadata: {
      url: finalUrl,
      fetchedAt: new Date().toISOString(),
    },
  });

  // Extract structured content
  const content = extractContent(html, finalUrl);

  // Create chunks for embedding
  const chunks = createChunks(content);

  // Generate embeddings and store in Vectorize
  if (chunks.length > 0) {
    await embedAndStore(chunks, env);
  }

  // Update stats
  await updateStats(content, chunks.length, env);

  // Discover new links (up to max depth)
  const maxDepth = 3;
  let discoveredLinks: CrawlJob[] | null = null;

  if (depth < maxDepth) {
    const links = extractCrawlableLinks(html, finalUrl, env.CRAWL_DOMAIN);
    discoveredLinks = links
      .filter(link => !visited.has(link))
      .slice(0, 20) // Limit links per page
      .map(link => ({
        url: link,
        depth: depth + 1,
        parentUrl: finalUrl,
      }));
  }

  return {
    url: finalUrl,
    chunks: chunks.length,
    links: discoveredLinks,
  };
}

/**
 * Generate embedding for text using Workers AI
 */
async function generateEmbedding(text: string, env: Env): Promise<number[]> {
  const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: [text],
  });

  return result.data[0];
}

/**
 * Generate embeddings for multiple texts (batched)
 */
async function generateEmbeddings(texts: string[], env: Env): Promise<number[][]> {
  // Batch size limit for Workers AI
  const batchSize = 50;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: batch,
    });
    allEmbeddings.push(...result.data);
  }

  return allEmbeddings;
}

/**
 * Embed chunks and store in Vectorize
 */
async function embedAndStore(chunks: TextChunk[], env: Env): Promise<void> {
  // Generate embeddings for all chunks
  const texts = chunks.map(c => c.text);
  const embeddings = await generateEmbeddings(texts, env);

  // Prepare vectors for Vectorize
  const vectors = chunks.map((chunk, i) => ({
    id: chunk.id,
    values: embeddings[i],
    metadata: chunk.metadata,
  }));

  // Upsert in batches (Vectorize limit)
  const upsertBatchSize = 100;
  for (let i = 0; i < vectors.length; i += upsertBatchSize) {
    const batch = vectors.slice(i, i + upsertBatchSize);
    await env.VECTORIZE.upsert(batch);
  }
}

/**
 * Get set of visited URLs
 */
async function getVisitedUrls(env: Env): Promise<Set<string>> {
  const visited = await env.CRAWL_STATE.get('visited', 'json') as string[] | null;
  return new Set(visited || []);
}

/**
 * Mark a URL as visited
 */
async function markVisited(url: string, env: Env): Promise<void> {
  const visited = await getVisitedUrls(env);
  visited.add(url);
  await env.CRAWL_STATE.put('visited', JSON.stringify([...visited]));
}

/**
 * Mark a URL as failed
 */
async function markFailed(url: string, env: Env, error: Error): Promise<void> {
  const failed = await env.CRAWL_STATE.get('failed', 'json') as Record<string, string> || {};
  failed[url] = error.message;
  await env.CRAWL_STATE.put('failed', JSON.stringify(failed));

  // Update stats
  const stats = await env.CRAWL_STATE.get('stats', 'json') as CrawlStats;
  if (stats) {
    stats.failedPages++;
    stats.lastUpdated = new Date().toISOString();
    await env.CRAWL_STATE.put('stats', JSON.stringify(stats));
  }
}

/**
 * Update crawl statistics
 */
async function updateStats(content: ExtractedContent, chunksCount: number, env: Env): Promise<void> {
  const stats = await env.CRAWL_STATE.get('stats', 'json') as CrawlStats || {
    totalPages: 0,
    processedPages: 0,
    failedPages: 0,
    totalChunks: 0,
    byContentType: {},
    lastUpdated: new Date().toISOString(),
  };

  stats.totalPages++;
  stats.processedPages++;
  stats.totalChunks += chunksCount;
  stats.byContentType[content.contentType] = (stats.byContentType[content.contentType] || 0) + 1;
  stats.lastUpdated = new Date().toISOString();

  await env.CRAWL_STATE.put('stats', JSON.stringify(stats));
}

/**
 * Convert URL to storage key
 */
function urlToKey(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9-_./]/g, '_')
    .slice(0, 500);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Curate images from RAG for LoRA training
 */
async function handleCurateImages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const minQuality = parseFloat(url.searchParams.get('minQuality') || '0.5');
  const maxImages = parseInt(url.searchParams.get('maxImages') || '50', 10);
  const verify = url.searchParams.get('verify') === 'true';

  try {
    console.log('Starting image curation...');

    // Curate images from RAG
    const result = await curateImagesForTraining(env, {
      minQualityScore: minQuality,
      maxImages,
    });

    // Optionally verify dimensions by fetching images
    let heroImages = result.heroImages;
    let cardImages = result.cardImages;

    if (verify) {
      console.log('Verifying image dimensions...');
      heroImages = await verifyImageDimensions(result.heroImages);
      cardImages = await verifyImageDimensions(result.cardImages);
    }

    // Generate training config
    const trainingConfig = generateTrainingConfig(heroImages, cardImages);

    return new Response(JSON.stringify({
      success: true,
      stats: result.stats,
      trainingConfig,
      heroImages: heroImages.map(img => ({
        url: img.url,
        alt: img.alt,
        qualityScore: img.qualityScore,
        sourceUrl: img.sourceUrl,
        fileSize: img.fileSize,
      })),
      cardImages: cardImages.map(img => ({
        url: img.url,
        alt: img.alt,
        qualityScore: img.qualityScore,
        sourceUrl: img.sourceUrl,
        fileSize: img.fileSize,
      })),
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Image curation failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Generate a training ZIP file for fal.ai LoRA training
 * Downloads images, creates captions, and packages as ZIP
 */
async function handleTrainingZip(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const maxImages = parseInt(url.searchParams.get('maxImages') || '20', 10);
  const triggerWord = url.searchParams.get('triggerWord') || 'vitamixstyle';

  try {
    console.log(`Creating training ZIP: maxImages=${maxImages}, triggerWord=${triggerWord}`);

    // Curate images
    const result = await curateImagesForTraining(env, {
      maxImages: maxImages * 2, // Get extra to filter
      minQualityScore: 0.6, // Higher quality threshold for training
    });

    // Use card images (most food images are card format)
    const images = result.cardImages.slice(0, maxImages);

    if (images.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No suitable images found for training',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create ZIP
    const { zip, manifest } = await createTrainingZip(images, triggerWord);

    console.log(`Training ZIP created: ${zip.byteLength} bytes, ${images.length} images`);

    // Return ZIP file
    return new Response(zip, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="vitamix-lora-training-${Date.now()}.zip"`,
        'X-Image-Count': images.length.toString(),
        'X-Trigger-Word': triggerWord,
      },
    });
  } catch (error) {
    console.error('Training ZIP creation failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Download curated images as individual files with URLs for fal.ai
 */
async function handleDownloadImages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get('category') as 'hero' | 'card' || 'card';
  const maxImages = parseInt(url.searchParams.get('maxImages') || '30', 10);

  try {
    // First curate images
    const result = await curateImagesForTraining(env, {
      maxImages: maxImages * 2, // Get more to filter
      minQualityScore: 0.5,
    });

    const images = category === 'hero' ? result.heroImages : result.cardImages;

    // Verify dimensions
    const verifiedImages = await verifyImageDimensions(images.slice(0, maxImages));

    // Download images
    const downloaded = await downloadImagesForTraining(
      verifiedImages.map(img => ({ ...img, category })),
      category
    );

    // Generate training instructions
    const trainingConfig = generateTrainingConfig(
      category === 'hero' ? verifiedImages : [],
      category === 'card' ? verifiedImages : []
    );

    // Return as JSON with base64 encoded images and instructions
    return new Response(JSON.stringify({
      success: true,
      category,
      imageCount: downloaded.images.length,
      captions: downloaded.captions,
      trainingConfig: trainingConfig.dataset_info,
      images: downloaded.images.map(img => ({
        filename: img.filename,
        size: img.data.byteLength,
        // Note: For large datasets, you'd want to upload these to R2 or another storage
        // and return URLs instead of base64 data
      })),
      // Provide direct URLs for fal.ai training (it can fetch from these URLs)
      imageUrls: verifiedImages.map(img => img.url),
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Image download failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Fetch and parse sitemap XML to extract URLs
 */
async function fetchSitemapUrls(sitemapUrl: string, filter?: string): Promise<string[]> {
  const response = await fetch(sitemapUrl, {
    headers: { 'User-Agent': 'VitamixCrawler/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sitemap: ${response.status}`);
  }

  const xml = await response.text();
  const urls: string[] = [];

  // Extract all <loc> tags
  const locMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
  for (const match of locMatches) {
    const url = match[1].trim();
    // Apply filter if provided (e.g., "/recipes/" to only get recipe pages)
    if (!filter || url.includes(filter)) {
      urls.push(url);
    }
  }

  return urls;
}

/**
 * Start crawl from sitemap URLs directly
 * This bypasses link discovery and uses sitemap as the source of truth
 */
async function handleSitemapCrawl(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    sitemapUrl: string;
    filter?: string;
    maxPages?: number;
    batchSize?: number;
    append?: boolean; // If true, add to existing crawl instead of resetting
  };

  const { sitemapUrl, filter, append = false } = body;
  const maxPages = body.maxPages || 3000;
  const batchSize = body.batchSize || 20;

  if (!sitemapUrl) {
    return new Response(JSON.stringify({ error: 'sitemapUrl required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Fetch sitemap URLs
  console.log(`Fetching sitemap: ${sitemapUrl}${filter ? ` (filter: ${filter})` : ''}`);
  const sitemapUrls = await fetchSitemapUrls(sitemapUrl, filter);
  console.log(`Found ${sitemapUrls.length} URLs in sitemap`);

  // Get already visited URLs if appending
  let visited = new Set<string>();
  if (append) {
    visited = await getVisitedUrls(env);
  }

  // Filter out already visited URLs
  const newUrls = sitemapUrls.filter(url => !visited.has(url));

  if (!append) {
    // Reset crawl state for fresh crawl
    await env.CRAWL_STATE.put('stats', JSON.stringify({
      totalPages: 0,
      processedPages: 0,
      failedPages: 0,
      totalChunks: 0,
      byContentType: {},
      lastUpdated: new Date().toISOString(),
    } as CrawlStats));

    await env.CRAWL_STATE.delete('visited');
  }

  await env.CRAWL_STATE.put('config', JSON.stringify({
    sitemapUrl,
    filter,
    maxPages,
    batchSize,
    mode: 'sitemap',
    startedAt: new Date().toISOString(),
  }));

  // Set pending queue to sitemap URLs (depth 0, no link discovery needed)
  const pendingJobs: CrawlJob[] = newUrls.slice(0, maxPages).map(url => ({
    url,
    depth: 99, // High depth to disable link discovery
  }));

  await env.CRAWL_STATE.put('pending', JSON.stringify(pendingJobs));

  // Process first batch
  const result = await processBatch(env, batchSize, maxPages);

  return new Response(JSON.stringify({
    message: 'Sitemap crawl started',
    sitemapUrl,
    filter,
    urlsInSitemap: sitemapUrls.length,
    urlsToProcess: newUrls.length,
    ...result,
    continueUrl: result.pendingCount > 0 ? '/crawl/continue' : null,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// IMAGE ASSET INDEX (Priority 3)
// ============================================================================

/**
 * Image metadata for the asset index
 */
interface ImageAssetMetadata {
  url: string;
  alt_text: string;
  source_url: string;
  page_title: string;
  image_type: string;
  content_type: string;
}

/**
 * Build the image asset index from crawled content
 * Extracts unique images from VECTORIZE chunks and indexes them in IMAGE_INDEX
 */
async function handleBuildImageIndex(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    batchSize?: number;
    contentType?: string; // Filter by content type: 'recipe', 'product', etc.
  };

  const batchSize = body.batchSize || 100;
  const contentTypeFilter = body.contentType;

  console.log(`[Image Index] Starting build, batchSize=${batchSize}, filter=${contentTypeFilter || 'all'}`);

  // Get all chunks from VECTORIZE that have image metadata
  // We'll use a sample query to retrieve chunks (Vectorize doesn't have a list-all API)
  // Instead, query for common terms to get diverse chunks
  const sampleQueries = [
    'recipe smoothie healthy',
    'blender vitamix product',
    'soup nutrition ingredients',
    'breakfast lunch dinner',
    'dessert chocolate fruit',
  ];

  const seenUrls = new Set<string>();
  const imageVectors: Array<{ id: string; values: number[]; metadata: ImageAssetMetadata }> = [];
  let totalProcessed = 0;

  for (const query of sampleQueries) {
    // Generate embedding for sample query
    const embeddingResult = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [query],
    }) as { data: number[][] };
    const queryEmbedding = embeddingResult.data[0];

    // Query VECTORIZE for chunks
    const results = await env.VECTORIZE.query(queryEmbedding, {
      topK: batchSize,
      returnMetadata: 'all',
    });

    console.log(`[Image Index] Query "${query}" returned ${results.matches.length} chunks`);

    for (const match of results.matches) {
      const meta = match.metadata as any;

      // Skip if no image or already seen
      const imageUrl = meta.hero_image_url || meta.recipe_image_url || meta.product_image_url || meta.image_url;
      if (!imageUrl || seenUrls.has(imageUrl)) continue;

      // Skip generic fallbacks
      if (imageUrl.includes('Ascent_X5_Nav_Image') || imageUrl.includes('placeholder')) continue;

      // Filter by content type if specified
      if (contentTypeFilter && meta.content_type !== contentTypeFilter) continue;

      seenUrls.add(imageUrl);

      // Build description for embedding
      const description = buildImageDescription(meta, imageUrl);

      // Generate embedding for image description
      const descEmbedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: [description],
      }) as { data: number[][] };

      // Create vector for IMAGE_INDEX
      const vectorId = `img-${simpleHash(imageUrl)}`;
      imageVectors.push({
        id: vectorId,
        values: descEmbedding.data[0],
        metadata: {
          url: imageUrl,
          alt_text: meta.image_alt_text || '',
          source_url: meta.source_url || '',
          page_title: meta.page_title || '',
          image_type: meta.image_type || 'unknown',
          content_type: meta.content_type || 'unknown',
        },
      });

      totalProcessed++;

      // Batch insert every 50 images
      if (imageVectors.length >= 50) {
        await env.IMAGE_INDEX.upsert(imageVectors);
        console.log(`[Image Index] Inserted ${imageVectors.length} vectors`);
        imageVectors.length = 0; // Clear array
      }
    }
  }

  // Insert remaining vectors
  if (imageVectors.length > 0) {
    await env.IMAGE_INDEX.upsert(imageVectors);
    console.log(`[Image Index] Inserted final ${imageVectors.length} vectors`);
  }

  return new Response(JSON.stringify({
    message: 'Image index build complete',
    totalImages: seenUrls.size,
    totalProcessed,
    contentTypeFilter: contentTypeFilter || 'all',
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Build a descriptive text for image embedding
 */
function buildImageDescription(meta: any, imageUrl: string): string {
  const parts: string[] = [];

  // Include page title
  if (meta.page_title) {
    parts.push(meta.page_title);
  }

  // Include alt text
  if (meta.image_alt_text) {
    parts.push(meta.image_alt_text);
  }

  // Include content type context
  if (meta.content_type === 'recipe') {
    parts.push('recipe food dish');
  } else if (meta.content_type === 'product') {
    parts.push('vitamix blender product');
  }

  // Include image type
  if (meta.image_type) {
    parts.push(meta.image_type);
  }

  // Extract hints from URL
  const urlParts = imageUrl.toLowerCase();
  if (urlParts.includes('smoothie')) parts.push('smoothie');
  if (urlParts.includes('soup')) parts.push('soup');
  if (urlParts.includes('recipe')) parts.push('recipe');
  if (urlParts.includes('blender')) parts.push('blender');

  return parts.join(' ').slice(0, 500);
}

/**
 * Simple hash for generating vector IDs
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
