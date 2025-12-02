# Image Generation Bypass

## Current State (2025-12-02)

A temporary bypass is enabled that forces all images to use AI generation instead of looking up existing images from the index.

## Why?

The IMAGE_INDEX (Vectorize index `vitamix-images`) is being rebuilt. During this time, the index only contains ~5 images, so most lookups would fail and fall back to AI generation anyway. The bypass skips the lookup overhead.

## What's Bypassed

The normal image lookup flow is:
1. **Product image map** - Static map of 60+ product images
2. **RAG metadata** - Images from crawled recipe/product pages
3. **IMAGE_INDEX** - Semantic search for matching images
4. **Fallback** - AI generation (Imagen or Fal)

With the bypass enabled, steps 1-3 are skipped entirely.

## How to Re-enable Image Lookup

Once reindexing is complete, edit `src/lib/orchestrator.ts`:

```typescript
// Line ~289
const FORCE_AI_GENERATION = true;  // Change to false
```

Then redeploy:
```bash
cd workers/generative-cerebras
npx wrangler deploy
```

## Verifying IMAGE_INDEX is Ready

Check the index stats:
```bash
npx wrangler vectorize info vitamix-images
```

You should see a significant `vectorCount` (hundreds or thousands) before re-enabling the lookup.

## Image Generation APIs

Both APIs are confirmed working (tested 2025-12-02):

| Provider | Speed | Quality | Config |
|----------|-------|---------|--------|
| Imagen (Vertex AI) | ~13s | High | Default (`IMAGE_PROVIDER=imagen`) |
| Fal (FLUX Schnell) | ~2.5s | Good | Fast mode or `images=fal` query param |

## Test Endpoints

To verify APIs are working:
```bash
# Test Imagen
curl https://vitamix-generative-cerebras.paolo-moz.workers.dev/api/test-imagen

# Test Fal
curl https://vitamix-generative-cerebras.paolo-moz.workers.dev/api/test-fal
```

## Fallback Images

If AI generation fails, diverse Unsplash fallback images are used (6 hero variants, 4 card variants) based on a hash of the image ID to ensure variety across pages.
