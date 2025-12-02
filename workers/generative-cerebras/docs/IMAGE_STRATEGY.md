# Image Strategy: Leveraging Existing Vitamix Images

This document outlines the current state of image handling in the generative system and strategies for better leveraging existing Vitamix images instead of generating new ones.

## Problem Statement

1. **Product images must be accurate** - AI-generated product images could be inaccurate/off-brand
2. **Vitamix has thousands of excellent images** - Recipe photos, lifestyle images, product shots
3. **Currently generating most images** - Missing opportunity to use existing high-quality assets

---

## Current State (Dec 2024)

### What's Working

| Feature | Location | Description |
|---------|----------|-------------|
| Product image map | `rag.ts:869-889` | Static map of ~12 SKUs to official product image URLs |
| RAG image extraction | `rag.ts:844-862` | `findExistingImages()` pulls `image_url` from chunk metadata |
| Product-hero skip | `orchestrator.ts:427-433` | Skips generation if `findProductImage()` finds a match |

### What's Limited

1. **Product map is static** - Only covers ~12 products (X5, X4, X3, X2, A3500, A2500, A2300, E310, E320, 5200, 5300, 7500, 750)
2. **RAG images are generic** - All chunks return same fallback: `Ascent_X5_Nav_Image.png`
3. **No recipe image matching** - Can't find "green smoothie image" from existing content
4. **No semantic image search** - Can't query "images of Vitamix making soup"

### Current Image Decision Flow

```
Request for image
       ↓
Is it a product? → Yes → Check PRODUCT_IMAGE_MAP
       ↓                         ↓
       No                   Found? → Use it
       ↓                         ↓
Check RAG chunks              No → Generate
for image_url
       ↓
Found (non-generic)? → Use it
       ↓
       No → Generate AI image
```

---

## Proposed Improvements

### Priority 1: Expand Product Image Map (Low Effort, Medium Impact)

**Goal:** Cover all Vitamix products, not just 12

**Implementation:**
```typescript
// Scrape all product pages and build comprehensive map
const PRODUCT_IMAGE_MAP: Record<string, string> = {
  // Ascent Series
  'x5': 'https://...',
  'x4': 'https://...',
  // ... all products

  // Accessories
  'dry-grains-container': 'https://...',
  'food-processor-attachment': 'https://...',

  // Bundles
  'a3500-bundle': 'https://...',
};
```

**To scrape:**
1. Visit https://www.vitamix.com/us/en_us/shop/blenders
2. Extract all product SKUs and hero image URLs
3. Include accessories and bundles

---

### Priority 2: Improve Crawler Image Extraction (Medium Effort, High Impact)

**Goal:** Extract real per-page images during indexing

**Current problem:** Crawler stores a generic fallback image for all chunks

**Solution:** Update crawler to extract:
- Recipe hero images from recipe pages
- Product hero images from product pages
- Lifestyle images from editorial content

**Metadata to add:**
```typescript
interface EnhancedChunkMetadata {
  // Existing
  image_url?: string;

  // New fields
  hero_image_url?: string;        // Main image for the page
  recipe_image_url?: string;      // Specific recipe image
  product_image_url?: string;     // Product shot
  thumbnail_url?: string;         // Smaller version
  image_alt_text?: string;        // Alt text for matching
  image_type?: 'product' | 'recipe' | 'lifestyle' | 'diagram';
}
```

**Files to modify:**
- `../crawler/src/extractor.ts` - Extract images from HTML
- `../crawler/src/chunker.ts` - Add to chunk metadata

---

### Priority 3: Build Image Asset Index (Medium Effort, High Impact)

**Goal:** Searchable index of all Vitamix images for semantic matching

**Architecture:**
```
Image Asset Index (Vectorize)
├── URL
├── Alt text / description (embedded)
├── Source page URL
├── Image type (product, recipe, lifestyle)
├── Associated entities (product SKU, recipe name)
└── Dimensions / aspect ratio
```

**Query flow:**
```typescript
async function findMatchingImage(
  description: string,  // e.g., "green smoothie with spinach"
  type?: 'product' | 'recipe' | 'lifestyle',
  env: Env
): Promise<string | null> {
  // 1. Embed the description
  const embedding = await generateQueryEmbedding(description, env);

  // 2. Query image index
  const results = await env.IMAGE_INDEX.query(embedding, {
    topK: 5,
    filter: type ? { image_type: { $eq: type } } : undefined,
  });

  // 3. Return best match if above threshold
  if (results.matches[0]?.score > 0.75) {
    return results.matches[0].metadata.url;
  }

  return null;
}
```

---

### Priority 4: Image-Specific Vectorize Index (High Effort, Very High Impact)

**Goal:** Full semantic image search with multi-modal embeddings

**Options:**
1. **CLIP embeddings** - Embed actual image pixels
2. **Caption-based** - Generate captions, embed those
3. **Hybrid** - Both visual and text embeddings

**Benefits:**
- "Find images similar to this green smoothie"
- "Find product shots on white background"
- Visual similarity matching

**Requirements:**
- Separate Vectorize index for images
- Image processing pipeline during indexing
- Multi-modal embedding model (CLIP or similar)

---

## Implementation Plan

### Phase 1: Quick Wins (1-2 days)

- [ ] Scrape all product pages for image URLs
- [ ] Expand `PRODUCT_IMAGE_MAP` to cover all products
- [ ] Add logging to track generate vs. reuse decisions

### Phase 2: Crawler Enhancement (3-5 days)

- [ ] Update extractor to find hero images per page
- [ ] Add recipe-specific image extraction
- [ ] Add product-specific image extraction
- [ ] Re-index with new metadata

### Phase 3: Image Index (5-7 days)

- [ ] Design image metadata schema
- [ ] Create new Vectorize index for images
- [ ] Build image indexing pipeline
- [ ] Implement `findMatchingImage()` function
- [ ] Integrate into orchestrator

### Phase 4: Advanced (Future)

- [ ] Multi-modal embeddings
- [ ] Image similarity search
- [ ] Automatic image quality scoring

---

## Enhanced Image Lookup (Proposed Implementation)

```typescript
/**
 * Find best existing image before deciding to generate
 * Priority: 1) Product map, 2) RAG chunks, 3) Image index, 4) Generate
 */
async function findBestImage(
  context: 'product' | 'recipe' | 'lifestyle',
  query: string,
  ragContext: RAGContext,
  env: Env
): Promise<{ url: string; source: 'map' | 'rag' | 'index' } | null> {

  // 1. For products, check static map first (most reliable)
  if (context === 'product') {
    const mapped = findProductImage(query, ragContext);
    if (mapped) {
      console.log(`[Image] Using product map for "${query}"`);
      return { url: mapped, source: 'map' };
    }
  }

  // 2. Check RAG chunks for matching images
  const GENERIC_FALLBACK = 'Ascent_X5_Nav_Image.png';
  const ragImages = ragContext.chunks
    .filter(c =>
      c.metadata.image_url &&
      !c.metadata.image_url.includes(GENERIC_FALLBACK)
    )
    .sort((a, b) => b.score - a.score);

  if (ragImages.length > 0) {
    console.log(`[Image] Using RAG image for "${query}"`);
    return { url: ragImages[0].metadata.image_url!, source: 'rag' };
  }

  // 3. Query dedicated image index (if available)
  // const imageMatch = await queryImageIndex(query, context, env);
  // if (imageMatch) {
  //   console.log(`[Image] Using index image for "${query}"`);
  //   return { url: imageMatch, source: 'index' };
  // }

  // 4. No existing image found - will need to generate
  console.log(`[Image] No existing image for "${query}" - will generate`);
  return null;
}
```

---

## Image Decision Logging

Add to orchestrator for visibility:

```typescript
// In buildImageRequests or decideImagesForContent
console.log('[Image Decision]', {
  blockType: block.type,
  context: block.type.includes('product') ? 'product' : 'recipe',
  query: imagePrompt,
  decision: existingImage ? 'reuse' : 'generate',
  source: existingImage?.source,
  url: existingImage?.url,
});
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/rag.ts` | Expand `PRODUCT_IMAGE_MAP`, add `findBestImage()` |
| `src/lib/orchestrator.ts` | Use `findBestImage()` before generating |
| `../crawler/src/extractor.ts` | Extract per-page images |
| `../crawler/src/chunker.ts` | Add image metadata to chunks |
| `wrangler.toml` | Add IMAGE_INDEX binding (Phase 3) |

---

## Success Metrics

1. **Generation reduction** - % of images reused vs. generated
2. **Product accuracy** - 100% of product images from official sources
3. **Recipe coverage** - % of recipe pages with real images indexed
4. **Latency improvement** - Faster page generation when reusing images

---

## Related Documents

- [RAG_IMPROVEMENTS.md](./RAG_IMPROVEMENTS.md) - RAG system enhancements
- [RAG_QUALITY_TESTING.md](./RAG_QUALITY_TESTING.md) - Testing infrastructure
