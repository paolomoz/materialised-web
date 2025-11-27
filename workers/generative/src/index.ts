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

  // Check if this is an SSE request for generation
  const accept = request.headers.get('Accept') || '';
  if (accept.includes('text/event-stream')) {
    // Extract query from URL or check cache
    const state = await env.CACHE.get(`generation:${path}`, 'json') as GenerationState | null;
    if (state?.query) {
      const slug = path.replace('/discover/', '');
      return handleStream(
        new Request(`${url.origin}/api/stream?slug=${slug}&query=${encodeURIComponent(state.query)}`),
        env
      );
    }
  }

  // Check if page exists in DA (proxy to EDS)
  const daClient = new DAClient(env);
  const exists = await daClient.exists(path);

  if (exists) {
    // Proxy to EDS
    return proxyToEDS(request, env);
  }

  // Check generation state
  const state = await env.CACHE.get(`generation:${path}`, 'json') as GenerationState | null;

  if (state?.status === 'in_progress') {
    // Return generating page that connects to SSE
    return new Response(renderGeneratingPage(state.query, path), {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }

  if (state?.status === 'complete') {
    // Try proxy again (might have been published)
    return proxyToEDS(request, env);
  }

  // Page doesn't exist - return 404 or redirect to generation
  return new Response(renderNotFoundPage(path), {
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
function renderGeneratingPage(query: string, path: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Generating Page...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="/styles/styles.css">
  <link rel="stylesheet" href="/styles/skeleton.css">
  <style>
    .generating-container {
      max-width: 800px;
      margin: 100px auto;
      padding: 40px;
      text-align: center;
    }
    .generating-title {
      font-size: 24px;
      margin-bottom: 20px;
    }
    .generating-query {
      color: #666;
      font-style: italic;
      margin-bottom: 40px;
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
      background: #ddd;
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
    }
  </style>
</head>
<body>
  <header></header>
  <main>
    <div class="generating-container">
      <h1 class="generating-title">Creating Your Personalized Page</h1>
      <p class="generating-query">"${escapeHTML(query)}"</p>
      <div class="progress-indicator">
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
        <div class="progress-dot"></div>
      </div>
      <div id="generation-content"></div>
    </div>
  </main>
  <footer></footer>
  <script type="module">
    const eventSource = new EventSource('${path}');
    const content = document.getElementById('generation-content');

    eventSource.addEventListener('block-content', (e) => {
      const data = JSON.parse(e.data);
      const div = document.createElement('div');
      div.innerHTML = data.html;
      content.appendChild(div);
    });

    eventSource.addEventListener('generation-complete', (e) => {
      const data = JSON.parse(e.data);
      // Reload to get the final page
      setTimeout(() => window.location.reload(), 1000);
    });

    eventSource.addEventListener('error', (e) => {
      if (e.data) {
        const data = JSON.parse(e.data);
        content.innerHTML = '<p style="color: red;">Error: ' + data.message + '</p>';
      }
      eventSource.close();
    });
  </script>
</body>
</html>
  `.trim();
}

/**
 * Render 404 page
 */
function renderNotFoundPage(path: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Page Not Found</title>
  <link rel="stylesheet" href="/styles/styles.css">
</head>
<body>
  <header></header>
  <main>
    <div style="max-width: 600px; margin: 100px auto; text-align: center; padding: 40px;">
      <h1>Page Not Found</h1>
      <p>The page "${escapeHTML(path)}" doesn't exist yet.</p>
      <p><a href="/">Go to homepage</a> to generate a new page.</p>
    </div>
  </main>
  <footer></footer>
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
