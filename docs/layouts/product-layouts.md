# Product Layouts Definition

Reference documentation for Layout 1 (Product Detail) and Layout 2 (Product Comparison).

---

## Layout 1: Product Detail

**ID:** `product-detail`

**Purpose:** Deep dive into a single Vitamix product with specs, features, and purchase path.

**Triggers:**
- "Tell me about the A3500"
- "Vitamix Venturist features"
- "What can the Explorian do"
- "A2500 specs"

### Page Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ SECTION 1: product-hero                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────┐   ASCENT SERIES A3500                       │
│  │                │   ★★★★★ (847 reviews)                       │
│  │                │                                             │
│  │   [Product     │   "The most advanced Vitamix ever"          │
│  │    Image]      │                                             │
│  │                │   $649.95                                   │
│  │                │                                             │
│  │                │   ┌────────┐ ┌────────┐ ┌────────┐          │
│  └────────────────┘   │ 2.2 HP │ │ 64 oz  │ │ 10 yr  │          │
│                       └────────┘ └────────┘ └────────┘          │
│                                                                 │
│                   [ Shop Now ]    [ Compare Models ]            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 2: specs-table                              [highlight] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  SPECIFICATIONS                                                 │
│                                                                 │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐      │
│  │   ⚡ Motor  │  📦 Container│  🎛️ Programs │  ✓ Warranty │      │
│  │   2.2 HP    │   64 oz     │      5      │   10 years  │      │
│  ├─────────────┼─────────────┼─────────────┼─────────────┤      │
│  │  📱 Controls│  🔊 Noise   │  📐 Dims    │  ⚖️ Weight  │      │
│  │ Touchscreen │   Low       │  11x8x17"   │   12.5 lbs  │      │
│  └─────────────┴─────────────┴─────────────┴─────────────┘      │
│                                                                 │
│  [ View Full Specifications ↓ ]                                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 3: feature-highlights                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  KEY FEATURES                                                   │
│                                                                 │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐    │
│  │    [image]      │ │    [image]      │ │    [image]      │    │
│  │                 │ │                 │ │                 │    │
│  │  TOUCHSCREEN    │ │  SELF-DETECT    │ │  5 PROGRAMS     │    │
│  │                 │ │                 │ │                 │    │
│  │ Intuitive LED   │ │ Automatically   │ │ Smoothies, Hot  │    │
│  │ controls with   │ │ adjusts blend   │ │ Soups, Frozen,  │    │
│  │ digital timer   │ │ settings for    │ │ Dips, and Self- │    │
│  │ and program     │ │ container size  │ │ Cleaning modes  │    │
│  │ selection       │ │                 │ │                 │    │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 4: included-accessories                     [highlight] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  WHAT'S IN THE BOX                                              │
│                                                                 │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐                 │
│  │[image] │  │[image] │  │[image] │  │[image] │                 │
│  │64 oz   │  │ Tamper │  │Cookbook│  │ Quick  │                 │
│  │Low-Pro │  │        │  │        │  │ Start  │                 │
│  └────────┘  └────────┘  └────────┘  └────────┘                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 5: product-cta                                   [dark] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│           Ready to upgrade your kitchen?                        │
│                                                                 │
│                 ASCENT A3500                                    │
│                   $649.95                                       │
│                                                                 │
│    [ Add to Cart ]    [ Find Retailer ]    [ Compare ]          │
│                                                                 │
│           Free shipping · 10-year warranty                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Specialized Blocks

| Block | Description | Content Model |
|-------|-------------|---------------|
| `product-hero` | Hero with product image, name, rating, price, spec badges, CTAs | Image, title, tagline, price, rating, 3-4 spec badges |
| `specs-table` | 2x4 grid of key specifications with icons | 8 spec items with icon, label, value |
| `feature-highlights` | 3 key features with images and descriptions | 3 cards with image, title, description |
| `included-accessories` | What's in the box grid | 3-5 accessory items with image and name |
| `product-cta` | Purchase CTA with price and multiple actions | Product name, price, 2-3 action buttons, trust badges |

### Content Model (DA Table)

```
| Product Hero |
|--------------|
| [Product Image] |
| Ascent Series A3500 |
| "The most advanced Vitamix ever" |
| $649.95 |
| ★★★★★ (847 reviews) |
| 2.2 HP, 64 oz, 10 year warranty |

| Specs Table |
|-------------|
| Motor | 2.2 HP |
| Container | 64 oz Low-Profile |
| Programs | 5 preset programs |
| Warranty | 10 years full |
| Controls | Digital touchscreen |
| Noise Level | Reduced noise |
| Dimensions | 11" x 8" x 17" |
| Weight | 12.5 lbs |

| Feature Highlights |
|--------------------|
| [Touchscreen image] | Touchscreen Controls | Intuitive LED controls with digital timer |
| [Self-detect image] | Self-Detect Technology | Automatically adjusts settings for container |
| [Programs image] | 5 Program Settings | Smoothies, Hot Soups, Frozen Desserts, Dips, Self-Cleaning |

| Included Accessories |
|----------------------|
| [Container image] | 64 oz Low-Profile Container |
| [Tamper image] | Tamper |
| [Cookbook image] | Simply Blending Cookbook |
| [Guide image] | Getting Started Guide |
```

---

## Layout 2: Product Comparison

**ID:** `product-comparison`

**Purpose:** Side-by-side comparison of 2-5 products with specs, recommendations, and verdict.

**Triggers:**
- "A3500 vs A2500"
- "Compare Ascent models"
- "Which Vitamix should I buy"
- "A3500 vs A2500 vs E310"
- "Compare all Ascent blenders"

### Page Structure (3-Product Example)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SECTION 1: hero (centered, no image)                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    COMPARE VITAMIX BLENDERS                                 │
│                                                                             │
│         Find the perfect blender for your kitchen and lifestyle             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SECTION 2: comparison-table                                     [highlight] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────┬────────────┬────────────┬────────────┐                  │
│  │                │   A3500    │   A2500    │   E310     │                  │
│  ├────────────────┼────────────┼────────────┼────────────┤                  │
│  │ Price          │   $649     │   $549     │   $349 ✓   │ ← best value     │
│  │ Motor          │  2.2 HP    │  2.2 HP    │  2.0 HP    │                  │
│  │ Container      │   64 oz    │   64 oz    │   48 oz    │                  │
│  │ Controls       │ Touch ✓    │   Dial     │   Dial     │ ← most advanced  │
│  │ Programs       │    5 ✓     │     3      │     0      │ ← most programs  │
│  │ Self-Detect    │    ✓ ✓     │     ✓      │     ✗      │ ← smart tech     │
│  │ Warranty       │  10 yr     │   10 yr    │   5 yr     │                  │
│  │ Noise Level    │   Low ✓    │   Low      │  Standard  │ ← quietest       │
│  │ WiFi/App       │    ✓ ✓     │     ✗      │     ✗      │ ← connected      │
│  └────────────────┴────────────┴────────────┴────────────┘                  │
│                                                                             │
│  ✓ = Winner in category   ✓✓ = Best overall in category                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SECTION 3: use-case-cards                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  WHICH ONE IS RIGHT FOR YOU?                                                │
│                                                                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                │
│  │ 👨‍🍳 POWER USER   │ │ 👍 MOST POPULAR │ │ 💰 BEST VALUE   │                │
│  │                 │ │                 │ │                 │                │
│  │     A3500       │ │     A2500       │ │     E310        │                │
│  │                 │ │                 │ │                 │                │
│  │ Best for tech-  │ │ Best balance of │ │ Best for budget │                │
│  │ savvy cooks who │ │ features and    │ │ buyers who want │                │
│  │ want touchscreen│ │ value. Manual   │ │ Vitamix quality │                │
│  │ convenience and │ │ control with    │ │ without premium │                │
│  │ app integration │ │ preset programs │ │ features        │                │
│  │                 │ │                 │ │                 │                │
│  │  [ Shop A3500 ] │ │  [ Shop A2500 ] │ │  [ Shop E310 ]  │                │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SECTION 4: verdict-card                                         [highlight] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────┐      │
│  │                                                                   │      │
│  │   🏆 THE VERDICT                                                  │      │
│  │                                                                   │      │
│  │   For most people, we recommend the A2500. It offers the         │      │
│  │   same 2.2 HP motor and 10-year warranty as the A3500,           │      │
│  │   but saves you $100 with intuitive dial controls.               │      │
│  │                                                                   │      │
│  │   Choose A3500 if: You want touchscreen, WiFi, and 5 programs    │      │
│  │   Choose A2500 if: You want great value with manual control      │      │
│  │   Choose E310 if: You're on a budget but want Vitamix power      │      │
│  │                                                                   │      │
│  │   All three deliver the same legendary Vitamix blending          │      │
│  │   performance that pulverizes anything you throw at them.        │      │
│  │                                                                   │      │
│  └───────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SECTION 5: comparison-cta                                            [dark] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                    READY TO DECIDE?                                         │
│                                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│   │   A3500     │    │   A2500     │    │   E310      │                     │
│   │   $649      │    │   $549      │    │   $349      │                     │
│   │ [Shop Now]  │    │ [Shop Now]  │    │ [Shop Now]  │                     │
│   └─────────────┘    └─────────────┘    └─────────────┘                     │
│                                                                             │
│              All models include free shipping                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Specialized Blocks

| Block | Description | Content Model |
|-------|-------------|---------------|
| `hero` | Standard centered hero (existing block) | Title, subtitle |
| `comparison-table` | Spec comparison grid with winner indicators | Array of specs, each with values per product |
| `use-case-cards` | N recommendation cards with persona + reasoning | Array of use-cases with persona, product, reasoning |
| `verdict-card` | Summary recommendation with conditional logic | Verdict text, per-product recommendations |
| `comparison-cta` | N product CTAs side-by-side | Array of products with name, price, CTA |

### Content Model (DA Table)

```
| Comparison Hero |
|-----------------|
| Compare Vitamix Blenders |
| [A3500 image] | A3500 | $649.95 | ★★★★★ |
| [A2500 image] | A2500 | $549.95 | ★★★★★ |
| [E310 image] | E310 | $349.95 | ★★★★☆ |

| Comparison Table |
|------------------|
| Spec | A3500 | A2500 | E310 |
| Price | $649 | $549 | $349 ✓ |
| Motor | 2.2 HP | 2.2 HP | 2.0 HP |
| Container | 64 oz | 64 oz | 48 oz |
| Controls | Touchscreen ✓ | Dial | Dial |
| Programs | 5 ✓ | 3 | 0 |
| Self-Detect | ✓ | ✓ | ✗ |
| Warranty | 10 yr | 10 yr | 5 yr |

| Use Case Cards |
|----------------|
| 👨‍🍳 Power User | A3500 | Best for tech-savvy cooks who want touchscreen and app |
| 👍 Most Popular | A2500 | Best balance of features and value with manual control |
| 💰 Best Value | E310 | Best for budget buyers who want Vitamix quality |

| Verdict Card |
|--------------|
| For most people, we recommend the A2500... |
| Choose A3500 if: You want touchscreen, WiFi, and 5 programs |
| Choose A2500 if: You want great value with manual control |
| Choose E310 if: You're on a budget but want Vitamix power |
```

### Comparison Table Spec Categories

Standard specs to compare (include relevant ones based on products):

| Category | Spec | Notes |
|----------|------|-------|
| **Price** | MSRP | Highlight best value |
| **Power** | Motor HP | Usually 2.0-2.2 HP |
| **Capacity** | Container Size | 32, 48, 64 oz |
| **Interface** | Controls | Touchscreen, Dial, Switches |
| **Automation** | Programs | 0-5 preset programs |
| **Smart Tech** | Self-Detect | Container recognition |
| **Connectivity** | WiFi/App | Connected features |
| **Warranty** | Duration | 5, 7, 10 years |
| **Noise** | Sound Level | Standard, Low |
| **Design** | Profile | Classic, Low-Profile |
| **Series** | Product Line | Ascent, Explorian, Legacy |

### Winner Indicators

```
✓   = Winner in this category (one per row)
✓✓  = Exceptional/Best overall (rare)
—   = Tie or not applicable
✗   = Missing feature
```

---

## Block Type Definitions

### For TypeScript (layouts.ts)

```typescript
export interface BlockTemplate {
  type: 'hero' | 'cards' | 'columns' | 'split-content' | 'text' | 'cta' | 'faq'
    // Recipe Collection (Layout 3)
    | 'benefits-grid' | 'recipe-cards' | 'product-recommendation' | 'tips-banner'
    | 'ingredient-search' | 'recipe-filter-bar' | 'recipe-grid' | 'quick-view-modal'
    | 'technique-spotlight'
    // Support (Layout 5)
    | 'support-hero' | 'diagnosis-card' | 'troubleshooting-steps' | 'support-cta'
    // Product Detail (Layout 1) - NEW
    | 'product-hero' | 'specs-table' | 'feature-highlights' | 'included-accessories'
    | 'product-cta'
    // Product Comparison (Layout 2) - NEW
    | 'comparison-table' | 'use-case-cards' | 'verdict-card' | 'comparison-cta';

  variant?: string;
  width?: 'full' | 'contained';
  config?: {
    itemCount?: number;      // Number of items (products, specs, features)
    hasImage?: boolean;      // Whether block includes images
    productCount?: number;   // For comparison: number of products (2-5)
    [key: string]: any;
  };
}
```

---

## Layout Template Definitions

### Layout 1: Product Detail

```typescript
export const LAYOUT_PRODUCT_DETAIL: LayoutTemplate = {
  id: 'product-detail',
  name: 'Product Detail',
  description: 'Deep dive into a single Vitamix product',
  useCases: [
    'Tell me about the A3500',
    'Vitamix Venturist features',
    'What can the Explorian do',
    'A2500 specs',
  ],
  sections: [
    {
      blocks: [
        { type: 'product-hero', width: 'full', config: { hasImage: true } },
      ],
    },
    {
      style: 'highlight',
      blocks: [
        { type: 'specs-table', config: { itemCount: 8 } },
      ],
    },
    {
      blocks: [
        { type: 'feature-highlights', config: { itemCount: 3, hasImage: true } },
      ],
    },
    {
      style: 'highlight',
      blocks: [
        { type: 'included-accessories', config: { itemCount: 4, hasImage: true } },
      ],
    },
    {
      style: 'dark',
      blocks: [
        { type: 'product-cta' },
      ],
    },
  ],
};
```

### Layout 2: Product Comparison

```typescript
export const LAYOUT_PRODUCT_COMPARISON: LayoutTemplate = {
  id: 'product-comparison',
  name: 'Product Comparison',
  description: 'Side-by-side comparison of 2-5 Vitamix products',
  useCases: [
    'A3500 vs A2500',
    'Compare Ascent models',
    'Which Vitamix should I buy',
    'A3500 vs A2500 vs E310',
    'Compare all Ascent blenders',
  ],
  sections: [
    {
      blocks: [
        { type: 'hero', variant: 'centered', config: { hasImage: false } },
      ],
    },
    {
      style: 'highlight',
      blocks: [
        { type: 'comparison-table', config: { itemCount: 8 } },
      ],
    },
    {
      blocks: [
        { type: 'use-case-cards' },
      ],
    },
    {
      style: 'highlight',
      blocks: [
        { type: 'verdict-card' },
      ],
    },
    {
      style: 'dark',
      blocks: [
        { type: 'comparison-cta' },
      ],
    },
  ],
};
```

---

## Implementation Checklist

### Layout 1: Product Detail

| Block | Status | Priority |
|-------|--------|----------|
| `product-hero` | ⬜ TODO | P1 |
| `specs-table` | ⬜ TODO | P1 |
| `feature-highlights` | ⬜ TODO | P2 |
| `included-accessories` | ⬜ TODO | P3 |
| `product-cta` | ⬜ TODO | P2 |

### Layout 2: Product Comparison

| Block | Status | Priority |
|-------|--------|----------|
| `hero` | ✅ Exists | - |
| `comparison-table` | ⬜ TODO | P0 (critical) |
| `use-case-cards` | ⬜ TODO | P2 |
| `verdict-card` | ⬜ TODO | P1 |
| `comparison-cta` | ⬜ TODO | P2 |

---

## Design Tokens

Consistent with Vitamix design system:

```css
/* Colors */
--vitamix-red: #c41230;
--vitamix-dark: #1a1a1a;
--vitamix-highlight: #f5f5f5;

/* Winner indicators */
--winner-green: #15803d;
--winner-badge: #dcfce7;

/* Typography */
--product-title: 2rem, 700;
--price: 1.5rem, 600;
--spec-label: 0.875rem, 600;
--spec-value: 1rem, 400;

/* Spacing */
--card-gap: 1.5rem;
--section-padding: 3rem 1.5rem;
```
