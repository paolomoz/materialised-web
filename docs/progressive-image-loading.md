# Progressive Image Loading for Generative Pages

## Overview

When generating pages via Cerebras, images are resolved asynchronously after content is streamed. This document describes the progressive image loading mechanism and how to ensure new blocks support it correctly.

## Architecture

```
Query → Content Generation → Stream Blocks (with placeholders) → Resolve Images (parallel) → SSE image-ready events
```

1. **Content streams immediately** with placeholder images
2. **Images resolve in background** in parallel
3. **`image-ready` SSE events** notify frontend when each image is ready
4. **Frontend updates** the `src` attribute on matching `<img>` elements

## The Problem: Block Decoration Race Condition

Many EDS blocks rebuild the DOM during decoration (using `block.innerHTML = ...`). This creates a race condition:

1. SSE `block-content` event arrives with HTML containing `<img data-gen-image="...">`
2. `renderBlockSection()` inserts HTML and calls `loadBlock()` (async)
3. Block JS loads and decoration starts
4. **Meanwhile**, `image-ready` events fire
5. Frontend tries `querySelector('img[data-gen-image="..."]')` but element may be:
   - Still the original (works)
   - Being rebuilt (not found)
   - Replaced with new element (works if attribute preserved)

## Solution: Two-Part Fix

### Part 1: Worker - Always Include `data-gen-image`

In `orchestrator.ts`, every block's HTML builder must:

1. **Always include the image** (with placeholder if not resolved)
2. **Add `data-gen-image` attribute** with the same ID used in `collectImageRequests()`

```typescript
// CORRECT - Always include with data-gen-image
const imageId = `grid-recipe-${i}`;
const imageUrl = getResolvedImageUrl(imageId, resolvedImages);
const imageSrc = imageUrl || PLACEHOLDER_IMAGE;
return `<img src="${imageSrc}" data-gen-image="${imageId}" loading="lazy">`;

// WRONG - Missing data-gen-image
return `<img src="${imageUrl}" loading="lazy">`;

// WRONG - Only includes image if already resolved
if (imageUrl) {
  return `<img src="${imageUrl}" loading="lazy">`;
}
return '<div></div>';
```

### Part 2: Block JS - Preserve Original Image Element

Blocks that rebuild the DOM must preserve the original `<img>` element (not just copy innerHTML):

```javascript
// CORRECT - Store and reuse original img element
let originalImg = null;

rows.forEach((row) => {
  const picture = cell.querySelector('picture');
  if (picture) {
    originalImg = picture.querySelector('img'); // Store reference
  }
});

// Build new DOM
block.innerHTML = `...`;

// Reinsert original img element
if (originalImg) {
  const container = block.querySelector('.image-container');
  container.appendChild(originalImg);
}

// WRONG - Using innerHTML (loses DOM reference, creates new element)
mediaHtml = picture.innerHTML; // String copy, not element reference
```

### Part 3: Frontend - Retry Logic

The frontend (`cerebras-scripts.js`) includes retry logic for race conditions:

```javascript
const pendingImages = new Map();

function applyImageUpdate(imageId, url) {
  const img = content.querySelector(`img[data-gen-image="${imageId}"]`);
  if (img) {
    img.src = url;
    img.classList.add('loaded');
    return true;
  }
  return false;
}

// Retry every 100ms for up to 2 seconds
setInterval(() => {
  pendingImages.forEach(({ url, attempts }, imageId) => {
    if (applyImageUpdate(imageId, url)) {
      pendingImages.delete(imageId);
    } else if (attempts >= 20) {
      console.warn(`Image not found: ${imageId}`);
      pendingImages.delete(imageId);
    }
  });
}, 100);
```

## Checklist for New Blocks

When creating a block that displays images:

- [ ] **Worker HTML builder** includes `data-gen-image="${imageId}"` on all images
- [ ] **Worker HTML builder** always includes image (with placeholder if not resolved)
- [ ] **Image ID format** matches between `collectImageRequests()` and HTML builder
- [ ] **Block JS** preserves original `<img>` element if rebuilding DOM
- [ ] Test with query that triggers the block type

## Testing

1. Run local dev server: `npm start`
2. Navigate to: `http://localhost:3000/?cerebras=yellow%20smoothies`
3. Open DevTools Console
4. **Expected logs:**
   - `[Cerebras] Image ready: hero`
   - `[Cerebras] Image ready: grid-recipe-0`
   - etc.
5. **If images don't load**, check for:
   - `[Cerebras] Image not found after retries: <imageId>` - Block not preserving `data-gen-image`
   - No `Image ready` log - Worker not sending `image-ready` event
   - Image ID mismatch between console and Elements panel

## Fixed Blocks

| Block | Issue | Fix |
|-------|-------|-----|
| `recipe-grid` | Missing `data-gen-image` in HTML | Added attribute in `buildRecipeGridHTML()` |
| `recipe-grid` | Block rebuilt DOM | Modified `recipe-grid.js` to reuse original img element |
| `technique-spotlight` | Missing `data-gen-image`, conditional include | Added attribute and always include in `buildTechniqueSpotlightHTML()` |
| `technique-spotlight` | Block rebuilt DOM | Modified `technique-spotlight.js` to reuse original img element |

## Blocks That May Need Similar Fixes

Blocks that use `block.innerHTML = ...` and display images:

- `recipe-cards`
- `product-cards`
- `category-cards`
- `use-case-cards`
- `benefits-grid`
- `product-recommendation`
- `feature-highlights`
- `included-accessories`

Run the test query and check console for "Image not found after retries" warnings.
