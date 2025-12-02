# Vitamix Generative Website - Layout Overview

This document provides a comprehensive overview of all page layouts available in the Vitamix generative website system.

## Implementation Status Legend

- ✅ **Implemented** - Block has HTML builder in orchestrator.ts and content schema in content.ts
- ⚠️ **Partial** - Block exists in frontend but missing generative support
- ❌ **Missing** - Block not implemented

---

## Current Layouts (13)

### 1. Product Detail (`product-detail`)

**Purpose:** Detailed view of a single Vitamix product

**Trigger Queries:**
- "Tell me about the A3500"
- "Vitamix Venturist features"
- "What can the Explorian do"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `product-hero` | default | ✅ |
| `specs-table` | highlight | ✅ |
| `feature-highlights` | default | ✅ |
| `included-accessories` | highlight | ✅ |
| `product-cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 2. Product Comparison (`product-comparison`)

**Purpose:** Side-by-side comparison of 2-5 Vitamix products

**Trigger Queries:**
- "A3500 vs A2500"
- "Compare Ascent models"
- "Which Vitamix should I buy"
- "Help me choose a blender"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (centered) | default | ✅ |
| `comparison-table` | highlight | ✅ |
| `verdict-card` | highlight | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 3. Recipe Collection (`recipe-collection`)

**Purpose:** Interactive recipe collection with filtering and search

**Trigger Queries:**
- "Soup recipes"
- "Smoothie ideas"
- "Healthy breakfast recipes"
- "Recipes with bananas"
- "Quick dinner ideas"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (full-width) | default | ✅ |
| `ingredient-search` | highlight | ✅ |
| `recipe-filter-bar` | default | ✅ |
| `recipe-grid` | default | ✅ |
| `technique-spotlight` | dark | ✅ |
| `quick-view-modal` | default | ✅ |
| `cta` | highlight | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 4. Use Case Landing (`use-case-landing`)

**Purpose:** Landing page for a specific use case with recipes, tips, and product recommendation

**Trigger Queries:**
- "I want to make smoothies every morning"
- "Best smoothie for energy"
- "Making baby food at home"
- "Meal prep for the week"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (full-width) | default | ✅ |
| `benefits-grid` | default | ✅ |
| `recipe-cards` | default | ✅ |
| `product-recommendation` (reverse) | highlight | ✅ |
| `tips-banner` | default | ✅ |
| `cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 5. Support & Troubleshooting (`support`)

**Purpose:** Empathetic troubleshooting with step-by-step guidance

**Trigger Queries:**
- "My Vitamix is making a grinding noise"
- "How to fix leaking"
- "Blender not turning on"
- "Vitamix smells like burning"
- "Container won't lock in place"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `support-hero` | default | ✅ |
| `diagnosis-card` | highlight | ✅ |
| `troubleshooting-steps` | default | ✅ |
| `faq` | highlight | ✅ |
| `support-cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 6. Category Browse (`category-browse`)

**Purpose:** Browse products in a category with product cards

**Trigger Queries:**
- "Show me all blenders"
- "Vitamix accessories"
- "Container options"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (centered) | default | ✅ |
| `product-cards` | default | ✅ |
| `benefits-grid` | highlight | ✅ |
| `cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 7. Educational / How-To (`educational`)

**Purpose:** Step-by-step instructions or educational content

**Trigger Queries:**
- "How to clean my Vitamix"
- "Blending techniques"
- "How to make nut butter"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (split) | default | ✅ |
| `text` | default | ✅ |
| `columns` | highlight | ✅ |
| `faq` | default | ✅ |
| `cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 8. Promotional (`promotional`)

**Purpose:** Sales, offers, and promotional content

**Trigger Queries:**
- "Vitamix deals"
- "Current promotions"
- "Best value blender"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (full-width) | dark | ✅ |
| `cards` | default | ✅ |
| `split-content` | highlight | ✅ |
| `cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 9. Quick Answer (`quick-answer`)

**Purpose:** Simple, direct answer to a question

**Trigger Queries:**
- "What is the warranty"
- "Vitamix return policy"
- "Where is Vitamix made"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (light) | default | ✅ |
| `text` | default | ✅ |
| `cta` | highlight | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 10. Lifestyle & Inspiration (`lifestyle`)

**Purpose:** Inspirational content about healthy living with Vitamix

**Trigger Queries:**
- "Healthy eating tips"
- "Whole food nutrition"
- "Kitchen wellness"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (full-width) | default | ✅ |
| `cards` | default | ✅ |
| `split-content` (reverse) | highlight | ✅ |
| `columns` | default | ✅ |
| `cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 11. Single Recipe (`single-recipe`)

**Purpose:** Detailed view of a single recipe with ingredients, steps, nutrition, and tips

**Trigger Queries:**
- "How to make tomato soup"
- "Green smoothie recipe"
- "Vitamix banana ice cream recipe"
- "Show me a hummus recipe"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `recipe-hero` | default | ✅ |
| `ingredients-list` | highlight | ✅ |
| `recipe-steps` | default | ✅ |
| `nutrition-facts` | highlight | ✅ |
| `recipe-tips` | default | ✅ |
| `recipe-cards` (related) | highlight | ✅ |
| `cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 12. Campaign Landing (`campaign-landing`)

**Purpose:** Seasonal or event-specific promotional campaigns

**Trigger Queries:**
- "Mother's Day gifts"
- "Holiday blender deals"
- "Valentine's Day recipes"
- "Black Friday Vitamix"
- "Summer smoothie campaign"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (full-width) | dark | ✅ |
| `countdown-timer` | highlight | ✅ |
| `product-cards` | default | ✅ |
| `testimonials` | highlight | ✅ |
| `cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

### 13. About / Brand Story (`about-story`)

**Purpose:** Brand story, company history, values, and mission

**Trigger Queries:**
- "Vitamix history"
- "About Vitamix"
- "Who makes Vitamix"
- "Vitamix company story"
- "Vitamix brand values"

**Blocks:**
| Block | Section Style | Status |
|-------|---------------|--------|
| `hero` (full-width) | default | ✅ |
| `text` | default | ✅ |
| `timeline` | highlight | ✅ |
| `benefits-grid` (values) | default | ✅ |
| `team-cards` | highlight | ✅ |
| `cta` | dark | ✅ |

**Status:** ✅ Fully implemented and available for generation

---

## Block Implementation Summary

### All Implemented Blocks (39)

| Block | Used In Layouts |
|-------|-----------------|
| `hero` | All layouts |
| `cards` | promotional, lifestyle |
| `product-cards` | category-browse |
| `columns` | educational, lifestyle |
| `split-content` | promotional, lifestyle |
| `text` | educational, quick-answer |
| `cta` | All layouts |
| `faq` | support, educational |
| `benefits-grid` | use-case-landing, category-browse |
| `recipe-cards` | use-case-landing |
| `product-recommendation` | use-case-landing |
| `tips-banner` | use-case-landing |
| `ingredient-search` | recipe-collection |
| `recipe-filter-bar` | recipe-collection |
| `recipe-grid` | recipe-collection |
| `quick-view-modal` | recipe-collection |
| `technique-spotlight` | recipe-collection |
| `support-hero` | support |
| `diagnosis-card` | support |
| `troubleshooting-steps` | support |
| `support-cta` | support |
| `comparison-table` | product-comparison |
| `use-case-cards` | (available, not in default layouts) |
| `verdict-card` | product-comparison |
| `comparison-cta` | (available, not in default layouts) |
| `product-hero` | product-detail |
| `specs-table` | product-detail |
| `feature-highlights` | product-detail |
| `included-accessories` | product-detail |
| `product-cta` | product-detail |
| `recipe-hero` | single-recipe |
| `ingredients-list` | single-recipe |
| `recipe-steps` | single-recipe |
| `nutrition-facts` | single-recipe |
| `recipe-tips` | single-recipe |
| `countdown-timer` | campaign-landing |
| `testimonials` | campaign-landing |
| `timeline` | about-story |
| `team-cards` | about-story |

---

## Quick Reference: Query → Layout Mapping

| Query Pattern | Layout |
|---------------|--------|
| "Tell me about [product]" | product-detail |
| "[Product] vs [Product]" | product-comparison |
| "Compare [products]" | product-comparison |
| "Which [product] should I" | product-comparison |
| "[Food] recipes" | recipe-collection |
| "Recipes with [ingredient]" | recipe-collection |
| "How to make [dish]" | single-recipe |
| "[Food] recipe" | single-recipe |
| "I want to [goal]" | use-case-landing |
| "[Problem] not working" | support |
| "How to fix [issue]" | support |
| "Show me all [category]" | category-browse |
| "[Category] accessories" | category-browse |
| "How to [task]" | educational |
| "[Product] deals" | promotional |
| "What is [question]" | quick-answer |
| "Healthy [topic]" | lifestyle |
| "[Holiday] gifts" | campaign-landing |
| "Black Friday/holiday deals" | campaign-landing |
| "About Vitamix" | about-story |
| "Vitamix history" | about-story |

---

## File Locations

- Layout definitions: `workers/generative-cerebras/src/prompts/layouts.ts`
- Content schemas: `workers/generative-cerebras/src/prompts/content.ts`
- HTML builders: `workers/generative-cerebras/src/lib/orchestrator.ts`
- Block types: `workers/generative-cerebras/src/types.ts`
- Frontend blocks: `blocks/[block-name]/`

---

*Last updated: December 2024*
