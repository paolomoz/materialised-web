# Product Hero Images from RAG

## Overview

The product-hero block should display product images sourced from the RAG (Vectorize) when available, falling back to AI-generated images only when no suitable image exists.

## Requirements

1. **Product-hero blocks MUST use RAG images when available**
   - When a user queries "tell me about the A3500", the product-hero should show the official A3500 product image from vitamix.com
   - The og:image metadata from product pages is crawled and stored in Vectorize

2. **Matching should work by product name**
   - The LLM generates `productName` (e.g., "Vitamix A3500")
   - RAG chunks have `page_title` and sometimes `product_sku`
   - Match by checking if product name appears in chunk metadata

3. **Fallback to generated images**
   - Only generate images when no suitable RAG image is found
   - Use the imagePrompt from content generation for AI image generation

## Current Issues (Before Fix)

### Issue #1: HTML builder ignores RAG images
**Location:** `orchestrator.ts:buildProductHeroHTML()`

```typescript
// BEFORE: Always uses generated image URL
const imageUrl = buildImageUrl(slug, imageId);
```

The HTML builder always renders a generated image URL, even when `decideImageStrategy()` determined an existing RAG image should be used.

### Issue #2: Relevance check doesn't work for product-hero
**Location:** `imagen.ts:isRelevantImage()`

```typescript
// BEFORE: Checks for blockContent.type which doesn't exist
if (chunk.metadata?.content_type === 'product' && blockContent.type === 'product') {
  return true;
}
```

Product-hero content has `productName`, not `type`, so this check always returns false.

### Issue #3: SKU lookup uses wrong field
**Location:** `imagen.ts:findExistingImage()`

```typescript
// BEFORE: Looks for productSku but content has productName
if (blockContent.productSku) {
  const existingImage = findExistingImage(blockContent.productSku, ragContext);
}
```

### Issue #4: No explicit product-hero image handling
The `buildImageRequests()` function treats product-hero like any other block, without special handling for product images from RAG.

## Solution Design

### Approach: Pass RAG context to HTML builders

Instead of making global changes to the image decision system, we'll:

1. **Add a dedicated function to find product images from RAG**
   - Match by product name against `page_title`
   - Filter for product content type
   - Return the og:image URL

2. **Modify HTML builder to accept existing image URL**
   - `buildProductHeroHTML()` takes optional `existingImageUrl` parameter
   - Uses RAG image when provided, generated URL otherwise

3. **Pass RAG context through the rendering pipeline**
   - `buildBlockHTML()` receives image decisions map
   - For product-hero, looks up RAG image and passes to HTML builder

## Implementation

### File Changes

1. **`src/lib/rag.ts`** - Add `findProductImage()` function
2. **`src/lib/orchestrator.ts`** - Pass RAG images to HTML builders
3. **`src/ai-clients/imagen.ts`** - Improve `isRelevantImage()` for product blocks

### New Function: findProductImage()

```typescript
/**
 * Find a product image from RAG context by matching product name
 */
export function findProductImage(
  productName: string,
  context: RAGContext
): string | undefined {
  const normalizedName = productName.toLowerCase();

  for (const chunk of context.chunks) {
    // Must be product content type
    if (chunk.metadata.content_type !== 'product') continue;

    // Must have an image URL
    if (!chunk.metadata.image_url) continue;

    // Match by page title containing product name
    const pageTitle = (chunk.metadata.page_title || '').toLowerCase();
    if (pageTitle.includes(normalizedName) || normalizedName.includes(pageTitle)) {
      return chunk.metadata.image_url;
    }

    // Also try matching product SKU patterns (A3500, E310, etc.)
    const skuMatch = normalizedName.match(/[ae]\d{3,4}/i);
    if (skuMatch && pageTitle.includes(skuMatch[0].toLowerCase())) {
      return chunk.metadata.image_url;
    }
  }

  return undefined;
}
```

### Modified: buildProductHeroHTML()

```typescript
function buildProductHeroHTML(
  content: any,
  variant: string,
  slug: string,
  blockId: string,
  ragImageUrl?: string  // NEW: optional RAG image
): string {
  // Use RAG image if provided, otherwise generated URL
  const imageId = `product-hero-${blockId}`;
  const imageUrl = ragImageUrl || buildImageUrl(slug, imageId);
  // ... rest of function
}
```

### Modified: buildBlockHTML()

```typescript
case 'product-hero':
  // Try to find RAG image for this product
  const productContent = content as any;
  const ragImageUrl = productContent.productName
    ? findProductImage(productContent.productName, ragContext)
    : undefined;
  return buildProductHeroHTML(content as any, variant, slug, block.id, ragImageUrl);
```

## Testing

1. Query: "tell me about the A3500"
   - Expected: Product-hero shows official A3500 og:image from vitamix.com

2. Query: "Vitamix E310 features"
   - Expected: Product-hero shows E310 product image from RAG

3. Query: "best blender for smoothies" (no specific product)
   - Expected: Falls back to AI-generated image

## Image URL Sources

| Priority | Source | When Used |
|----------|--------|-----------|
| 1 | RAG og:image | Product name matches page_title in RAG chunk |
| 2 | Generated | No matching RAG image found |

## Notes

- The crawler extracts og:image from product pages and stores in `image_url` metadata
- Some stale vectors may still have tracking pixel URLs from before the crawler fix
- Product images are typically high-quality 2500x2500 PNG files from vitamix.com
