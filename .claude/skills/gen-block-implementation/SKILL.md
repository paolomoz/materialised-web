---
name: Generative Block Implementation
description: Guidelines for implementing EDS blocks that work with the Vitamix generative page system. Use when creating new blocks or modifying existing blocks in the generative website workers.
---

# Block Implementation

Guidelines for implementing EDS blocks that work with the generative page system.

## Block Architecture Overview

Each block requires implementation in 3 layers:

```
┌─────────────────────────────────────────────────────────────┐
│  1. FRONTEND BLOCK (blocks/block-name/)                     │
│     - block-name.js  → Decorator (DOM manipulation)         │
│     - block-name.css → Styling                              │
├─────────────────────────────────────────────────────────────┤
│  2. HTML BUILDER (workers/generative/src/lib/orchestrator)  │
│     - buildBlockNameHTML() function                         │
│     - Case in buildBlockHTML() switch                       │
├─────────────────────────────────────────────────────────────┤
│  3. CONTENT GENERATION (workers/generative/src/prompts/)    │
│     - Block spec in content.ts                              │
│     - Content schema for Gemini                             │
└─────────────────────────────────────────────────────────────┘
```

## Content Model (DA Table Structure)

Every block is authored as a table in Document Authoring:

```
| Block Name (variant) |              |              |
|----------------------|--------------|--------------|
| Cell 1,1             | Cell 1,2     | Cell 1,3     |
| Cell 2,1             | Cell 2,2     | Cell 2,3     |
```

### Key Principles:
- First row = block name (with optional variant in parentheses)
- Subsequent rows = content
- Rows = semantic groups
- Cells can contain: text, `**bold**`, `[links](url)`, `<picture>` elements

### Common Patterns:

**Column-based (items as columns):**
```
| Recipe Grid    |              |              |
|----------------|--------------|--------------|
| [image1]       | [image2]     | [image3]     |
| **Title 1**    | **Title 2**  | **Title 3**  |
| Meta 1         | Meta 2       | Meta 3       |
```

**Row-based (items as rows):**
```
| FAQ            |              |
|----------------|--------------|
| Question 1?    | Answer 1     |
| Question 2?    | Answer 2     |
```

**Single-column (flowing content):**
```
| Text           |
|----------------|
| ## Headline    |
| Paragraph 1    |
| Paragraph 2    |
```

## JavaScript Decorator Pattern

```javascript
/**
 * Block Name Block
 *
 * Description of what the block does.
 *
 * Content Model (DA Table):
 * | Block Name |           |
 * |------------|-----------|
 * | ...        | ...       |
 *
 * HTML structure after EDS processing:
 * <div class="block-name">
 *   <div>              <!-- row -->
 *     <div>...</div>   <!-- cell -->
 *   </div>
 * </div>
 */
export default function decorate(block) {
  // 1. Query existing DOM structure
  const rows = [...block.children];

  // 2. Parse/extract data from cells
  const items = [];
  rows.forEach((row) => {
    const cells = [...row.children];
    // Extract content from cells...
  });

  // 3. Rebuild HTML if needed (for complex transformations)
  // block.innerHTML = newHTML;

  // 4. Add event listeners
  // 5. Add accessibility attributes (aria-*, role, tabindex)
}
```

## HTML Builder Pattern

In `orchestrator.ts`:

```typescript
// 1. Add case in buildBlockHTML switch
case 'block-name':
  return buildBlockNameHTML(content as any, variant, slug, block.id);

// 2. Builder function
function buildBlockNameHTML(
  content: any,
  variant: string,
  slug: string,
  blockId: string
): string {
  // Generate DA-compatible HTML structure
  return `
    <div class="block-name${variant !== 'default' ? ` ${variant}` : ''}">
      <div><div>Cell content</div></div>
    </div>
  `.trim();
}
```

### HTML Structure Rules:
- Outer div = block class
- Inner divs = rows and cells
- Match the structure EDS expects
- Use `escapeHTML()` for user content

## Image Handling

For blocks with AI-generated images:

```typescript
// 1. In buildImageRequests() function
case 'block-name':
  requests.push({
    id: `blockname-${blockId}`,      // Unique ID for SSE updates
    blockId: block.id,
    prompt: content.imagePrompt || 'fallback prompt',
    aspectRatio: '4:3',              // '16:9', '1:1', '4:3'
    size: 'card',                    // 'hero', 'card', 'column'
  });
  break;

// 2. In HTML, use data-gen-image for SSE updates
const imageUrl = buildImageUrl(slug, `blockname-${blockId}`);
const html = `<img src="${imageUrl}" alt="..." data-gen-image="blockname-${blockId}" loading="lazy">`;
```

### Critical: Preserve data-gen-image
When decorators rebuild HTML, they MUST preserve the `data-gen-image` attribute:

```javascript
// In decorator
const img = cell.querySelector('img');
const genImageId = img?.dataset?.genImage || '';

// When rebuilding
const genImageAttr = genImageId ? ` data-gen-image="${genImageId}"` : '';
newImg.setAttribute('data-gen-image', genImageId);
```

## CSS Structure

```css
/* Block container */
.block-name {
  max-width: var(--max-width-content);
  margin: 0 auto;
  padding: var(--spacing-section-md) var(--spacing-lg);
}

/* Target EDS structure */
.block-name > div {           /* row */
  display: grid;
  gap: var(--spacing-lg);
}

.block-name > div > div {     /* cell */
  /* cell styles */
}

/* Variants */
.block-name.compact { }
.block-name.dark { }

/* Override global styles with specificity */
.block-name .button,
.block-name .button:any-link {
  /* Block-specific button styles */
}

/* Responsive */
@media (width < 768px) {
  .block-name > div {
    grid-template-columns: 1fr;
  }
}
```

## Common Gotchas

### 1. CSS Specificity
Global styles in `styles.css` can override block styles:
```css
/* Bad - gets overridden */
.action-button { color: white; }

/* Good - higher specificity */
.block-name .action-button { color: white; }
```

### 2. EDS Processing
The HTML you generate must match what EDS expects after processing the DA table.

### 3. SSE Image Updates
The `image-ready` SSE event finds images by `data-gen-image` attribute. If your decorator removes this, images won't update.

### 4. Accessibility
Always add:
- `role` attributes for interactive elements
- `aria-expanded` for accordions/dropdowns
- `aria-label` for icon-only buttons
- `tabindex="0"` for custom focusable elements

## Block Implementation Checklist

- [ ] Define content model (DA Table structure)
- [ ] Create `blocks/block-name/block-name.js`
- [ ] Create `blocks/block-name/block-name.css`
- [ ] Add `buildBlockNameHTML()` in orchestrator.ts
- [ ] Add case in `buildBlockHTML()` switch
- [ ] Add image requests if block has images
- [ ] Add block type to `buildImageRequests()` switch
- [ ] Test with generated content
- [ ] Verify SSE image updates work
- [ ] Check responsive behavior
- [ ] Verify accessibility

## File Locations

- Frontend blocks: `blocks/block-name/`
- HTML builders: `workers/generative/src/lib/orchestrator.ts`
- Content prompts: `workers/generative/src/prompts/content.ts`
- Layout templates: `workers/generative/src/prompts/layouts.ts`

## Related Skills

- **gen-layout-definition** - How to define layouts
- **vitamix-design-system** - Vitamix-specific styling guidelines
