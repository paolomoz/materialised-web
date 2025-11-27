import type { Env, CrawlJob, CrawlStats, TextChunk, ExtractedContent } from './types';
import { fetchWithBrowser, canCrawl, extractCrawlableLinks } from './browser';
import { extractContent } from './extractor';
import { createChunks } from './chunker';

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
