# Plan: Simplify Image URL Management

## Current Problem

Images are inconsistent between:
1. **Live generated page** (browser during generation)
2. **Materialised page** (published EDS page at `/discover/{slug}`)
3. **DA page** (Document Authoring backend source)

The current implementation has multiple places doing regex replacements on HTML strings, which is error-prone and hard to debug.

## Current Flow Analysis

### 1. Backend Flow (orchestrator.ts)
```
generateContent()
  → buildBlockHTML() generates HTML with SVG placeholders + data-gen-image="hero|card-0|col-0"
  → streamBlockContent() sends block-content events (HTML with placeholders)
  → generateImages() creates images, stores in R2
  → sends image-ready events with {imageId, url: "/images/{slug}/{id}.png"}
```

### 2. Frontend Flow (scripts.js)
```
block-content event → push data.html to generatedHtml[] (has placeholders)
image-ready event →
  1. Update DOM img.src directly
  2. Try to update generatedHtml[] with regex replacement (BUGGY)
generation-complete → show "Save" button
Save click → POST generatedHtml[] to /api/persist
```

### 3. Persist Flow (index.ts)
```
/api/persist receives html[]
  → buildDAPageHtml(query, html) wraps in HTML document
  → persistAndPublish() sends to DA
```

## Problems Identified

1. **Frontend regex may not match** - The pattern assumes specific attribute order
2. **`generatedHtml` is an array** - When replacing, we map over ALL blocks but each image ID only exists in ONE block
3. **No validation** - We don't know if replacement worked
4. **Multiple sources of truth** - DOM has one set of images, generatedHtml may have different ones
5. **Timing issues** - If user clicks "Save" before all image-ready events arrive, they get placeholders

## Proposed Solution: Use a Map for Image URLs

Instead of trying to update HTML strings with regex, track image URLs in a simple Map and build final HTML at save time.

### New Approach

1. **Track images in a Map** (frontend):
```javascript
const imageMap = new Map(); // imageId -> fullUrl
```

2. **On block-content**: Store raw HTML with placeholders
```javascript
generatedHtml.push(data.html);
```

3. **On image-ready**: Just update the Map (and DOM)
```javascript
imageMap.set(imageId, fullUrl);
// Update DOM as before
```

4. **On Save**: Build final HTML by replacing all placeholders using the Map
```javascript
const finalHtml = generatedHtml.map(html => {
  let result = html;
  for (const [imageId, url] of imageMap) {
    result = result.replace(
      new RegExp(`src="[^"]*"([^>]*data-gen-image="${imageId}")`, 'g'),
      `src="${url}"$1`
    );
  }
  return result;
});
```

This is simpler because:
- The Map is the single source of truth for image URLs
- We only do regex replacement once, at save time
- Easy to debug: just log the Map contents before save

### Even Simpler: Don't use data-gen-image at all

Alternative approach - use deterministic image URLs from the start:

1. **Backend generates predictable URLs**:
```typescript
const imageUrl = `/images/${slug}/${imageId}.png`;
// HTML: <img src="/images/my-page-xyz/hero.png" ...>
```

2. **Images are uploaded to R2 at those exact paths**

3. **Frontend doesn't need to track anything** - URLs are already correct in the HTML

4. **Persist just sends the HTML as-is**

This is even simpler but requires:
- Backend to know the slug upfront (it does)
- Image generation to upload to predictable paths (it does)
- URLs to work even if images aren't ready yet (they would 404 temporarily)

## Recommended Implementation

**Option A: Map-based tracking (safer)**

Changes needed:
1. `scripts.js`:
   - Add `imageMap` variable
   - Update `image-ready` handler to set Map entry
   - Update save handler to build final HTML from Map
   - Remove regex replacement from image-ready handler

2. No backend changes needed

**Option B: Deterministic URLs (simpler)**

Changes needed:
1. `orchestrator.ts`:
   - Change `buildHeroHTML`, `buildCardsHTML`, `buildColumnsHTML` to use predictable URLs instead of SVG placeholders
   - Format: `https://vitamix-generative.paolo-moz.workers.dev/images/${slug}/${imageId}.png`

2. `scripts.js`:
   - Remove all image URL tracking
   - Remove `image-ready` handler (or just use it to trigger CSS animation)
   - `generatedHtml` already has correct URLs

3. Image generation:
   - Already uploads to `/images/${slug}/${imageId}.png` paths

## Decision

I recommend **Option B** because:
- No regex at all
- No tracking state
- HTML is correct from the start
- Less code, fewer bugs
- Images will eventually load (after generation completes)

The only downside is images show as broken briefly before generation completes, but we can show a placeholder using CSS:

```css
img[src*="/images/"] {
  background: linear-gradient(...); /* shimmer animation */
}
img[src*="/images/"].loaded {
  background: none;
}
```

## Implementation Steps for Option B

1. **Update `buildHeroHTML`**: Use actual URL instead of SVG
2. **Update `buildCardsHTML`**: Use actual URL instead of SVG
3. **Update `buildColumnsHTML`**: Use actual URL instead of SVG
4. **Add slug parameter** to these functions
5. **Update `scripts.js`**:
   - Simplify image-ready handler (just add .loaded class)
   - Remove generatedHtml manipulation on image-ready
6. **Test the full flow**
