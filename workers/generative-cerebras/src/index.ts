import type { Env, GenerationState } from './types';
import { orchestrate } from './lib/orchestrator';
import { createCallbackSSEStream } from './lib/stream-handler';
import { persistAndPublish, DAClient, createPlaceholderPage } from './lib/da-client';
import { classifyIntent } from './ai-clients/cerebras';
import {
  classifyCategory,
  generateSemanticSlug,
  buildCategorizedPath,
  isCategoryPath,
  getCategoryFromPath,
} from './lib/category-classifier';

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
    const daResult = await createPlaceholderPage(path, query, slug, env, sourceOrigin);

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
  const imageProvider = url.searchParams.get('images') as 'fal' | 'lora' | 'imagen' | null;

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
      // Run orchestration with optional image provider override
      const result = await orchestrate(query, slug, env, emit, imageProvider || undefined);

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
 */
async function handlePersist(request: Request, env: Env): Promise<Response> {
  try {
    const { slug, query, html } = await request.json() as {
      slug: string;
      query: string;
      html: string[];
    };

    if (!slug || !html || !Array.isArray(html)) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), {
        status: 400,
        headers: corsHeaders({ 'Content-Type': 'application/json' }),
      });
    }

    const path = `/discover/${slug}`;

    // Build the full HTML page for DA
    const pageHtml = buildDAPageHtml(query, html);

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
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: corsHeaders({ 'Content-Type': 'application/json' }),
    });
  }
}

/**
 * Build DA-compatible HTML page from generated blocks
 */
function buildDAPageHtml(query: string, blocks: string[]): string {
  // Extract title from first h1 if present
  let title = query;
  const firstBlock = blocks[0] || '';
  const h1Match = firstBlock.match(/<h1[^>]*>([^<]+)<\/h1>/);
  if (h1Match) {
    title = h1Match[1];
  }

  // Wrap each block in a div for EDS sections
  const sectionsHtml = blocks.map(block => `<div>${block}</div>`).join('\n');

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
