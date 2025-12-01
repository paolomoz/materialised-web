# DA-First Flow Architecture

> **Status**: Implemented but reverted. Saved for future reference.

## Overview

This flow creates a DA (Document Authoring) page first, then streams content into it on first render.

## User Journey

1. User on homepage enters query, clicks "Explore"
2. Frontend calls `POST /api/create-page` with `{ query, images }`
3. Worker:
   - Classifies intent using Cerebras (~200ms)
   - Determines category (`smoothies`, `recipes`, `compare`, etc.)
   - Generates semantic slug
   - Creates placeholder DA page with `cerebras-generated` block
   - Returns `{ path }` to frontend
4. Frontend redirects to DA page (e.g., `/smoothies/green-smoothie-abc123`)
5. DA page loads, `cerebras-generated` block:
   - Reads query/slug from page metadata
   - Connects to worker SSE stream
   - Renders blocks progressively as they arrive
   - Shows shimmer placeholders for images
6. Images load asynchronously via `image-ready` events
7. Content persists to DA after generation completes

## Key Components

### Worker Endpoint: `/api/create-page`

```typescript
// POST /api/create-page
// Body: { query: string, images: 'fal' | 'imagen' }
// Returns: { path: string, slug: string }

async function handleCreatePage(request: Request, env: Env): Promise<Response> {
  const { query, images } = await request.json();

  // 1. Classify intent
  const intent = await classifyIntent(query, env);

  // 2. Determine category and path
  const category = classifyCategory(intent, query);
  const slug = generateSemanticSlug(query, intent);
  const path = buildCategorizedPath(category, slug);

  // 3. Create placeholder DA page
  await createPlaceholderPage(path, query, slug, env, sourceOrigin, imageProvider);

  // 4. Return path for redirect
  return Response.json({ path, slug });
}
```

### Placeholder Page HTML

```html
<!DOCTYPE html>
<html>
<head>
  <title>Creating Your Page | Vitamix</title>
  <meta name="cerebras-query" content="green smoothie recipes">
  <meta name="cerebras-slug" content="green-smoothie-abc123">
  <meta name="cerebras-source" content="https://main--site--org.aem.page">
  <meta name="cerebras-images" content="fal">
</head>
<body>
  <header></header>
  <main>
    <div>
      <div class="cerebras-generated">
        <div><div>green smoothie recipes</div></div>
        <div><div>green-smoothie-abc123</div></div>
      </div>
    </div>
  </main>
  <footer></footer>
</body>
</html>
```

### cerebras-generated Block

Located at `blocks/cerebras-generated/`

```javascript
export default async function decorate(block) {
  // Read from block content or metadata
  const query = /* from block or meta */;
  const slug = /* from block or meta */;
  const imageProvider = document.querySelector('meta[name="cerebras-images"]')?.content || 'fal';

  // Show loading state
  block.innerHTML = `<div class="cerebras-loading">...</div>`;

  // Connect to SSE stream
  const streamUrl = `${WORKER_URL}/api/stream?slug=${slug}&query=${query}&images=${imageProvider}`;
  const eventSource = new EventSource(streamUrl);

  eventSource.addEventListener('block-content', (e) => {
    // Render block progressively
  });

  eventSource.addEventListener('image-ready', (e) => {
    // Replace placeholder with real image
  });
}
```

### Category Classifier

Maps intents to URL categories:

| Intent | Category |
|--------|----------|
| smoothie_recipes | /smoothies/ |
| food_recipes | /recipes/ |
| product_comparison | /compare/ |
| product_info | /products/ |
| tips_techniques | /tips/ |
| * (default) | /discover/ |

### Frontend Changes

```javascript
async function startGeneration(query) {
  // Call API to create DA page
  const response = await fetch(`${WORKER_URL}/api/create-page`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, images: imageProvider }),
  });

  const { path } = await response.json();

  // Redirect to DA page
  window.location.href = path;
}
```

## Benefits

1. **Clean URLs**: `/smoothies/green-smoothie-abc123` instead of `/?cerebras=...`
2. **SEO-friendly**: Content at permanent, categorized paths
3. **Shareable**: Users can share the DA page URL
4. **Persistent**: Content saved to DA system

## Drawbacks

1. **Slower initial response**: Need to create DA page before redirect (~2s)
2. **More complex**: Multiple systems involved (DA API, AEM Admin)
3. **Requires DA credentials**: Worker needs DA_TOKEN, DA_ORG, DA_REPO

## Future Optimization

Could use `waitUntil()` to start generation in background while creating DA page, then buffer blocks in KV for the stream to replay. Would save ~2 seconds.

## Files Changed

- `workers/generative-cerebras/src/index.ts` - `/api/create-page` endpoint
- `workers/generative-cerebras/src/lib/da-client.ts` - `createPlaceholderPage()`
- `workers/generative-cerebras/src/lib/category-classifier.ts` - Intent mapping
- `blocks/cerebras-generated/` - First-render streaming block
- `blocks/query-form-cerebras/` - Updated to use API
- `scripts/cerebras-scripts.js` - Updated to use API
