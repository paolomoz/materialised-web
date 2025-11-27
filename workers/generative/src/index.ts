import type { Env, GenerationState } from './types';
import { orchestrate } from './lib/orchestrator';
import { createCallbackSSEStream } from './lib/stream-handler';
import { persistAndPublish, DAClient } from './lib/da-client';

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

    // Generate page endpoint (POST with query)
    if (url.pathname === '/api/generate' && request.method === 'POST') {
      return handleGenerate(request, env);
    }

    // SSE stream for generation (GET with query param)
    if (url.pathname === '/api/stream') {
      return handleStream(request, env);
    }

    // Proxy to EDS or serve generated page
    if (url.pathname.startsWith('/discover/')) {
      return handleDiscover(request, env);
    }

    // Serve generated images from R2
    if (url.pathname.startsWith('/images/')) {
      return handleImage(request, env);
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

  if (!query || !slug) {
    return new Response('Missing query or slug', { status: 400 });
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
      // Run orchestration
      const result = await orchestrate(query, slug, env, emit);

      // Persist to DA in background
      persistAndPublish(path, result.html, [], env)
        .then(async (publishResult) => {
          if (publishResult.success) {
            await env.CACHE.put(`generation:${path}`, JSON.stringify({
              status: 'complete',
              query,
              slug,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              pageUrl: path,
            } as GenerationState), { expirationTtl: 86400 });
          } else {
            console.error('Failed to persist:', publishResult.error);
          }
        })
        .catch(console.error);

    } catch (error) {
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
 * Handle /discover/* routes
 */
async function handleDiscover(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const slug = path.replace('/discover/', '');
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
 * Handle image requests from R2
 */
async function handleImage(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.pathname.replace('/images/', '');

  const object = await env.IMAGES.get(key);

  if (!object) {
    return new Response('Image not found', { status: 404 });
  }

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'image/png');
  headers.set('Cache-Control', 'public, max-age=31536000');
  headers.set('ETag', object.etag);

  return new Response(object.body, { headers });
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
    }
    #generation-content .section {
      margin-bottom: 40px;
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
  <script type="module">
    const eventSource = new EventSource('${path}');
    const loadingState = document.getElementById('loading-state');
    const content = document.getElementById('generation-content');
    const statusEl = loadingState.querySelector('.generation-status');
    let blockCount = 0;

    eventSource.addEventListener('layout', (e) => {
      const data = JSON.parse(e.data);
      statusEl.textContent = 'Generating ' + data.blocks.length + ' sections...';
    });

    eventSource.addEventListener('block-start', (e) => {
      const data = JSON.parse(e.data);
      statusEl.textContent = 'Creating ' + data.blockType + ' section...';
    });

    eventSource.addEventListener('block-content', (e) => {
      const data = JSON.parse(e.data);
      // Hide loading state after first block
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

    eventSource.addEventListener('generation-complete', (e) => {
      const data = JSON.parse(e.data);
      statusEl.textContent = 'Page created successfully!';
      // Don't reload - content is already displayed
    });

    eventSource.addEventListener('error', (e) => {
      if (e.data) {
        const data = JSON.parse(e.data);
        loadingState.innerHTML = '<h1>Something went wrong</h1><p style="color: #c00;">' + data.message + '</p><p><a href="${edsOrigin}/">Return to homepage</a></p>';
      }
      eventSource.close();
    });

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        statusEl.textContent = 'Connection closed';
      }
    };
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
