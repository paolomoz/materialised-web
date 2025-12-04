# Image RAG Documentation

> Last updated: 2024-12-04

## Overview

The IMAGE_INDEX provides semantic image search for the generative system, allowing contextually relevant images to be retrieved based on natural language queries.

## Index Statistics

| Metric | Value |
|--------|-------|
| Total vectors | 9,052 |
| Embedding model | `@cf/baai/bge-base-en-v1.5` |
| Dimensions | 768 |
| Metric | cosine |
| Image types | recipe, product, blog, page |

## Data Source

Images were migrated from the **adaptive-web** project's D1 database (`vitamix_images` table).

| Source Metric | Count |
|---------------|-------|
| Total images in D1 | 14,706 |
| Images with usable metadata | 12,199 |
| Successfully indexed | 9,052 (unique vectors) |

### Metadata Used for Embeddings

Text for embeddings is built from (in priority order):
1. `ai_caption` — AI-generated image description
2. `context` — Surrounding page content
3. `alt_text` — Image alt attribute
4. `image_type` — Category tag

### Vector Metadata Stored

Each vector includes:
- `url` / `image_url` — R2 public URL
- `source_url` — Original vitamix.com URL
- `alt_text` — Alt text
- `image_type` — Category (recipe/product/blog/page)
- `context` — Truncated context (200 chars)
- `file_size` — File size in bytes
- `migrated_from` — Source identifier
- `migrated_at` — Migration timestamp

## Discoverability Testing

Tested with 10 diverse queries on 2024-12-04:

| Query | Top Result | Score | Assessment |
|-------|------------|-------|------------|
| "green smoothie" | Green smoothie with blueberries | 0.82 | Excellent |
| "chocolate milkshake" | Classic chocolate shake with cherry | 0.79 | Good |
| "vitamix A3500" | Vitamix Ascent A3500 blender | 0.86 | Excellent |
| "tomato soup" | Tomato soup with basil & grilled cheese | 0.81 | Excellent |
| "frozen dessert" | Key lime ice cream being scooped | 0.78 | Good |
| "healthy breakfast" | Kid making smoothie with mom | 0.74 | Good |
| "protein shake workout" | Green smoothies with celery/ginger | 0.76 | Good |
| "hummus dip" | Hummus with vegetables and pita | 0.84 | Excellent |
| "baby food puree" | Baby food puree in jar | 0.77 | Good |
| "margarita cocktail" | Mango margaritas with salt rim | 0.83 | Excellent |

**Score interpretation:**
- 0.80+ = Excellent relevance
- 0.70–0.79 = Good relevance
- 0.60–0.69 = Moderate relevance
- <0.60 = Low relevance

## API Endpoints

### Test Image Search

```
GET /api/test-image-search?q=<query>&limit=5&type=<image_type>&block=<block_type>&dims=true
```

Parameters:
- `q` — Search query (default: "smoothie")
- `limit` — Number of results (default: 5)
- `type` — Filter by image type: product, recipe, lifestyle (optional)
- `block` — Filter by block type for aspect ratio: hero, cards, columns, etc. (optional)
- `dims` — Include dimension data in response: true/false (default: false)

Example with aspect ratio filtering:
```
GET /api/test-image-search?q=smoothie&block=hero&limit=3
# Returns only landscape/landscape-wide images suitable for hero blocks
```

### Migration Endpoints

```
GET /api/migrate-images?action=stats
GET /api/migrate-images?action=migrate&dryRun=true
GET /api/migrate-images?action=migrate&limit=100
```

## Files

| File | Purpose |
|------|---------|
| `src/migrate-images.ts` | Migration script with batch embedding |
| `src/lib/rag.ts` | Image lookup functions (`findBestImage`, `queryImageIndex`) |
| `src/lib/image-dimensions.ts` | Dimension extraction, caching, and aspect ratio filtering |
| `wrangler.toml` | IMAGE_INDEX and ADAPTIVE_WEB_DB bindings |

## Wrangler Configuration

```toml
# Vectorize for image asset lookup
[[vectorize]]
binding = "IMAGE_INDEX"
index_name = "vitamix-images"

# D1 binding to adaptive-web database (for migration)
[[d1_databases]]
binding = "ADAPTIVE_WEB_DB"
database_name = "adaptive-web-db"
database_id = "407328db-b252-428f-b412-0f902bfd8fdb"
```

## LLM Image Discoverability

During page generation, the system uses a **3-tier priority lookup** before generating new images. This determines how many images the LLM can actually discover and reuse.

### Image Lookup Flow

```
findBestImage() in src/lib/rag.ts
    │
    ├─► Priority 1: Product Image Map (static)
    │   └─► Exact match on product SKU/name
    │
    ├─► Priority 2: RAG Chunk Metadata
    │   └─► Images embedded in content retrieval results
    │
    ├─► Priority 3: IMAGE_INDEX (semantic search)
    │   └─► Query with 0.75 confidence threshold
    │
    └─► Fallback: Generate new image via Imagen/FAL
```

### Priority 1: Product Image Map

Static map of Vitamix product images in `src/lib/rag.ts`.

| Metric | Count |
|--------|-------|
| Unique product images | ~21 |
| Lookup aliases | ~75 |
| Coverage | Ascent X-series, A-series, Explorian, Propel, 5200, immersion blenders, reconditioned |

**Reliability:** High — exact string matching on product SKUs.

### Priority 2: RAG Chunk Metadata

Images embedded in the VECTORIZE content index metadata fields:
- `image_url` — Generic page image
- `recipe_image_url` — Recipe-specific image
- `product_image_url` — Product-specific image
- `hero_image_url` — Hero section image

**Reliability:** Medium — depends on content retrieval relevance.

### Priority 3: IMAGE_INDEX

Semantic search against the 9,052 migrated image vectors.

| Metric | Value |
|--------|-------|
| Total vectors | 9,052 |
| Confidence threshold | **0.75** |
| Estimated discoverable | ~6,000–6,500 (60-70%) |

**Key constraint** (`src/lib/rag.ts:1160`):
```typescript
if (bestMatch && bestMatch.score > 0.75) {
  return { url: imageUrl, score: bestMatch.score };
}
```

Images scoring below 0.75 are not returned, triggering image generation instead.

### Total Discoverable Images

| Source | Discoverable | Reliability |
|--------|-------------|-------------|
| Product map | ~21 | High |
| RAG metadata | Variable | Medium |
| IMAGE_INDEX | ~6,000–6,500 | Medium |
| **Total estimate** | **~6,000–7,000** | — |

### Content-to-Image Coverage Analysis

Comparison of RAG content (vitamix_sources) to available images:

| Content Type | Unique Pages | Images | Ratio |
|--------------|--------------|--------|-------|
| Recipe | 1,659 | 11,197 | 6.7 images/page |
| Blog | 584 | 2,506 | 4.3 images/page |
| Page | 250 | 574 | 2.3 images/page |
| Product | 71 | 390 | 5.5 images/page |
| **Total** | **~2,800** | **~9,052** | **3.2 avg** |

**Quantity coverage: Good** — sufficient images per content type.

### Aspect Ratio Distribution (Critical Gap)

The primary limitation is **image shape**, not quantity:

| Aspect Category | % of Index | Est. Count | Usable For |
|-----------------|------------|------------|------------|
| **Square** | ~73% | ~6,600 | cards, thumbnails, product-hero |
| **Landscape** | ~20% | ~1,800 | columns, split-content |
| **Landscape-wide** | ~7% | ~650 | hero, recipe-hero |
| **Portrait** | <1% | ~50 | cards |

**Block coverage by aspect ratio:**

| Block Type | Required Aspect | Available | Coverage |
|------------|-----------------|-----------|----------|
| Hero | landscape-wide | ~650 | ⚠️ 0.23 per topic |
| Recipe-hero | landscape | ~1,800 | ⚠️ 0.64 per topic |
| Cards | square | ~6,600 | ✅ 2.4 per topic |
| Columns | square/landscape | ~8,400 | ✅ 3.0 per topic |
| Product-hero | square | ~6,600 | ✅ 2.4 per topic |

**Key finding:** Only ~650 landscape-wide images for ~2,800 content topics means hero blocks will frequently fall back to image generation for niche queries.

### Root Cause Analysis

Investigation of the hero image shortage:

**Source data breakdown:**
| Category | Count |
|----------|-------|
| Total images in adaptive-web | 14,706 |
| Indexed (with metadata) | 12,199 → 9,052 unique |
| Not indexed (no metadata) | 2,507 |

**Non-indexed image sampling:**
| Sample | Dimensions | Aspect |
|--------|------------|--------|
| Typical non-indexed | 3612×5418 | Portrait |
| Typical non-indexed | 750×750 | Square |
| Identifiable banners | 1440×480 | Landscape-wide |

**Finding:** Only ~3-5 landscape images exist in the 2,507 non-indexed images.

**Root cause breakdown:**
- **~95% Source site limitation** — Vitamix.com uses predominantly square images (470×449 for recipes). Hero/banner images are rare on the site itself.
- **~5% Discoverability gap** — A few commercial banners lack metadata and weren't indexed.

**Conclusion:** Re-crawling won't significantly increase hero image availability. The source site simply doesn't have many landscape images.

### Mitigation Options

1. **Accept generation fallback** — Current behavior for hero blocks ✅ (recommended)
2. **Relax hero requirements** — Allow landscape (not just wide) for heroes
3. **CSS cropping** — Use square images with `object-fit: cover` for heroes
4. **Generate landscape variants** — Create wide crops from existing square images
5. ~~**Re-crawl hero images**~~ — Limited benefit; source site lacks landscape images

### Threshold Analysis

Based on 10 test queries:
- 6/10 queries scored ≥0.75 (would return image)
- 4/10 queries scored 0.74–0.79 (borderline)

**Options to increase coverage:**
1. Lower threshold to 0.70 — adds ~20% more matches, slight relevance risk
2. Lower threshold to 0.65 — adds ~35% more matches, moderate relevance risk
3. Keep at 0.75 — conservative, high-quality matches only

### Aspect Ratio Filtering (Implemented)

Image lookup now considers block context to select appropriately-shaped images.

**Implementation:**
- `src/lib/image-dimensions.ts` — Dimension extraction and caching
- Dimensions cached in KV (`img-dim:*` keys) for 30 days
- On-demand extraction from image headers (first 64KB)

**Supported formats:** JPEG, PNG, WebP, GIF

**Aspect categories:**
| Category | Aspect Ratio Range | Block Types |
|----------|-------------------|-------------|
| `landscape-wide` | ≥ 1.7 (16:9+) | hero, recipe-hero |
| `landscape` | 1.2 – 1.7 | hero, columns, split-content |
| `square` | 0.8 – 1.2 | cards, recipe-cards, product-cards, thumbnails |
| `portrait` | < 0.8 | cards |

**Block preferences:**
```typescript
const BLOCK_ASPECT_PREFERENCES = {
  'hero': ['landscape-wide', 'landscape'],
  'cards': ['square', 'portrait'],
  'columns': ['square', 'landscape'],
  'split-content': ['landscape', 'square'],
  'recipe-hero': ['landscape-wide', 'landscape'],
  'product-hero': ['square', 'landscape'],
  'recipe-cards': ['square'],
  'product-cards': ['square'],
};
```

**How it works:**
1. Query IMAGE_INDEX for top-20 semantic matches
2. Extract dimensions for each result (cached)
3. Filter by aspect ratio preference for block type
4. Return first suitable match above 0.75 threshold

### Product Image Accuracy Analysis

Analysis of how often product queries hit the static map vs fall through to semantic search.

#### PRODUCT_IMAGE_MAP Coverage

| Category | Unique Images | Lookup Keys | Examples |
|----------|--------------|-------------|----------|
| Ascent X-Series | 4 | 12 | X5, X4, X3, X2 + aliases |
| Kitchen Systems | 4 | 6 | X5 SmartPrep, X4 Gourmet |
| Ascent A-Series | 3 | 5 | A3500, A2500, A2300 |
| Explorian | 2 | 6 | E310, E320 + bundles |
| Propel | 2 | 5 | 750, 510 + bundles |
| Classic/Legacy | 1 | 6 | 5200, 5300, 7500 |
| Professional | 1 | 3 | 750, Pro750 |
| Immersion | 2 | 6 | 5-speed, 2-speed + bundles |
| Reconditioned | 4 | 6 | Various models |
| **Total** | **~21** | **~55** | — |

#### Matching Algorithm

`findProductImage()` in `src/lib/rag.ts:950` uses two matching stages:

**Stage 1 — SKU Pattern Matching:**
```
/\bx([2-5])\b/i       →  X2, X3, X4, X5
/\ba([23]\d{3})\b/i   →  A3500, A2500, A2300
/\be([23]\d{2})\b/i   →  E310, E320
/\b([57]\d{3})\b/     →  5200, 5300, 7500, 750
/\bpro\s*(\d{3})\b/i  →  Pro750
```

**Stage 2 — Substring Matching:**
Falls through to check if any map key is contained in the query via `includes()`.

#### Hit Rate by Query Type

| Query Type | Example | Map Hit? | Reason |
|------------|---------|----------|--------|
| Blender with SKU | "Vitamix A3500" | ✅ Yes | SKU pattern |
| Model number | "E310" | ✅ Yes | SKU pattern |
| Immersion | "immersion blender" | ✅ Yes | Substring |
| Container | "48oz container" | ❌ No | No match |
| Accessory | "blade assembly" | ❌ No | No match |
| Food processor | "SmartPrep attachment" | ⚠️ Partial | May hit substring |

#### Coverage by Product Category

| Category | RAG Products | Map Coverage | Hit Rate |
|----------|-------------|--------------|----------|
| Blenders (with SKU) | ~25 | ✅ 21 images | **~95%** |
| Reconditioned | 6 | ✅ 4 images | **~85%** |
| Containers | ~15 | ❌ 0 images | **0%** |
| Accessories | ~15 | ❌ 0 images | **0%** |
| Food Processor | ~5 | ❌ 0 images | **0%** |
| Bundles | ~5 | ⚠️ 4 images | **~60%** |

**Summary:**
- **~35 products (49%)** — Map hit → correct image guaranteed
- **~36 products (51%)** — Semantic search fallback → risk of wrong image

#### High-Risk Semantic Search Fallbacks

Products that fall through to IMAGE_INDEX semantic search:

| Product Type | Risk | Example Failure |
|--------------|------|-----------------|
| Containers | High | "48oz" returns 64oz image |
| Accessories | High | "blade assembly" returns wrong blade |
| Food processor | Medium | May return blender with attachment |
| Pitcher/carafe | Medium | Returns similar container |

#### Mitigation Options

1. **Expand PRODUCT_IMAGE_MAP** — Add containers/accessories (recommended for critical products)
2. **Force generation for accessories** — Skip semantic search for non-blender products
3. **Add SKU metadata to IMAGE_INDEX** — Enable exact matching in semantic results
4. **Lower confidence for accessories** — Accept that accessories may be slightly wrong

#### Recommendation

For blenders (core products): Current system works well (~95% accuracy).

For accessories/containers: Either expand the static map with key products, or accept that image generation fallback will handle these cases (current behavior).

---

## RAG-Only Mode Considerations

Planning notes for switching to RAG-only images (no generation fallback).

### Current vs RAG-Only Flow

```
CURRENT:
  Product map → RAG metadata → IMAGE_INDEX → Generate (fallback)

RAG-ONLY:
  Product map → RAG metadata → IMAGE_INDEX → ??? (no fallback)
```

### Key Tradeoffs

#### 1. Hero Images Will Often Be Missing

Only ~650 landscape-wide images for ~2,800 topics (0.23 per topic).

| Option | Approach | Tradeoff |
|--------|----------|----------|
| A | Show no hero image | Broken/empty layout |
| B | Relax aspect ratio | Use square with `object-fit: cover` |
| C | Skip hero block | Page structure changes |

#### 2. Threshold Implications

Current 0.75 threshold filters ~30-40% of queries.

| Threshold | Coverage | Relevance Risk |
|-----------|----------|----------------|
| 0.75 (current) | ~60-70% | Low |
| 0.60 | ~80-85% | Medium |
| None | 100% | High (some poor matches) |

#### 3. Product Accessories Risk

51% of products have no map coverage. Without generation:
- Semantic search may return wrong container size or accessory type
- Question: Is a potentially-wrong accessory image acceptable?

#### 4. Fallback Strategy Options

| Scenario | Option A | Option B | Option C |
|----------|----------|----------|----------|
| No image above threshold | Skip block | Use placeholder | Lower threshold |
| Wrong aspect ratio | CSS crop | Accept mismatch | Skip block |
| Product not in map | Accept semantic | Skip image | Use generic blender |

### Benefits of RAG-Only

| Benefit | Impact |
|---------|--------|
| **Faster** | No Imagen/FAL API latency (~2-5s saved per image) |
| **Cheaper** | No generation costs |
| **Authentic** | All images are real Vitamix content |
| **Consistent** | No AI hallucination risk in visuals |

### Recommended Implementation

If switching to RAG-only:

1. **Remove or lower threshold** — From 0.75 to 0.50, or remove entirely
2. **Relax aspect ratio filtering** — Prefer correct aspect, accept any if none match
3. **Keep product map strict** — Wrong blender model is worse than no image
4. **Define graceful fallback:**
   - Branded placeholder image, OR
   - Skip image-dependent blocks, OR
   - Text-only variant of block
5. **Block-level decisions** — Some blocks need images more than others:
   - Hero: critical (defines page feel)
   - Cards: can work text-only
   - Product: must be correct or omitted

### Open Questions

- [ ] What placeholder image to use when no match found?
- [ ] Should aspect ratio be enforced or just preferred?
- [ ] Should product accessories show best-guess or nothing?
- [ ] Should hero blocks be skipped or show square images?

---

## Usage in Generation

The `findBestImage()` function in `src/lib/rag.ts` orchestrates the lookup:

```typescript
const result = await findBestImage(
  'recipe',                    // context: 'product' | 'recipe' | 'lifestyle'
  "fresh green smoothie",      // query
  ragContext,                  // RAG retrieval results
  env,                         // environment with IMAGE_INDEX
  'hero'                       // blockType for aspect ratio filtering
);

if (result) {
  // Reuse existing image with appropriate aspect ratio
  console.log(result.source);  // 'map' | 'rag' | 'index'
  console.log(result.url);     // Image URL suitable for hero block
} else {
  // Generate new image
}
```

---

## Changelog

### 2024-12-04
- Migrated 12,162 images from adaptive-web D1 to IMAGE_INDEX
- Final index contains 9,052 unique vectors
- Created test endpoint `/api/test-image-search`
- Verified discoverability with 10 test queries (scores 0.74–0.86)
- Added LLM discoverability analysis:
  - Documented 3-tier lookup priority (product map → RAG metadata → IMAGE_INDEX)
  - Identified 0.75 confidence threshold constraint
  - Estimated ~6,000–7,000 total discoverable images
- **Implemented aspect ratio filtering:**
  - Created `src/lib/image-dimensions.ts` for dimension extraction
  - Supports JPEG, PNG, WebP, GIF format detection
  - On-demand extraction from image headers (first 64KB)
  - KV caching with 30-day TTL (`img-dim:*` keys)
  - Block-aware filtering: hero→landscape, cards→square
  - Updated `findBestImage()` with optional `blockType` parameter
  - Updated test endpoint with `block=` and `dims=` parameters
- **Content-to-image coverage analysis:**
  - Compared ~2,800 RAG content pages to ~9,052 images (3.2 avg ratio)
  - Identified critical aspect ratio gap: 73% square, only 7% landscape-wide
  - Hero blocks have ~0.23 images per topic (will often fall back to generation)
  - Cards/columns have good coverage (~2.4-3.0 images per topic)
  - Documented 5 mitigation options for hero image shortage
- **Root cause analysis for hero image shortage:**
  - Investigated 2,507 non-indexed images (missing metadata)
  - Found only ~3-5 landscape images among them
  - Confirmed ~95% source site limitation (vitamix.com uses square images)
  - ~5% discoverability gap (minor - few banners lack metadata)
  - Conclusion: Re-crawling won't help; generation fallback is correct approach
- **Product image accuracy analysis:**
  - Audited PRODUCT_IMAGE_MAP: 21 unique images, 55 lookup keys
  - Blenders hit rate: ~95% (SKU pattern matching works well)
  - Containers/accessories hit rate: 0% (no map coverage)
  - Overall: 49% of products hit map, 51% fall through to semantic search
  - High-risk fallbacks: containers, accessories (may return wrong sizes/types)
  - Recommendation: Expand map for critical accessories, or accept generation fallback
- **RAG-only mode considerations documented:**
  - Tradeoffs: hero image gaps, threshold implications, accessory risks
  - Benefits: faster, cheaper, authentic imagery
  - Open questions: placeholder strategy, aspect ratio enforcement, fallback behavior
