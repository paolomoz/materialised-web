import type { Env, GenerationState, SessionContextParam, UserContext, IntentClassification } from './types';
import { orchestrate } from './lib/orchestrator';
import { createCallbackSSEStream } from './lib/stream-handler';
import { persistAndPublish, DAClient, createPlaceholderPage } from './lib/da-client';
import { classifyIntent } from './ai-clients/cerebras';
import { smartRetrieve } from './lib/rag';
import {
  classifyCategory,
  generateSemanticSlug,
  buildCategorizedPath,
  isCategoryPath,
  getCategoryFromPath,
} from './lib/category-classifier';
import {
  runContentAudit,
  runQuickAudit,
  runCategoryAudit,
  auditSingleQuery,
  AUDIT_TEST_CASES,
  type AuditTestCase,
} from './lib/content-audit';
import {
  analyzeContentProvenance,
  getProvenanceSummary,
  type ContentProvenance,
} from './lib/provenance-tracker';
import {
  getAggregatedMetrics,
  getBlockedContentLog,
  checkAlerts,
} from './lib/metrics';
import {
  migrateImages,
  getIndexStats,
} from './migrate-images';

/**
 * Log errors to KV for later investigation
 * Errors are stored with a 7-day TTL and can be queried via /api/dashboard/errors
 */
async function logError(
  env: Env,
  errorType: string,
  error: Error | string,
  context: {
    query?: string;
    slug?: string;
    path?: string;
    statusCode?: number;
    cfRay?: string | null;
    userAgent?: string | null;
    country?: string;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const errorId = `error:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const errorData = {
      id: errorId,
      type: errorType,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
      timestamp: new Date().toISOString(),
      ...context,
    };

    await env.CACHE.put(errorId, JSON.stringify(errorData), { expirationTtl: 86400 * 7 }); // 7 days
    console.log(`[ErrorLog] Stored error ${errorId}:`, errorData.message);
  } catch (logErr) {
    // Don't let logging errors break the main flow
    console.error('[ErrorLog] Failed to store error:', logErr);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    // Create page API: POST /api/create-page
    // Creates DA page and returns the path (frontend redirects)
    if (url.pathname === '/api/create-page' && request.method === 'POST') {
      return handleCreatePage(request, env);
    }

    // Generate page endpoint (POST with query)
    if (url.pathname === '/api/generate' && request.method === 'POST') {
      return handleGenerate(request, env);
    }

    // SSE stream for generation (GET with query param)
    if (url.pathname === '/api/stream') {
      return handleStream(request, env);
    }

    // Persist generated page to DA
    if (url.pathname === '/api/persist' && request.method === 'POST') {
      return handlePersist(request, env);
    }

    // Setup homepage with query-form block
    if (url.pathname === '/api/setup-homepage' && request.method === 'POST') {
      return handleSetupHomepage(request, env);
    }

    // AI-powered ingredient search
    if (url.pathname === '/api/ingredient-match' && request.method === 'POST') {
      return handleIngredientMatch(request, env);
    }

    // RAG quality check endpoint (on-demand testing)
    if (url.pathname === '/api/rag-quality') {
      return handleRAGQualityCheck(request, env);
    }

    // Content quality audit endpoint
    if (url.pathname === '/api/content-audit') {
      return handleContentAudit(request, env);
    }

    // Content provenance endpoint - analyze content source (RAG vs generated)
    if (url.pathname === '/api/provenance') {
      return handleProvenance(request, env);
    }

    // Dashboard endpoints for monitoring
    if (url.pathname.startsWith('/api/dashboard/')) {
      return handleDashboard(request, env);
    }

    // Proxy to EDS or serve generated page (all category paths)
    if (isCategoryPath(url.pathname)) {
      return handleCategoryPage(request, env);
    }

    // Legacy discover path (redirect to category if needed)
    if (url.pathname.startsWith('/discover/')) {
      return handleCategoryPage(request, env);
    }

    // Serve generated images from R2
    if (url.pathname.startsWith('/images/')) {
      return handleImage(request, env);
    }

    // Test endpoints for image APIs
    if (url.pathname === '/api/test-imagen') {
      return testImagenAPI(env);
    }
    if (url.pathname === '/api/test-fal') {
      return testFalAPI(env);
    }

    // Test endpoint for intent classification
    if (url.pathname === '/api/classify' && request.method === 'POST') {
      return handleClassify(request, env);
    }

    // Batch classification test endpoint
    if (url.pathname === '/api/classify-batch' && request.method === 'POST') {
      return handleClassifyBatch(request, env);
    }

    // Image migration endpoint (migrate from adaptive-web)
    if (url.pathname === '/api/migrate-images') {
      return handleMigrateImages(request, env);
    }

    // Test image search endpoint
    if (url.pathname === '/api/test-image-search') {
      return handleTestImageSearch(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Handle CORS preflight
 */
function handleCORS(): Response {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * Handle create page API: POST /api/create-page
 *
 * Creates a DA page and returns the path for frontend redirect:
 * 1. Classify intent using Cerebras
 * 2. Determine category and generate semantic slug
 * 3. Create placeholder DA page with cerebras-generated block
 * 4. Return path for frontend to redirect
 */
async function handleCreatePage(request: Request, env: Env): Promise<Response> {
  const { query, images } = await request.json() as { query: string; images?: string };
  const imageProvider = (images || 'fal') as 'fal' | 'imagen';

  // Determine source origin from request
  const origin = request.headers.get('Origin');
  let sourceOrigin = env.EDS_ORIGIN;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.hostname.includes('aem.page') ||
          originUrl.hostname.includes('aem.live') ||
          originUrl.hostname === 'localhost') {
        sourceOrigin = origin;
      }
    } catch {
      // Use default
    }
  }

  if (!query || query.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Missing query' }), {
      status: 400,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  console.log(`[handleCreatePage] Query: "${query}", Images: ${imageProvider}, Source: ${sourceOrigin}`);

  try {
    // 1. Classify intent using Cerebras (fast ~200ms)
    const intent = await classifyIntent(query, env);
    console.log(`[handleCreatePage] Intent: ${intent.intentType}, Layout: ${intent.layoutId}`);

    // 2. Determine category and generate slug
    const category = classifyCategory(intent, query);
    const slug = generateSemanticSlug(query, intent);
    const path = buildCategorizedPath(category, slug);

    console.log(`[handleCreatePage] Path: ${path}`);

    // 3. Store generation state in KV (so the stream knows what to generate)
    await env.CACHE.put(`generation:${path}`, JSON.stringify({
      status: 'pending',
      query,
      slug,
      path,
      imageProvider,
      intent,
      sourceOrigin,
      createdAt: new Date().toISOString(),
    }), { expirationTtl: 600 });

    // 4. Create placeholder DA page with cerebras-generated block
    const daResult = await createPlaceholderPage(path, query, slug, env, sourceOrigin, imageProvider);

    if (!daResult.success) {
      console.error('[handleCreatePage] DA page creation failed:', daResult.error);
      return new Response(JSON.stringify({ error: 'Failed to create page', details: daResult.error }), {
        status: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    console.log(`[handleCreatePage] DA page created at ${path}`);

    // 5. Return the path for frontend to redirect
    return new Response(JSON.stringify({ path, slug }), {
      status: 200,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('[handleCreatePage] Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to create page',
      message: (error as Error).message,
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}

/**
 * Handle page generation request
 */
async function handleGenerate(request: Request, env: Env): Promise<Response> {
  const { query } = await request.json() as { query: string };

  if (!query || query.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'Query required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Generate slug from query
  const slug = generateSlug(query);
  const path = `/discover/${slug}`;

  // Check if page already exists
  const daClient = new DAClient(env);
  if (await daClient.exists(path)) {
    return new Response(JSON.stringify({
      exists: true,
      url: path,
      message: 'Page already exists',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if generation is in progress
  const state = await env.CACHE.get(`generation:${path}`, 'json') as GenerationState | null;
  if (state?.status === 'in_progress') {
    return new Response(JSON.stringify({
      inProgress: true,
      url: path,
      streamUrl: `/api/stream?slug=${slug}`,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Return stream URL for client to connect
  return new Response(JSON.stringify({
    url: path,
    streamUrl: `/api/stream?slug=${slug}&query=${encodeURIComponent(query)}`,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Handle SSE stream for generation
 */
function handleStream(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const query = url.searchParams.get('query');
  const slug = url.searchParams.get('slug');
  // Note: 'images' param is deprecated - RAG-only images now
  const contextParam = url.searchParams.get('ctx');

  if (!query || !slug) {
    return new Response('Missing query or slug', { status: 400 });
  }

  // Capture request context for error logging
  const requestContext = {
    cfRay: request.headers.get('cf-ray'),
    userAgent: request.headers.get('user-agent'),
    country: (request as any).cf?.country as string | undefined,
    ip: request.headers.get('cf-connecting-ip'),
  };

  // Parse session context if provided
  let sessionContext: SessionContextParam | undefined;
  if (contextParam) {
    try {
      sessionContext = JSON.parse(decodeURIComponent(contextParam));
      console.log('[handleStream] Session context:', sessionContext?.previousQueries?.length || 0, 'previous queries');
    } catch (e) {
      console.warn('[handleStream] Failed to parse session context:', e);
    }
  }

  const path = `/discover/${slug}`;

  return createCallbackSSEStream(async (emit) => {
    // Mark generation as in progress
    await env.CACHE.put(`generation:${path}`, JSON.stringify({
      status: 'in_progress',
      query,
      slug,
      startedAt: new Date().toISOString(),
    } as GenerationState), { expirationTtl: 300 });

    try {
      // Run orchestration with session context
      const result = await orchestrate(query, slug, env, emit, undefined, sessionContext);

      // Note: We don't auto-persist to DA here because images are generated
      // asynchronously and the HTML would have placeholder URLs.
      // The user can save via the "Save & Get Permanent Link" button which
      // sends the updated HTML with real image URLs from the frontend.
      await env.CACHE.put(`generation:${path}`, JSON.stringify({
        status: 'complete',
        query,
        slug,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        pageUrl: path,
      } as GenerationState), { expirationTtl: 86400 });

    } catch (error) {
      // Log error with full context for investigation
      await logError(env, 'generation_failed', error as Error, {
        query,
        slug,
        path,
        ...requestContext,
        extra: { imageProvider },
      });

      await env.CACHE.put(`generation:${path}`, JSON.stringify({
        status: 'failed',
        query,
        slug,
        startedAt: new Date().toISOString(),
        error: (error as Error).message,
      } as GenerationState), { expirationTtl: 300 });

      throw error;
    }
  });
}

/**
 * Handle category page routes (/smoothies/*, /recipes/*, /products/*, etc.)
 * Also handles legacy /discover/* routes
 */
async function handleCategoryPage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  // Extract slug from the last path segment (works for any category)
  const slug = path.split('/').pop() || '';
  const queryParam = url.searchParams.get('q');

  // Check if this is an SSE request for generation
  const accept = request.headers.get('Accept') || '';
  if (accept.includes('text/event-stream')) {
    // Extract query from URL or check cache
    const state = await env.CACHE.get(`generation:${path}`, 'json') as GenerationState | null;
    const query = queryParam || state?.query;
    if (query) {
      return handleStream(
        new Request(`${url.origin}/api/stream?slug=${slug}&query=${encodeURIComponent(query)}`),
        env
      );
    }
  }

  // Check generation state
  let state = await env.CACHE.get(`generation:${path}`, 'json') as GenerationState | null;

  // If we have a query parameter and no generation in progress, start one
  if (queryParam && (!state || state.status !== 'in_progress')) {
    // Mark generation as starting
    await env.CACHE.put(`generation:${path}`, JSON.stringify({
      status: 'in_progress',
      query: queryParam,
      slug,
      startedAt: new Date().toISOString(),
    } as GenerationState), { expirationTtl: 300 });

    // Return generating page that connects to SSE
    return new Response(renderGeneratingPage(queryParam, path, env.EDS_ORIGIN), {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }

  if (state?.status === 'in_progress') {
    // Return generating page that connects to SSE
    return new Response(renderGeneratingPage(state.query, path, env.EDS_ORIGIN), {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }

  // Check if page exists in DA (proxy to EDS)
  const daClient = new DAClient(env);
  const exists = await daClient.exists(path);

  if (exists) {
    // Proxy to EDS
    return proxyToEDS(request, env);
  }

  if (state?.status === 'complete') {
    // Try proxy again (might have been published)
    return proxyToEDS(request, env);
  }

  // Page doesn't exist - return 404
  return new Response(renderNotFoundPage(path, env.EDS_ORIGIN), {
    status: 404,
    headers: { 'Content-Type': 'text/html' },
  });
}

/**
 * Handle persist request - save generated content to DA
 * Classifies the query to generate meaningful paths like /recipes/smoothies/green
 */
interface BlockData {
  html: string;
  sectionStyle?: string;
  blockType?: string;
}

async function handlePersist(request: Request, env: Env): Promise<Response> {
  try {
    const { query, blocks } = await request.json() as {
      query: string;
      blocks: BlockData[];
    };

    if (!query || !blocks || !Array.isArray(blocks)) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    // Classify intent to determine category and generate semantic path
    console.log(`[handlePersist] Classifying query: "${query}"`);
    const intent = await classifyIntent(query, env);
    console.log(`[handlePersist] Intent: ${intent.intentType}, Entities:`, intent.entities);

    // Determine category and generate semantic slug
    const category = classifyCategory(intent, query);
    const slug = generateSemanticSlug(query, intent);
    const path = buildCategorizedPath(category, slug);

    console.log(`[handlePersist] Generated path: ${path}`);

    // Build the full HTML page for DA
    const pageHtml = buildDAPageHtml(query, blocks);

    // Persist to DA and publish
    const result = await persistAndPublish(path, pageHtml, [], env);

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    return new Response(JSON.stringify({
      success: true,
      path,
      urls: result.urls,
    }), {
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('[handlePersist] Error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}

/**
 * Build DA-compatible HTML page from generated blocks
 * Uses proper EDS section structure with section-metadata for styling
 */
function buildDAPageHtml(query: string, blocks: BlockData[]): string {
  // Extract title from first h1 if present
  let title = query;
  const firstBlock = blocks[0]?.html || '';
  const h1Match = firstBlock.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (h1Match) {
    title = h1Match[1];
  }

  // Build sections with proper EDS structure
  // Each section contains the block HTML and optionally a section-metadata block for styling
  const sectionsHtml = blocks.map(block => {
    let sectionContent = block.html;

    // Add section-metadata block if there's a section style
    if (block.sectionStyle && block.sectionStyle !== 'default') {
      sectionContent += `
      <div class="section-metadata">
        <div><div>style</div><div>${block.sectionStyle}</div></div>
      </div>`;
    }

    return `    <div>${sectionContent}</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <title>${escapeHTML(title)} | Vitamix</title>
  <meta name="description" content="Personalized content about: ${escapeHTML(query)}">
</head>
<body>
  <header></header>
  <main>
${sectionsHtml}
  </main>
  <footer></footer>
</body>
</html>`;
}

/**
 * Add CORS headers to response headers
 */
function corsHeaders(headers: Record<string, string> = {}): Headers {
  return new Headers({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...headers,
  });
}

/**
 * Diverse fallback images for when generated images aren't ready
 * Multiple high-quality Unsplash images for variety
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

/**
 * Get a consistent fallback image based on a string (slug/imageId)
 * Uses simple hash to ensure same input always gets same image
 */
function getFallbackImage(key: string, type: 'hero' | 'card' | 'default'): string {
  // Create simple numeric hash from string
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  hash = Math.abs(hash);

  if (type === 'hero') {
    return HERO_FALLBACKS[hash % HERO_FALLBACKS.length];
  } else if (type === 'card') {
    return CARD_FALLBACKS[hash % CARD_FALLBACKS.length];
  }
  return CARD_FALLBACKS[hash % CARD_FALLBACKS.length];
}

/**
 * Handle image requests from R2
 * Returns fallback images when generated images aren't ready yet
 */
async function handleImage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.pathname.replace('/images/', '');

  const object = await env.IMAGES.get(key);

  if (object) {
    // Image exists in R2, serve it
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png');
    headers.set('Cache-Control', 'public, max-age=31536000');
    headers.set('ETag', object.etag);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });
  }

  // Image not found - redirect to appropriate fallback
  // Determine image type from the path (e.g., "slug/hero.png" -> "hero")
  const imageId = key.split('/').pop()?.replace(/\.\w+$/, '') || '';

  let fallbackUrl: string;
  if (imageId === 'hero') {
    fallbackUrl = getFallbackImage(key, 'hero');
  } else if (imageId.startsWith('card-') || imageId.includes('recipe')) {
    fallbackUrl = getFallbackImage(key, 'card');
  } else {
    fallbackUrl = getFallbackImage(key, 'default');
  }

  // Redirect to fallback image (302 so browser will check again later)
  return new Response(null, {
    status: 302,
    headers: {
      'Location': fallbackUrl,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * Proxy request to EDS origin
 */
async function proxyToEDS(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const edsUrl = `${env.EDS_ORIGIN}${url.pathname}${url.search}`;

  const response = await fetch(edsUrl, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers),
      'Host': new URL(env.EDS_ORIGIN).host,
    },
  });

  // Add CORS headers
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

/**
 * Generate URL slug from query
 */
function generateSlug(query: string): string {
  let slug = query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 80);

  // Add short hash for uniqueness
  const hash = simpleHash(query + Date.now()).slice(0, 6);
  return `${slug}-${hash}`;
}

/**
 * Simple hash function
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

/**
 * Render the generating page HTML
 */
function renderGeneratingPage(query: string, path: string, edsOrigin: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Creating Your Page | Vitamix</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${edsOrigin}/styles/styles.css">
  <link rel="stylesheet" href="${edsOrigin}/styles/skeleton.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; }
    .generating-container {
      max-width: 800px;
      margin: 100px auto;
      padding: 40px;
      text-align: center;
    }
    .generating-title {
      font-size: 28px;
      margin-bottom: 16px;
      color: #333;
    }
    .generating-query {
      color: #666;
      font-style: italic;
      margin-bottom: 40px;
      font-size: 18px;
    }
    .progress-indicator {
      display: flex;
      justify-content: center;
      gap: 8px;
      margin-bottom: 40px;
    }
    .progress-dot {
      width: 12px;
      height: 12px;
      background: #c00;
      border-radius: 50%;
      animation: pulse 1.5s ease-in-out infinite;
    }
    .progress-dot:nth-child(2) { animation-delay: 0.2s; }
    .progress-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.5; }
      50% { transform: scale(1.2); opacity: 1; }
    }
    #generation-content {
      text-align: left;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    #generation-content .section {
      margin-bottom: 40px;
      padding: 20px;
      background: #fff;
      border-radius: 8px;
    }
    #generation-content h1, #generation-content h2, #generation-content h3 {
      margin-top: 0;
    }
    #generation-content img {
      max-width: 100%;
      height: auto;
    }
    #generation-content .hero {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      align-items: center;
    }
    /* Hero with cropped image (non-ideal aspect ratio from RAG) */
    #generation-content .hero img[data-crop="true"] {
      object-fit: cover;
      width: 100%;
      height: 400px;
      border-radius: 8px;
    }
    /* Text-only hero variant (no image found) */
    #generation-content .hero.text-only {
      background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
      min-height: 300px;
      padding: 60px 40px;
      border-radius: 12px;
      color: #fff;
      grid-template-columns: 1fr;
      text-align: center;
    }
    #generation-content .hero.text-only h1 {
      color: #fff;
      font-size: 2.5rem;
    }
    #generation-content .hero.text-only p {
      color: rgba(255,255,255,0.85);
    }
    #generation-content .hero.text-only .button {
      background: #c00;
    }
    /* Recipe hero cropped images */
    #generation-content .recipe-hero img[data-crop="true"],
    #generation-content .recipe-hero-detail img[data-crop="true"] {
      object-fit: cover;
      width: 100%;
      height: 350px;
      border-radius: 8px;
    }
    #generation-content .recipe-hero.text-only,
    #generation-content .recipe-hero-detail.text-only {
      background: linear-gradient(135deg, #2d5a27 0%, #1e3d1a 100%);
      min-height: 250px;
      padding: 40px;
      border-radius: 12px;
      color: #fff;
    }
    #generation-content .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
    }
    #generation-content .cards > div {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }
    #generation-content .cards > div > div:last-child {
      padding: 16px;
    }
    #generation-content .columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 32px;
    }
    #generation-content .button {
      display: inline-block;
      padding: 12px 24px;
      background: #c00;
      color: #fff;
      text-decoration: none;
      border-radius: 4px;
    }
    @media (max-width: 768px) {
      #generation-content .hero {
        grid-template-columns: 1fr;
      }
    }
    .generation-status {
      color: #666;
      font-size: 14px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <main>
    <div class="generating-container" id="loading-state">
      <h1 class="generating-title">Creating Your Personalized Page</h1>
      <p class="generating-query">"${escapeHTML(query)}"</p>
      <div class="progress-indicator">
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
      </div>
      <p class="generation-status">Analyzing your request...</p>
    </div>
    <div id="generation-content"></div>
  </main>
  <script>
    (function() {
      console.log('Starting generation...');
      const query = ${JSON.stringify(query)};
      const slug = '${path.replace('/discover/', '')}';
      const streamUrl = '/api/stream?slug=' + encodeURIComponent(slug) + '&query=' + encodeURIComponent(query);
      console.log('Stream URL:', streamUrl);

      const loadingState = document.getElementById('loading-state');
      const content = document.getElementById('generation-content');
      const statusEl = loadingState.querySelector('.generation-status');
      let blockCount = 0;

      statusEl.textContent = 'Connecting to stream...';

      const eventSource = new EventSource(streamUrl);

      eventSource.onopen = function() {
        console.log('EventSource connected');
        statusEl.textContent = 'Connected, waiting for content...';
      };

      eventSource.addEventListener('layout', function(e) {
        console.log('Layout received:', e.data);
        const data = JSON.parse(e.data);
        statusEl.textContent = 'Generating ' + data.blocks.length + ' sections...';
      });

      eventSource.addEventListener('block-start', function(e) {
        console.log('Block start:', e.data);
        const data = JSON.parse(e.data);
        statusEl.textContent = 'Creating ' + data.blockType + ' section...';
      });

      eventSource.addEventListener('block-content', function(e) {
        console.log('Block content received for:', JSON.parse(e.data).blockId);
        const data = JSON.parse(e.data);

        if (blockCount === 0) {
          loadingState.style.display = 'none';
        }
        blockCount++;

        const section = document.createElement('div');
        section.className = 'section';
        section.dataset.genBlockId = data.blockId;
        section.innerHTML = data.html;
        content.appendChild(section);
      });

      eventSource.addEventListener('generation-complete', function(e) {
        console.log('Generation complete');
        eventSource.close();
      });

      eventSource.addEventListener('error', function(e) {
        console.log('SSE error event:', e);
        if (e.data) {
          const data = JSON.parse(e.data);
          loadingState.innerHTML = '<h1>Something went wrong</h1><p style="color: #c00;">' + data.message + '</p><p><a href="${edsOrigin}/">Return to homepage</a></p>';
        }
      });

      eventSource.onerror = function(e) {
        console.error('EventSource error:', e);
        console.log('ReadyState:', eventSource.readyState);
        if (eventSource.readyState === EventSource.CLOSED) {
          statusEl.textContent = 'Connection closed unexpectedly';
        } else if (eventSource.readyState === EventSource.CONNECTING) {
          statusEl.textContent = 'Reconnecting...';
        }
      };
    })();
  </script>
</body>
</html>
  `.trim();
}

/**
 * Render 404 page
 */
function renderNotFoundPage(path: string, edsOrigin: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Page Not Found | Vitamix</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="${edsOrigin}/styles/styles.css">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; }
  </style>
</head>
<body>
  <main>
    <div style="max-width: 600px; margin: 100px auto; text-align: center; padding: 40px;">
      <h1>Page Not Found</h1>
      <p>The page "${escapeHTML(path)}" doesn't exist yet.</p>
      <p><a href="${edsOrigin}/">Go to homepage</a> to generate a new page.</p>
    </div>
  </main>
</body>
</html>
  `.trim();
}

/**
 * Escape HTML
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Handle AI-powered ingredient matching
 * Uses Claude to suggest recipes based on user's ingredients
 */
async function handleIngredientMatch(request: Request, env: Env): Promise<Response> {
  try {
    const { ingredients } = await request.json() as { ingredients: string };

    if (!ingredients || ingredients.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Ingredients required' }), {
        status: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    // Call Claude to generate recipe suggestions based on ingredients
    const systemPrompt = `You are a Vitamix recipe expert. Given a list of ingredients, suggest 3-6 smoothie or blender recipes that can be made with those ingredients.

For each recipe, provide:
- title: A catchy recipe name
- difficulty: "Easy", "Medium", or "Hard"
- time: Prep time like "5 min", "10 min", etc.
- matchPercent: How well the user's ingredients match (70-100)
- description: One sentence describing the recipe
- missingIngredients: Array of 0-2 common ingredients they might need to add

Return ONLY valid JSON in this exact format:
{
  "recipes": [
    {
      "title": "Green Power Smoothie",
      "difficulty": "Easy",
      "time": "5 min",
      "matchPercent": 95,
      "description": "A nutrient-packed green smoothie with spinach and banana.",
      "missingIngredients": ["almond milk"]
    }
  ]
}`;

    const userPrompt = `Suggest Vitamix recipes using these ingredients: ${ingredients}

Consider:
- Prioritize recipes where the user has most ingredients
- Include a mix of smoothies and other blender recipes if possible
- Be creative but practical
- Higher matchPercent for recipes needing fewer additional ingredients`;

    const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.CEREBRAS_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cerebras API error:', errorText);
      throw new Error(`Cerebras API error: ${response.status}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const textContent = data.choices[0]?.message?.content;
    if (!textContent) {
      throw new Error('No text response from Cerebras');
    }

    // Parse the JSON response (strip markdown code blocks if present)
    let jsonText = textContent.trim();
    if (jsonText.startsWith('```')) {
      // Remove markdown code block wrapper
      jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    const recipeData = JSON.parse(jsonText);

    return new Response(JSON.stringify(recipeData), {
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('Ingredient match error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to find recipes',
      message: (error as Error).message,
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}

/**
 * Handle homepage setup - creates homepage with query-form block in DA
 */
async function handleSetupHomepage(request: Request, env: Env): Promise<Response> {
  try {
    const homepageHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Vitamix | Personalized Recipes & Tips</title>
  <meta name="description" content="Discover personalized Vitamix recipes, tips, and product recommendations tailored to your needs.">
</head>
<body>
  <header></header>
  <main>
    <div class="section hero">
      <div class="default-content-wrapper">
        <h1>Discover Your Perfect Vitamix Experience</h1>
        <p>Get personalized recipes, tips, and product recommendations powered by AI</p>
      </div>
      <div class="query-form">
        <div>
          <div>Placeholder</div>
          <div>What would you like to make with your Vitamix?</div>
        </div>
        <div>
          <div>Button</div>
          <div>Generate</div>
        </div>
        <div>
          <div>Examples</div>
          <div>best smoothie for energy, healthy soup recipes, cleaning my Vitamix</div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="columns">
        <div>
          <div>
            <h2>Personalized Recipes</h2>
            <p>Tell us what ingredients you have, your dietary preferences, or health goals - and we'll create custom recipes just for you.</p>
          </div>
          <div>
            <h2>Product Guidance</h2>
            <p>Not sure which Vitamix is right for you? Describe your cooking habits and we'll help you find the perfect match.</p>
          </div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="default-content-wrapper">
        <h2>Why Use AI-Powered Discovery?</h2>
        <p>Our intelligent system understands your unique needs and creates content specifically for you. Whether you're looking for recipes, product comparisons, or usage tips, just ask and we'll generate a personalized page in seconds.</p>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>`;

    const result = await persistAndPublish('/index', homepageHtml, [], env);

    if (!result.success) {
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Homepage created successfully',
      urls: result.urls,
    }), {
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}

/**
 * RAG Quality Check Endpoint
 * Runs predefined test cases to validate RAG improvements
 *
 * GET /api/rag-quality - Run all tests
 * GET /api/rag-quality?test=vegan - Run specific test
 * GET /api/rag-quality?verbose=true - Include full chunk details
 */
async function handleRAGQualityCheck(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const specificTest = url.searchParams.get('test');
  const verbose = url.searchParams.get('verbose') === 'true';

  // Define test cases for each improvement
  const testCases: Array<{
    id: string;
    name: string;
    improvement: string;
    query: string;
    userContext: UserContext;
    expectations: {
      mustNotContain?: string[];      // Terms that should be filtered out
      shouldBoost?: string[];         // Terms that should appear in top results
      queryAugmentation?: string[];   // Terms that should be added to query
    };
  }> = [
    // Improvement #1: Positive boosting (available/mustUse)
    {
      id: 'boost-available',
      name: 'Boost by available ingredients',
      improvement: '#1 Positive Boosting',
      query: 'smoothie recipe',
      userContext: {
        available: ['banana', 'spinach', 'almond milk'],
      },
      expectations: {
        shouldBoost: ['banana', 'spinach'],
      },
    },
    {
      id: 'boost-mustuse',
      name: 'Boost by must-use ingredients',
      improvement: '#1 Positive Boosting',
      query: 'breakfast recipe',
      userContext: {
        mustUse: ['ripe bananas'],
      },
      expectations: {
        shouldBoost: ['banana'],
      },
    },

    // Improvement #2: Dietary preference filtering
    {
      id: 'filter-vegan',
      name: 'Vegan preference filters meat/dairy',
      improvement: '#2 Dietary Filtering',
      query: 'smoothie recipe',
      userContext: {
        dietary: {
          avoid: [],
          preferences: ['vegan'],
        },
      },
      expectations: {
        mustNotContain: ['milk', 'yogurt', 'honey', 'whey', 'chicken', 'beef'],
      },
    },
    {
      id: 'filter-keto',
      name: 'Keto preference filters high-carb',
      improvement: '#2 Dietary Filtering',
      query: 'breakfast ideas',
      userContext: {
        dietary: {
          avoid: [],
          preferences: ['keto'],
        },
      },
      expectations: {
        mustNotContain: ['bread', 'pasta', 'rice', 'sugar'],
      },
    },
    {
      id: 'filter-avoid',
      name: 'Explicit avoid terms filtered',
      improvement: '#2 Dietary Filtering',
      query: 'soup recipe',
      userContext: {
        dietary: {
          avoid: ['carrots', 'celery'],
          preferences: [],
        },
      },
      expectations: {
        mustNotContain: ['carrot', 'celery'],
      },
    },

    // Improvement #3: Query augmentation
    {
      id: 'augment-diabetes',
      name: 'Diabetes condition augments query',
      improvement: '#3 Query Augmentation',
      query: 'smoothie',
      userContext: {
        health: {
          conditions: ['diabetes'],
          goals: [],
          considerations: [],
        },
      },
      expectations: {
        queryAugmentation: ['low sugar', 'diabetic friendly'],
      },
    },
    {
      id: 'augment-quick',
      name: 'Quick constraint augments query',
      improvement: '#3 Query Augmentation',
      query: 'breakfast',
      userContext: {
        constraints: ['quick'],
      },
      expectations: {
        queryAugmentation: ['quick', 'fast', 'easy'],
      },
    },

    // Improvement #4: Cuisine boosting
    {
      id: 'boost-cuisine',
      name: 'Cuisine preference boosts results',
      improvement: '#4 Cuisine Boosting',
      query: 'soup recipe',
      userContext: {
        cultural: {
          cuisine: ['thai', 'asian'],
          religious: [],
          regional: [],
        },
      },
      expectations: {
        shouldBoost: ['thai', 'asian'],
      },
    },

    // Improvement #11: Negative boosting (conflict penalization)
    // Note: Negative boosting PENALIZES (reduces score) but doesn't FILTER
    // These tests verify the feature runs without error; actual penalization is logged
    {
      id: 'penalize-conflicts-quick',
      name: 'Quick constraint activates conflict penalization',
      improvement: '#11 Negative Boosting',
      query: 'quick breakfast recipe',
      userContext: {
        constraints: ['quick'],
      },
      expectations: {
        // Just verify we get results (penalization is logged, not filtered)
        shouldBoost: ['breakfast'],
      },
    },
    {
      id: 'penalize-conflicts-simple',
      name: 'Simple constraint activates conflict penalization',
      improvement: '#11 Negative Boosting',
      query: 'simple smoothie recipe',
      userContext: {
        constraints: ['simple'],
      },
      expectations: {
        shouldBoost: ['smoothie'],
      },
    },

    // Improvement #12: Result diversity (tested via observation)
    {
      id: 'diversity-sources',
      name: 'Results show source diversity',
      improvement: '#12 Result Diversity',
      query: 'healthy smoothie recipes',
      userContext: {},
      expectations: {
        // This test passes if we get results - diversity is logged
        shouldBoost: ['smoothie'],
      },
    },

    // Improvement #14: Confidence fallbacks (quality assessment)
    {
      id: 'quality-assessment',
      name: 'Quality assessment returns valid level',
      improvement: '#14 Confidence Fallbacks',
      query: 'vitamix smoothie recipe',
      userContext: {},
      expectations: {
        // This test verifies quality is assessed - checked in results
        shouldBoost: ['smoothie', 'vitamix'],
      },
    },
  ];

  // Filter to specific test if requested
  const testsToRun = specificTest
    ? testCases.filter(t => t.id === specificTest || t.improvement.includes(specificTest))
    : testCases;

  if (testsToRun.length === 0) {
    return new Response(JSON.stringify({
      error: 'No matching tests found',
      availableTests: testCases.map(t => ({ id: t.id, name: t.name })),
    }), {
      status: 404,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  // Run tests
  const results: Array<{
    id: string;
    name: string;
    improvement: string;
    passed: boolean;
    details: {
      query: string;
      augmentedQuery?: string;
      totalResults: number;
      quality: string;  // [IMPROVEMENT #14] Include quality assessment
      violations: Array<{ type: string; term: string; foundIn: string }>;
      boostHits: Array<{ term: string; foundInTop: number; positions: number[] }>;
      topResults?: Array<{ title: string; score: number; snippet: string }>;
    };
  }> = [];

  for (const test of testsToRun) {
    // Create a mock intent for the test
    const intent: IntentClassification = {
      intentType: 'recipe',
      confidence: 0.9,
      layoutId: 'recipe-collection',
      contentTypes: ['recipe'],
      entities: {
        products: [],
        ingredients: [],
        goals: [],
        userContext: test.userContext,
      },
    };

    // Run RAG retrieval
    const context = await smartRetrieve(test.query, intent, env, test.userContext);

    // Check expectations
    const violations: Array<{ type: string; term: string; foundIn: string }> = [];
    const boostHits: Array<{ term: string; foundInTop: number; positions: number[] }> = [];

    // Check mustNotContain
    if (test.expectations.mustNotContain) {
      for (const term of test.expectations.mustNotContain) {
        for (const chunk of context.chunks) {
          const textLower = chunk.text.toLowerCase();
          const titleLower = (chunk.metadata.page_title || '').toLowerCase();
          if (textLower.includes(term) || titleLower.includes(term)) {
            violations.push({
              type: 'unwanted_term',
              term,
              foundIn: chunk.metadata.page_title || chunk.metadata.source_url,
            });
          }
        }
      }
    }

    // Check shouldBoost (term appears in top 3 results)
    if (test.expectations.shouldBoost) {
      const topChunks = context.chunks.slice(0, 5);
      for (const term of test.expectations.shouldBoost) {
        const positions: number[] = [];
        context.chunks.forEach((chunk, idx) => {
          if (chunk.text.toLowerCase().includes(term.toLowerCase())) {
            positions.push(idx + 1);
          }
        });
        const foundInTop = topChunks.filter(c =>
          c.text.toLowerCase().includes(term.toLowerCase())
        ).length;
        boostHits.push({ term, foundInTop, positions: positions.slice(0, 5) });
      }
    }

    const passed = violations.length === 0 &&
      (test.expectations.shouldBoost
        ? boostHits.some(h => h.foundInTop > 0)
        : true);

    results.push({
      id: test.id,
      name: test.name,
      improvement: test.improvement,
      passed,
      details: {
        query: test.query,
        totalResults: context.chunks.length,
        quality: context.quality,  // [IMPROVEMENT #14]
        violations,
        boostHits,
        topResults: verbose
          ? context.chunks.slice(0, 5).map(c => ({
              title: c.metadata.page_title,
              score: Math.round(c.score * 1000) / 1000,
              snippet: c.text.slice(0, 150) + '...',
            }))
          : undefined,
      },
    });
  }

  // Calculate summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  const response = {
    summary: {
      total: results.length,
      passed,
      failed,
      passRate: Math.round((passed / results.length) * 100) + '%',
      timestamp: new Date().toISOString(),
    },
    byImprovement: {
      '#1 Positive Boosting': results.filter(r => r.improvement === '#1 Positive Boosting'),
      '#2 Dietary Filtering': results.filter(r => r.improvement === '#2 Dietary Filtering'),
      '#3 Query Augmentation': results.filter(r => r.improvement === '#3 Query Augmentation'),
      '#4 Cuisine Boosting': results.filter(r => r.improvement === '#4 Cuisine Boosting'),
      '#11 Negative Boosting': results.filter(r => r.improvement === '#11 Negative Boosting'),
      '#12 Result Diversity': results.filter(r => r.improvement === '#12 Result Diversity'),
      '#14 Confidence Fallbacks': results.filter(r => r.improvement === '#14 Confidence Fallbacks'),
    },
    results,
  };

  return new Response(JSON.stringify(response, null, 2), {
    headers: corsHeaders({ 'Content-Type': 'application/json' }),
  });
}

/**
 * Handle content quality audit requests
 *
 * Comprehensive audit of generated content for brand safety, offensive content,
 * and content provenance (RAG vs generated).
 *
 * GET /api/content-audit - Run full audit with all test cases
 * GET /api/content-audit?mode=quick - Run quick audit (adversarial/high-risk only)
 * GET /api/content-audit?category=brand_voice - Run category-specific audit
 * GET /api/content-audit?query=green+smoothie - Audit a single custom query
 */
async function handleContentAudit(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const category = url.searchParams.get('category') as AuditTestCase['category'] | null;
  const customQuery = url.searchParams.get('query');

  try {
    let result;

    if (customQuery) {
      // Audit a single custom query
      const singleResult = await auditSingleQuery(
        env,
        decodeURIComponent(customQuery),
        category || 'standard'
      );
      result = {
        timestamp: new Date().toISOString(),
        mode: 'single',
        query: customQuery,
        result: singleResult,
      };
    } else if (mode === 'quick') {
      // Quick audit - adversarial/high-risk only
      result = await runQuickAudit(env);
    } else if (category) {
      // Category-specific audit
      result = await runCategoryAudit(env, category);
    } else {
      // Full audit
      result = await runContentAudit(env);
    }

    return new Response(JSON.stringify(result, null, 2), {
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('[handleContentAudit] Error:', error);
    return new Response(JSON.stringify({
      error: 'Audit failed',
      message: (error as Error).message,
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}

/**
 * Handle content provenance requests
 *
 * Analyzes content to determine how much is from RAG vs AI-generated,
 * and tracks recipe authenticity.
 *
 * POST /api/provenance - Analyze provenance for a query
 * Body: { query: string }
 *
 * Returns detailed provenance analysis including:
 * - Overall RAG vs generated ratio
 * - Per-block source attribution
 * - Recipe authenticity tracking
 */
async function handleProvenance(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  try {
    const { query } = await request.json() as { query: string };

    if (!query || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query required' }), {
        status: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    // Generate content to analyze provenance
    const startTime = Date.now();

    // 1. Classify intent
    const intent = await classifyIntent(query, env);

    // 2. Retrieve RAG context
    const ragContext = await smartRetrieve(query, intent, env, intent.entities.userContext);

    // 3. Get layout template
    const { getLayoutForIntent, adjustLayoutForRAGContent } = await import('./prompts/layouts');
    const layoutSelection = getLayoutForIntent(
      intent.intentType,
      intent.contentTypes,
      intent.entities,
      intent.layoutId,
      intent.confidence,
      query
    );
    let layoutTemplate = layoutSelection.layout;
    const userContext = layoutSelection.userContext;
    layoutTemplate = adjustLayoutForRAGContent(layoutTemplate, ragContext, query);

    // 4. Generate content
    const { generateContent } = await import('./ai-clients/cerebras');
    const content = await generateContent(query, ragContext, intent, layoutTemplate, env, undefined, userContext);

    // 5. Analyze provenance
    const provenance = analyzeContentProvenance(
      content,
      ragContext,
      query,
      intent.intentType,
      layoutTemplate.id
    );

    const processingTime = Date.now() - startTime;

    // Get summary for quick overview
    const summary = getProvenanceSummary(provenance);

    return new Response(JSON.stringify({
      query,
      processingTime,
      summary,
      provenance,
    }, null, 2), {
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (error) {
    console.error('[handleProvenance] Error:', error);
    return new Response(JSON.stringify({
      error: 'Provenance analysis failed',
      message: (error as Error).message,
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}

/**
 * Handle dashboard API requests
 *
 * Provides monitoring endpoints for content quality metrics:
 *
 * GET /api/dashboard/metrics?range=24h - Aggregated metrics
 * GET /api/dashboard/blocked?limit=100 - Blocked content log
 * GET /api/dashboard/provenance-stats - Provenance statistics
 * GET /api/dashboard/alerts - Active alerts
 * GET /api/dashboard/summary - Quick summary of all data
 */
async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/dashboard/', '');

  try {
    switch (path) {
      case 'metrics': {
        const range = (url.searchParams.get('range') || '24h') as '1h' | '24h' | '7d';
        const metrics = await getAggregatedMetrics(env, range);
        return new Response(JSON.stringify(metrics, null, 2), {
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
        });
      }

      case 'blocked': {
        const limit = parseInt(url.searchParams.get('limit') || '100', 10);
        const blocked = await getBlockedContentLog(env, limit);
        return new Response(JSON.stringify({
          count: blocked.length,
          logs: blocked,
        }, null, 2), {
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
        });
      }

      case 'provenance-stats': {
        const metrics = await getAggregatedMetrics(env, '24h');
        return new Response(JSON.stringify({
          period: metrics.period,
          provenance: metrics.provenance,
          summary: {
            ragPercentage: metrics.provenance.averageRagContribution,
            sourceDistribution: metrics.provenance.sourceDistribution,
            recipeBreakdown: metrics.provenance.recipeBreakdown,
          },
        }, null, 2), {
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
        });
      }

      case 'alerts': {
        const metrics = await getAggregatedMetrics(env, '24h');
        const alerts = await checkAlerts(env, metrics);
        return new Response(JSON.stringify({
          count: alerts.length,
          alerts,
          summary: {
            critical: alerts.filter(a => a.severity === 'critical').length,
            warning: alerts.filter(a => a.severity === 'warning').length,
            info: alerts.filter(a => a.severity === 'info').length,
          },
        }, null, 2), {
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
        });
      }

      case 'summary': {
        // Quick summary of all dashboard data
        const metrics = await getAggregatedMetrics(env, '24h');
        const alerts = await checkAlerts(env, metrics);
        const blockedRecent = await getBlockedContentLog(env, 10);

        return new Response(JSON.stringify({
          timestamp: new Date().toISOString(),
          period: metrics.period,
          safety: {
            totalGenerated: metrics.safety.totalGenerated,
            blocked: metrics.safety.blocked,
            blockRate: `${(metrics.safety.blockRate * 100).toFixed(1)}%`,
            averageBrandScore: metrics.safety.averageBrandScore.toFixed(1),
          },
          provenance: {
            ragPercentage: `${metrics.provenance.averageRagContribution}%`,
            aiGeneratedRecipes: metrics.provenance.recipeBreakdown.aiGenerated,
          },
          performance: {
            averageLatency: `${metrics.performance.averageLatency.toFixed(0)}ms`,
            p95Latency: `${metrics.performance.p95Latency.toFixed(0)}ms`,
          },
          alerts: {
            count: alerts.length,
            critical: alerts.filter(a => a.severity === 'critical').length,
            warning: alerts.filter(a => a.severity === 'warning').length,
          },
          recentBlocked: blockedRecent.slice(0, 5).map(b => ({
            query: b.query,
            reason: b.reason,
          })),
        }, null, 2), {
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
        });
      }

      case 'errors': {
        // List recent errors from KV
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const errors: any[] = [];

        // List all error keys
        const list = await env.CACHE.list({ prefix: 'error:' });

        // Sort by timestamp (newest first) and limit
        const sortedKeys = list.keys
          .sort((a, b) => {
            // Extract timestamp from key format: error:{timestamp}-{random}
            const tsA = parseInt(a.name.split(':')[1]?.split('-')[0] || '0', 10);
            const tsB = parseInt(b.name.split(':')[1]?.split('-')[0] || '0', 10);
            return tsB - tsA;
          })
          .slice(0, limit);

        // Fetch error details
        for (const key of sortedKeys) {
          const errorData = await env.CACHE.get(key.name, 'json');
          if (errorData) {
            errors.push(errorData);
          }
        }

        return new Response(JSON.stringify({
          count: errors.length,
          total: list.keys.length,
          errors,
        }, null, 2), {
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
        });
      }

      default:
        return new Response(JSON.stringify({
          error: 'Unknown dashboard endpoint',
          available: ['/metrics', '/blocked', '/provenance-stats', '/alerts', '/summary', '/errors'],
        }), {
          status: 404,
          headers: corsHeaders({ 'Content-Type': 'application/json' }),
        });
    }
  } catch (error) {
    console.error('[handleDashboard] Error:', error);
    return new Response(JSON.stringify({
      error: 'Dashboard request failed',
      message: (error as Error).message,
    }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}

/**
 * Test Imagen API
 */
async function testImagenAPI(env: Env): Promise<Response> {
  const results: Record<string, unknown> = {
    test: 'Imagen 3 via Vertex AI',
    timestamp: new Date().toISOString(),
  };

  try {
    if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      results.error = 'GOOGLE_SERVICE_ACCOUNT_JSON secret not configured';
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const serviceAccount = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
    results.serviceAccount = {
      email: serviceAccount.client_email,
      projectId: serviceAccount.project_id,
    };

    // Import the imagen module to use its token generation
    const { generateImagesWithImagen } = await import('./ai-clients/imagen');

    // Try to generate a test image
    results.step = 'Generating test image...';
    const testRequest = {
      id: 'test-image',
      prompt: 'A simple red apple on white background, product photography',
      size: 'card' as const,
      blockId: 'test',
    };

    const startTime = Date.now();
    const images = await generateImagesWithImagen([testRequest], 'api-test', env);
    const elapsed = Date.now() - startTime;

    results.elapsed = `${elapsed}ms`;
    results.imagesReturned = images.length;

    if (images.length > 0) {
      const image = images[0];
      results.imageUrl = image.url;
      results.isPlaceholder = image.url.startsWith('data:');
      results.isFallback = image.url.includes('unsplash.com');
      results.success = !results.isPlaceholder && !results.isFallback;
    }

  } catch (error: unknown) {
    const err = error as Error;
    results.error = err.message;
    results.stack = err.stack?.split('\n').slice(0, 5);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

/**
 * Test Fal API
 */
async function testFalAPI(env: Env): Promise<Response> {
  const results: Record<string, unknown> = {
    test: 'Fal.ai FLUX Schnell',
    timestamp: new Date().toISOString(),
  };

  try {
    if (!env.FAL_API_KEY) {
      results.error = 'FAL_API_KEY secret not configured';
      return new Response(JSON.stringify(results, null, 2), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    results.apiKey = 'CONFIGURED';

    // Import the fal module
    const { generateImagesWithFal } = await import('./ai-clients/fal');

    // Try to generate a test image
    results.step = 'Generating test image...';
    const testRequest = {
      id: 'test-image',
      prompt: 'A simple red apple on white background, product photography',
      size: 'card' as const,
      blockId: 'test',
    };

    const startTime = Date.now();
    const images = await generateImagesWithFal([testRequest], 'api-test', env);
    const elapsed = Date.now() - startTime;

    results.elapsed = `${elapsed}ms`;
    results.imagesReturned = images.length;

    if (images.length > 0) {
      const image = images[0];
      results.imageUrl = image.url;
      results.isPlaceholder = image.url.startsWith('data:');
      results.isFallback = image.url.includes('unsplash.com');
      results.success = !results.isPlaceholder && !results.isFallback;
    }

  } catch (error: unknown) {
    const err = error as Error;
    results.error = err.message;
    results.stack = err.stack?.split('\n').slice(0, 5);
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

/**
 * Handle single query classification - POST /api/classify
 * Returns just the intent classification without generating content
 */
async function handleClassify(request: Request, env: Env): Promise<Response> {
  try {
    const { query } = await request.json() as { query: string };

    if (!query) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const startTime = Date.now();
    const intent = await classifyIntent(query, env);
    const elapsed = Date.now() - startTime;

    return new Response(JSON.stringify({
      query,
      layoutId: intent.layoutId,
      intentType: intent.intentType,
      confidence: intent.confidence,
      contentTypes: intent.contentTypes,
      entities: intent.entities,
      elapsed,
    }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    const err = error as Error;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

/**
 * Handle batch classification - POST /api/classify-batch
 * Classifies multiple queries and returns results with expected vs actual comparison
 */
async function handleClassifyBatch(request: Request, env: Env): Promise<Response> {
  try {
    const { queries } = await request.json() as {
      queries: Array<{ query: string; expected: string }>;
    };

    if (!queries || !Array.isArray(queries)) {
      return new Response(JSON.stringify({ error: 'Queries array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const results: Array<{
      index: number;
      query: string;
      expected: string;
      actual: string;
      passed: boolean;
      intentType: string;
      confidence: number;
      elapsed: number;
      error?: string;
    }> = [];

    // Process in batches of 5 for concurrency
    const batchSize = 5;
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const batchPromises = batch.map(async (tc, j) => {
        const index = i + j;
        const startTime = Date.now();
        try {
          const intent = await classifyIntent(tc.query, env);
          return {
            index: index + 1,
            query: tc.query,
            expected: tc.expected,
            actual: intent.layoutId,
            passed: intent.layoutId === tc.expected,
            intentType: intent.intentType,
            confidence: intent.confidence,
            elapsed: Date.now() - startTime,
          };
        } catch (error) {
          const err = error as Error;
          return {
            index: index + 1,
            query: tc.query,
            expected: tc.expected,
            actual: 'ERROR',
            passed: false,
            intentType: 'error',
            confidence: 0,
            elapsed: Date.now() - startTime,
            error: err.message,
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + batchSize < queries.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    // Calculate summary statistics
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const errors = results.filter(r => r.actual === 'ERROR').length;
    const accuracy = ((passed / results.length) * 100).toFixed(1);

    // Group by expected layout
    const byLayout: Record<string, { total: number; passed: number; failures: Array<{ query: string; actual: string }> }> = {};
    for (const r of results) {
      if (!byLayout[r.expected]) {
        byLayout[r.expected] = { total: 0, passed: 0, failures: [] };
      }
      byLayout[r.expected].total++;
      if (r.passed) {
        byLayout[r.expected].passed++;
      } else {
        byLayout[r.expected].failures.push({ query: r.query, actual: r.actual });
      }
    }

    // Confusion matrix
    const confusionMatrix: Record<string, number> = {};
    for (const r of results) {
      if (!r.passed && r.actual !== 'ERROR') {
        const key = `${r.expected} → ${r.actual}`;
        confusionMatrix[key] = (confusionMatrix[key] || 0) + 1;
      }
    }

    return new Response(JSON.stringify({
      metadata: {
        timestamp: new Date().toISOString(),
        totalQueries: queries.length,
      },
      summary: {
        total: results.length,
        passed,
        failed,
        errors,
        accuracy: `${accuracy}%`,
      },
      byLayout,
      confusionMatrix,
      results,
    }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    const err = error as Error;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

/**
 * Handle image migration from adaptive-web
 *
 * GET /api/migrate-images - Get stats about what would be migrated
 * POST /api/migrate-images - Run the migration
 *
 * Query params:
 * - dryRun: "true" to simulate without actually indexing (default for GET)
 * - limit: Max images to migrate (default 10000)
 * - batchSize: Images per batch (default 50)
 * - types: Comma-separated image types (default: recipe,product,blog,page)
 */
/**
 * Test image search endpoint with aspect ratio filtering
 * GET /api/test-image-search?q=green+smoothie&type=recipe&limit=5&block=hero
 */
async function handleTestImageSearch(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || 'smoothie';
  const imageType = url.searchParams.get('type') as 'product' | 'recipe' | 'lifestyle' | null;
  const blockType = url.searchParams.get('block') || undefined;
  const limit = parseInt(url.searchParams.get('limit') || '5', 10);
  const extractDims = url.searchParams.get('dims') === 'true';

  if (!env.IMAGE_INDEX) {
    return new Response(JSON.stringify({ error: 'IMAGE_INDEX not configured' }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }

  // Import dimension utilities
  const { getDimensions, isDimensionsSuitableForBlock, BLOCK_ASPECT_PREFERENCES } = await import('./lib/image-dimensions');

  try {
    // Generate embedding for query
    const result = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
      text: [query],
    }) as { data: number[][] };
    const embedding = result.data[0];

    // Build filter if type specified
    const filter = imageType ? { image_type: { $eq: imageType } } : undefined;

    // Fetch more results if filtering by block type
    const fetchLimit = blockType ? limit * 4 : limit;

    // Query image index
    const results = await env.IMAGE_INDEX.query(embedding, {
      topK: fetchLimit,
      filter,
      returnMetadata: 'all',
    });

    // Process results with optional dimension extraction and filtering
    const images = [];
    for (const match of results.matches) {
      if (images.length >= limit) break;

      const imageUrl = (match.metadata as any)?.url || (match.metadata as any)?.image_url;
      if (!imageUrl) continue;

      let dimensions = null;
      let suitable = true;

      // Extract dimensions if requested or filtering by block type
      if (extractDims || blockType) {
        dimensions = await getDimensions(imageUrl, env);
        if (blockType && dimensions) {
          suitable = isDimensionsSuitableForBlock(dimensions, blockType);
        }
      }

      // Skip if not suitable for block type
      if (blockType && !suitable) continue;

      images.push({
        id: match.id,
        score: Math.round(match.score * 1000) / 1000,
        url: imageUrl,
        alt_text: (match.metadata as any)?.alt_text,
        image_type: (match.metadata as any)?.image_type,
        context: (match.metadata as any)?.context?.slice(0, 100),
        source_url: (match.metadata as any)?.source_url,
        ...(dimensions && {
          dimensions: {
            width: dimensions.width,
            height: dimensions.height,
            aspectRatio: Math.round(dimensions.aspectRatio * 100) / 100,
            aspectCategory: dimensions.aspectCategory,
          },
        }),
        ...(blockType && { suitableForBlock: suitable }),
      });
    }

    return new Response(JSON.stringify({
      query,
      imageType: imageType || 'any',
      blockType: blockType || null,
      blockPreferences: blockType ? BLOCK_ASPECT_PREFERENCES[blockType] : null,
      results: images,
      total: images.length,
      scanned: results.matches.length,
    }, null, 2), {
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });

  } catch (error) {
    const err = error as Error;
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}

async function handleMigrateImages(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const dryRun = request.method === 'GET' || url.searchParams.get('dryRun') === 'true';
  const limit = parseInt(url.searchParams.get('limit') || '10000', 10);
  const batchSize = parseInt(url.searchParams.get('batchSize') || '50', 10);
  const types = url.searchParams.get('types')?.split(',') || ['recipe', 'product', 'blog', 'page'];

  try {
    // Check required bindings
    if (!env.ADAPTIVE_WEB_DB) {
      return new Response(JSON.stringify({
        success: false,
        error: 'ADAPTIVE_WEB_DB binding not configured. Add it to wrangler.toml.',
      }, null, 2), {
        status: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    if (!env.IMAGE_INDEX) {
      return new Response(JSON.stringify({
        success: false,
        error: 'IMAGE_INDEX binding not configured. Add it to wrangler.toml.',
      }, null, 2), {
        status: 500,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    // Create env with required bindings for type safety
    const migrationEnv = env as typeof env & { IMAGE_INDEX: VectorizeIndex; ADAPTIVE_WEB_DB: D1Database };

    // GET request - just return stats
    if (request.method === 'GET' && !url.searchParams.has('dryRun')) {
      const stats = await getIndexStats(migrationEnv);
      return new Response(JSON.stringify({
        message: 'Image migration stats',
        stats,
        usage: {
          'GET /api/migrate-images': 'Get stats',
          'GET /api/migrate-images?dryRun=true': 'Preview migration without changes',
          'POST /api/migrate-images': 'Run migration',
          'POST /api/migrate-images?limit=1000': 'Migrate up to 1000 images',
          'POST /api/migrate-images?types=recipe,product': 'Migrate only recipe and product images',
        },
      }, null, 2), {
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    // Run migration
    console.log(`[Migration] Starting migration: dryRun=${dryRun}, limit=${limit}, batchSize=${batchSize}, types=${types.join(',')}`);

    const result = await migrateImages(migrationEnv, {
      dryRun,
      limit,
      batchSize,
      imageTypes: types,
    });

    return new Response(JSON.stringify(result, null, 2), {
      status: result.success ? 200 : 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });

  } catch (error) {
    console.error('[Migration] Error:', error);
    const err = error as Error;
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
      stack: err.stack?.split('\n').slice(0, 5),
    }, null, 2), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}
