# Layout Selection Strategy

This document describes how the generative page system selects the appropriate layout template for a user query.

## Overview

The layout selection process has three stages:

1. **LLM Intent Classification** - Classifies query and suggests a layout
2. **Rule-Based Selection** - Fallback logic when LLM confidence is low
3. **Post-RAG Adjustment** - Adjusts layout based on retrieved content

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  User Query     │────▶│  LLM Classifies  │────▶│  RAG Retrieval  │
└─────────────────┘     │  Intent + Layout │     └────────┬────────┘
                        └────────┬─────────┘              │
                                 │                        │
                        ┌────────▼─────────┐     ┌────────▼────────┐
                        │  getLayoutFor    │────▶│  adjustLayout   │
                        │  Intent()        │     │  ForRAGContent()│
                        └──────────────────┘     └────────┬────────┘
                                                          │
                                                 ┌────────▼────────┐
                                                 │  Final Layout   │
                                                 └─────────────────┘
```

## Available Layouts

| Layout ID | Purpose | Key Blocks |
|-----------|---------|------------|
| `product-detail` | Single product page | product-hero, specs-table, feature-highlights |
| `product-comparison` | Compare 2+ products | comparison-table, verdict-card |
| `recipe-collection` | Browse multiple recipes | recipe-grid, recipe-filter-bar, ingredient-search |
| `single-recipe` | One detailed recipe | recipe-hero, ingredients-list, recipe-steps |
| `use-case-landing` | Routine/habit focused | benefits-grid, recipe-cards, tips-banner |
| `support` | Troubleshooting | diagnosis-card, troubleshooting-steps |
| `category-browse` | Browse product category | product-cards, benefits-grid |
| `educational` | How-to content | text, columns, faq |
| `promotional` | Sales/offers | hero, cards, split-content |
| `quick-answer` | Simple factual answer | hero, text |
| `lifestyle` | Inspirational content | cards, split-content, columns |
| `campaign-landing` | Seasonal/event campaigns | countdown-timer, testimonials |
| `about-story` | Brand/company info | timeline, team-cards |

## Stage 1: LLM Intent Classification

The LLM classifies each query and outputs:

```typescript
interface IntentClassification {
  intentType: 'product_info' | 'recipe' | 'comparison' | 'support' | 'general';
  confidence: number;        // 0.0 - 1.0
  layoutId: LayoutId;        // LLM's suggested layout
  contentTypes: ContentType[];
  entities: {
    products: string[];      // e.g., ["A3500", "Pro 750"]
    ingredients: string[];   // e.g., ["spinach", "banana"]
    goals: string[];         // e.g., ["morning routine", "meal prep"]
  };
}
```

### Product Catalog

The prompt includes a known product list to prevent hallucinated product names:

- **Ascent Series**: A3500, A2500, A2300
- **Explorian Series**: E310, E320
- **Legacy Series**: Pro 750, Pro 500, 5200, 5300, 7500
- **Accessories**: Self-Detect containers, Dry Grains container, etc.

### Disambiguation Examples

The prompt includes explicit disambiguation tables to handle edge cases:

| Query | Layout | Reason |
|-------|--------|--------|
| "Green smoothie recipe" | single-recipe | Singular = specific recipe |
| "Green smoothie recipes" | recipe-collection | Plural = multiple |
| "I drink smoothies every morning" | use-case-landing | Routine pattern |
| "A3500 vs A2500" | product-comparison | Explicit "vs" |
| "Best Vitamix blender" | product-comparison | Superlative = comparison |

## Stage 2: Rule-Based Selection

```typescript
function getLayoutForIntent(
  intentType: string,
  contentTypes: string[],
  entities: { products: string[]; goals: string[]; ingredients?: string[] },
  llmLayoutId?: string,    // LLM's suggested layout
  confidence?: number      // LLM's confidence score
): LayoutTemplate
```

### Confidence Threshold

When LLM confidence is **≥ 0.85**, the LLM's layout choice is trusted directly:

```typescript
if (llmLayoutId && confidence >= 0.85) {
  const layout = getLayoutById(llmLayoutId);
  if (layout) return layout;  // Trust LLM
}
// Otherwise, apply rule-based fallback
```

### Rule-Based Fallback

When confidence is low or LLM choice is invalid:

```
1. support intent → LAYOUT_SUPPORT
2. comparison intent → LAYOUT_PRODUCT_COMPARISON
3. product_info + 1 product → LAYOUT_PRODUCT_DETAIL
4. product_info + 0 products → LAYOUT_CATEGORY_BROWSE
5. recipe intent:
   - Single recipe patterns → LAYOUT_SINGLE_RECIPE
   - Use-case patterns → LAYOUT_USE_CASE_LANDING
   - Otherwise → LAYOUT_RECIPE_COLLECTION
6. Campaign patterns → LAYOUT_CAMPAIGN_LANDING
7. About patterns → LAYOUT_ABOUT_STORY
8. support/editorial content → LAYOUT_EDUCATIONAL
9. Default → LAYOUT_LIFESTYLE
```

### Semantic Pattern Matching

Instead of simple `includes()` checks, regex patterns prevent false positives:

#### Use-Case Patterns (triggers `use-case-landing`)
```javascript
/every\s+(morning|day|week|night|evening)/i    // "every morning"
/daily\s+(routine|habit|use|smoothie|juice)/i  // "daily routine"
/(morning|evening)\s+routine/i                  // "morning routine"
/meal\s+prep/i                                  // "meal prep"
/start\s+(my|the|your)\s+(day|morning)/i       // "start my day"
/each\s+(morning|day|week)/i                   // "each morning"
```

#### Single Recipe Patterns (triggers `single-recipe`)
```javascript
/how\s+(do\s+i|to|can\s+i)\s+make/i   // "how to make"
/recipe\s+for\s+\w+/i                  // "recipe for hummus"
/make\s+(a|me|some)\s+\w+/i            // "make me a smoothie"
/\w+\s+recipe$/i                       // "hummus recipe"
```

#### Campaign Patterns (triggers `campaign-landing`)
```javascript
/mother'?s?\s*day/i                              // "Mother's Day"
/black\s*friday/i                                // "Black Friday"
/(christmas|holiday)\s*(gift|deal|sale)?/i       // "Christmas gifts"
/(summer|winter)\s+(sale|special|campaign)/i     // "summer sale"
/\b(gift\s+guide|gift\s+ideas?)\b/i             // "gift guide"
```

### Why Patterns > Keywords

| Query | OLD (includes) | NEW (regex) |
|-------|---------------|-------------|
| "What can I prep?" | use-case-landing ❌ | recipe-collection ✓ |
| "Recipes any morning" | use-case-landing ❌ | recipe-collection ✓ |
| "Daily vitamins smoothie" | use-case-landing ❌ | recipe-collection ✓ |
| "Every type of soup" | use-case-landing ❌ | recipe-collection ✓ |
| "Start my day healthy" | recipe-collection ❌ | use-case-landing ✓ |

## Stage 3: Post-RAG Adjustment

After RAG retrieval, the layout is adjusted based on what content was actually found:

```typescript
function adjustLayoutForRAGContent(
  layout: LayoutTemplate,
  ragContext: {
    hasProductInfo: boolean;
    hasRecipes: boolean;
    chunks: Array<{ metadata: { content_type: string } }>;
  }
): LayoutTemplate
```

### Adjustment Rules

| Initial Layout | RAG Result | Adjusted Layout |
|----------------|------------|-----------------|
| `single-recipe` | No recipes found | `educational` |
| `recipe-collection` | No recipes found | `lifestyle` |
| `product-detail` | Multiple products | `product-comparison` |
| `product-detail` | No products | `category-browse` |
| `category-browse` | Single product | `product-detail` |

### Why Post-RAG Adjustment?

If user asks "tomato soup recipe" but no tomato soup recipe exists in the knowledge base:
- **Before**: Empty single-recipe page with placeholder content
- **After**: Educational page with general soup-making tips

## Files

| File | Purpose |
|------|---------|
| `src/prompts/intent.ts` | Intent classification prompt with product catalog and disambiguation |
| `src/prompts/layouts.ts` | Layout templates, selection logic, and RAG adjustment |
| `src/lib/orchestrator.ts` | Wires together intent → layout → content generation |
| `src/types.ts` | TypeScript interfaces for IntentClassification, LayoutId, etc. |

## Adding a New Layout

1. Define the layout template in `layouts.ts`:
```typescript
export const LAYOUT_NEW_TYPE: LayoutTemplate = {
  id: 'new-type',
  name: 'New Type',
  description: 'Description of when to use this layout',
  useCases: ['example query 1', 'example query 2'],
  sections: [/* block definitions */],
};
```

2. Add to `LAYOUTS` array in `layouts.ts`

3. Add `layout_id` to intent prompt in `intent.ts`

4. Add disambiguation examples if needed

5. Add pattern matching rules in `getLayoutForIntent()` if rule-based fallback is needed

6. Update `LayoutId` type in `types.ts`

## Debugging

Layout selection logs to console:

```
[Layout] Trusting LLM choice: product-detail (confidence: 0.95)
```
or
```
[Layout] Using rule-based fallback (LLM confidence: 0.6)
[Layout Adjust] product-detail → category-browse (no products in RAG)
```

Check these logs to understand why a particular layout was selected.
