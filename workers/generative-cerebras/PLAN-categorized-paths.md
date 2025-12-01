# Plan: Categorized DA Paths with First-Render Injection

## Goal
Transform the generation flow so that:
- Generated pages appear at proper DA paths like `/smoothies/green-smoothies-abcd`
- Users see content immediately via first-render injection
- Pages persist to DA and work normally on subsequent visits

## Architecture Overview

```
User clicks Explore
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Worker: /?q=green+smoothie+recipes                         │
│  1. Classify intent → /smoothies/                           │
│  2. Generate semantic slug → green-smoothies-a1b2           │
│  3. Create DA page with placeholder block (parallel)        │
│  4. Start content generation (parallel)                     │
│  5. When DA page ready → 302 redirect                       │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  DA Page: /smoothies/green-smoothies-a1b2                   │
│  Contains: cerebras-generated block                         │
│  Block JS:                                                  │
│    - Read query/slug from metadata                          │
│    - Connect to worker SSE stream                           │
│    - Render blocks as they arrive                           │
│    - Hide placeholder when content flows                    │
└─────────────────────────────────────────────────────────────┘
       │
       ▼ (background, after content complete)
┌─────────────────────────────────────────────────────────────┐
│  Worker: Persist final content to DA                        │
│  - Replace placeholder block with actual generated blocks   │
│  - Republish page                                           │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Subsequent visits: Normal DA page                          │
│  - No placeholder block                                     │
│  - All content persisted                                    │
│  - Works offline, shareable, etc.                           │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Step 1: Create `cerebras-generated` Block
**Files:** `blocks/cerebras-generated/cerebras-generated.js`, `blocks/cerebras-generated/cerebras-generated.css`

The block:
- Reads `query` and `slug` from block content or page metadata
- Shows loading state initially
- Connects to worker SSE: `WORKER_URL/api/stream?slug=X&query=Y`
- Renders each block as it arrives (reusing existing block rendering logic)
- Hides itself when content arrives
- Handles errors gracefully

```javascript
// blocks/cerebras-generated/cerebras-generated.js
export default async function decorate(block) {
  // Get query/slug from block content
  const rows = [...block.querySelectorAll(':scope > div')];
  const query = rows[0]?.textContent?.trim();
  const slug = rows[1]?.textContent?.trim();

  if (!query || !slug) {
    // No generation needed - page already has content
    block.remove();
    return;
  }

  // Show loading state
  block.innerHTML = `<div class="cerebras-loading">Generating your personalized page...</div>`;

  // Connect to worker stream
  const workerUrl = 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';
  const streamUrl = `${workerUrl}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}`;

  const eventSource = new EventSource(streamUrl);
  const main = document.querySelector('main');

  eventSource.addEventListener('block-content', (e) => {
    const data = JSON.parse(e.data);
    // Insert block content before the placeholder
    const section = document.createElement('div');
    section.className = 'section';
    section.innerHTML = data.html;
    block.parentElement.insertBefore(section, block);
  });

  eventSource.addEventListener('generation-complete', () => {
    eventSource.close();
    block.remove(); // Remove placeholder
  });

  eventSource.onerror = () => {
    block.innerHTML = `<div class="cerebras-error">Generation failed. Please try again.</div>`;
    eventSource.close();
  };
}
```

### Step 2: Add Category Classifier
**File:** `workers/generative-cerebras/src/lib/category-classifier.ts`

```typescript
export type CategoryPath = 'smoothies' | 'recipes' | 'products' | 'compare' | 'tips' | 'discover';

export function classifyCategory(intent: IntentClassification, query: string): CategoryPath {
  // Map intent to category
  if (intent.intentType === 'recipe') {
    if (query.toLowerCase().includes('smoothie')) return 'smoothies';
    return 'recipes';
  }
  if (intent.intentType === 'product_info') return 'products';
  if (intent.intentType === 'comparison') return 'compare';
  if (intent.intentType === 'support') return 'tips';
  return 'discover';
}

export function generateSemanticSlug(query: string, intent: IntentClassification): string {
  // Extract key concepts, create slug, add hash for uniqueness
  const keywords = extractKeywords(query).slice(0, 4).join('-');
  const hash = simpleHash(query + Date.now()).slice(0, 6);
  return `${keywords}-${hash}`;
}
```

### Step 3: Create Placeholder DA Page Function
**File:** `workers/generative-cerebras/src/lib/da-client.ts` (add function)

```typescript
export async function createPlaceholderPage(
  path: string,
  query: string,
  slug: string,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  // Create minimal HTML with cerebras-generated block
  const html = `
<html>
<head>
  <title>Loading... | Vitamix</title>
  <meta name="description" content="Generating personalized content">
</head>
<body>
  <header></header>
  <main>
    <div>
      <div class="cerebras-generated">
        <div>${query}</div>
        <div>${slug}</div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>`;

  return persistAndPublish(path, html, [], env);
}
```

### Step 4: Update Worker Entry Point
**File:** `workers/generative-cerebras/src/index.ts`

Add new endpoint handler:

```typescript
// NEW: Query redirect endpoint
// /?q=green+smoothie -> creates DA page, redirects to it
if (url.pathname === '/' && url.searchParams.has('q')) {
  return handleQueryRedirect(request, env, ctx);
}

async function handleQueryRedirect(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();
  const imageProvider = url.searchParams.get('images') as 'fal' | 'imagen' | null;

  if (!query) {
    return new Response('Missing query', { status: 400 });
  }

  // 1. Classify intent (fast, ~200ms with Cerebras)
  const intent = await classifyIntent(query, env);

  // 2. Determine category and slug
  const category = classifyCategory(intent, query);
  const slug = generateSemanticSlug(query, intent);
  const path = `/${category}/${slug}`;

  // 3. Store generation state in KV
  await env.CACHE.put(`generation:${path}`, JSON.stringify({
    status: 'pending',
    query,
    slug,
    path,
    imageProvider: imageProvider || 'fal',
    intent,
    createdAt: new Date().toISOString(),
  }), { expirationTtl: 600 });

  // 4. Create placeholder DA page (fire and await)
  const daResult = await createPlaceholderPage(path, query, slug, env);

  if (!daResult.success) {
    return new Response(JSON.stringify({ error: 'Failed to create page' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 5. Redirect to DA page
  const daOrigin = env.EDS_ORIGIN; // e.g., https://main--materialised-web--paolomoz.aem.page
  return Response.redirect(`${daOrigin}${path}`, 302);
}
```

### Step 5: Update Frontend to Use New Flow
**File:** `scripts/cerebras-scripts.js`

```javascript
function startGeneration(query) {
  const imageProvider = getImageQuality() === 'best' ? 'imagen' : 'fal';
  const workerUrl = 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';

  // Redirect to worker, which will:
  // 1. Create DA page
  // 2. Redirect to DA page
  // 3. DA page loads cerebras-generated block
  // 4. Block streams content from worker
  window.location.href = `${workerUrl}/?q=${encodeURIComponent(query)}&images=${imageProvider}`;
}
```

### Step 6: Background Content Persistence
**In the stream handler**, after generation completes:

```typescript
// After all blocks generated, persist to DA in background
ctx.waitUntil(async () => {
  // Wait a bit for images to complete (or do it without images first)
  const finalHtml = buildFullPageHtml(generatedBlocks);
  await persistAndPublish(path, finalHtml, [], env);

  // Update KV state
  await env.CACHE.put(`generation:${path}`, JSON.stringify({
    status: 'complete',
    // ...
  }), { expirationTtl: 86400 });
});
```

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `blocks/cerebras-generated/cerebras-generated.js` | CREATE | New block for first-render injection |
| `blocks/cerebras-generated/cerebras-generated.css` | CREATE | Loading/error styles |
| `workers/generative-cerebras/src/lib/category-classifier.ts` | CREATE | Intent-to-category mapping |
| `workers/generative-cerebras/src/lib/da-client.ts` | MODIFY | Add `createPlaceholderPage()` |
| `workers/generative-cerebras/src/index.ts` | MODIFY | Add `/?q=` handler |
| `workers/generative-cerebras/src/types.ts` | MODIFY | Add new types if needed |
| `scripts/cerebras-scripts.js` | MODIFY | Update `startGeneration()` |
| `blocks/header/header.js` | MODIFY | Update search to use new flow |

## Testing Plan

1. **Unit test category classifier**: Various queries → correct categories
2. **Test DA page creation**: Verify placeholder page created correctly
3. **Test redirect flow**: Query → worker → DA page
4. **Test block streaming**: cerebras-generated block receives and renders content
5. **Test persistence**: After generation, page content saved to DA
6. **Test reload**: Subsequent visits load persisted content

## Open Questions

1. **Image handling**: Should we wait for images before persisting, or persist text-only first then update?
2. **Error recovery**: If generation fails mid-stream, what should the DA page show?
3. **Cache invalidation**: How long to keep generation state in KV?
