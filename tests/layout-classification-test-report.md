# Layout Classification Test Report

**Date:** 2025-12-03
**Tested by:** Automated test suite
**Model:** Cerebras llama3.1-8b
**Worker:** https://vitamix-generative-cerebras.paolo-moz.workers.dev

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Queries | 100 |
| Passed | 76 |
| Failed | 24 |
| **Accuracy** | **76.0%** |
| Avg Response Time | 1,447ms/query |
| Total Test Duration | 144.7s |

---

## Test Methodology

### Approach
Direct API testing of the Cerebras LLM intent classification endpoint, bypassing the full page generation pipeline to isolate classification accuracy.

### Test Endpoint
`POST /api/classify-batch` - A batch classification endpoint that:
1. Accepts an array of `{ query, expected }` test cases
2. Calls `classifyIntent()` for each query
3. Compares actual `layoutId` against expected layout
4. Returns detailed results with pass/fail status

### Test Coverage
- 100 queries across all 13 layout types
- 6-8 queries per layout type
- Queries designed to match realistic user behavior patterns

---

## Results by Layout

### Perfect Accuracy (100%)

| Layout | Passed | Total | Notes |
|--------|--------|-------|-------|
| product-detail | 8 | 8 | Strong recognition of single-product queries |
| product-comparison | 8 | 8 | "vs", "compare", "best", "which" signals work well |
| support | 8 | 8 | Problem/troubleshooting language detected accurately |
| educational | 8 | 8 | "how to", "tips", "techniques" signals work |
| about-story | 6 | 6 | Brand/company/history queries well-identified |

### Needs Improvement

| Layout | Passed | Total | Accuracy | Primary Issue |
|--------|--------|-------|----------|---------------|
| promotional | 0 | 8 | 0% | All mapped to campaign-landing |
| quick-answer | 1 | 8 | 13% | Mapped to product-detail, support, educational |
| use-case-landing | 5 | 8 | 63% | Mapped to educational, lifestyle |
| lifestyle | 6 | 8 | 75% | Mapped to educational |
| campaign-landing | 5 | 6 | 83% | One mapped to lifestyle |
| category-browse | 7 | 8 | 88% | One mapped to product-detail |
| recipe-collection | 7 | 8 | 88% | One mapped to lifestyle |
| single-recipe | 7 | 8 | 88% | One mapped to recipe-collection |

---

## Confusion Matrix (All Misclassifications)

| Expected → Actual | Count | Example Queries |
|-------------------|-------|-----------------|
| promotional → campaign-landing | 7 | "Black Friday deals", "Vitamix promo codes", "Any sales?" |
| quick-answer → product-detail | 3 | "How many watts?", "Power cord length?", "Dishwasher safe?" |
| use-case-landing → educational | 2 | "Getting started with plant-based diet", "I drink protein shakes daily" |
| quick-answer → support | 2 | "What's the warranty?", "Can I put hot liquids?" |
| lifestyle → educational | 2 | "Tips for plant-based eating", "Benefits of whole food nutrition" |
| promotional → product-comparison | 1 | "Refurbished Vitamix deals" |
| quick-answer → about-story | 1 | "Where is Vitamix made?" |
| quick-answer → educational | 1 | "Can I blend ice?" |
| recipe-collection → lifestyle | 1 | "What desserts can I make?" |
| single-recipe → recipe-collection | 1 | "Acai bowl recipe" |
| use-case-landing → lifestyle | 1 | "Starting a juice cleanse routine" |
| category-browse → product-detail | 1 | "What containers are available?" |
| campaign-landing → lifestyle | 1 | "New Year healthy eating kickstart" |

---

## Detailed Results (All 100 Queries)

### PRODUCT-DETAIL (8/8 = 100%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 1 | Tell me about the A3500 | product-detail | product-detail | ✓ |
| 2 | A3500 features | product-detail | product-detail | ✓ |
| 3 | What's special about the Vitamix A3500? | product-detail | product-detail | ✓ |
| 4 | Vitamix Pro 750 specs | product-detail | product-detail | ✓ |
| 5 | E310 blender details | product-detail | product-detail | ✓ |
| 6 | How powerful is the A2500? | product-detail | product-detail | ✓ |
| 7 | Does the 5200 have variable speed? | product-detail | product-detail | ✓ |
| 8 | A3500 price and features | product-detail | product-detail | ✓ |

### PRODUCT-COMPARISON (8/8 = 100%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 9 | A3500 vs A2500 | product-comparison | product-comparison | ✓ |
| 10 | Compare Explorian E310 and Ascent A2500 | product-comparison | product-comparison | ✓ |
| 11 | Which Vitamix is best for smoothies? | product-comparison | product-comparison | ✓ |
| 12 | Help me choose between Pro 750 and A3500 | product-comparison | product-comparison | ✓ |
| 13 | What's the difference between Ascent and Legacy series? | product-comparison | product-comparison | ✓ |
| 14 | Best Vitamix for a family of 4 | product-comparison | product-comparison | ✓ |
| 15 | Compare all Vitamix models | product-comparison | product-comparison | ✓ |
| 16 | Which blender should I buy? | product-comparison | product-comparison | ✓ |

### RECIPE-COLLECTION (7/8 = 88%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 17 | Green smoothie recipes | recipe-collection | recipe-collection | ✓ |
| 18 | Soup recipes for winter | recipe-collection | recipe-collection | ✓ |
| 19 | Healthy breakfast smoothie ideas | recipe-collection | recipe-collection | ✓ |
| 20 | Vegan recipes I can make in a Vitamix | recipe-collection | recipe-collection | ✓ |
| 21 | What desserts can I make? | recipe-collection | **lifestyle** | ✗ |
| 22 | Show me some nut butter recipes | recipe-collection | recipe-collection | ✓ |
| 23 | Protein shake recipes for muscle building | recipe-collection | recipe-collection | ✓ |
| 24 | Kid-friendly smoothie recipes | recipe-collection | recipe-collection | ✓ |

### SINGLE-RECIPE (7/8 = 88%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 25 | How to make creamy tomato basil soup | single-recipe | single-recipe | ✓ |
| 26 | Recipe for banana ice cream | single-recipe | single-recipe | ✓ |
| 27 | How do I make hummus in a Vitamix? | single-recipe | single-recipe | ✓ |
| 28 | Vitamix green smoothie recipe | single-recipe | single-recipe | ✓ |
| 29 | Almond butter recipe | single-recipe | single-recipe | ✓ |
| 30 | How to make cauliflower soup | single-recipe | single-recipe | ✓ |
| 31 | Acai bowl recipe | single-recipe | **recipe-collection** | ✗ |
| 32 | Make me a chocolate smoothie | single-recipe | single-recipe | ✓ |

### USE-CASE-LANDING (5/8 = 63%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 33 | I want to start making smoothies every morning | use-case-landing | use-case-landing | ✓ |
| 34 | I want to meal prep for the week | use-case-landing | use-case-landing | ✓ |
| 35 | Getting started with whole food plant-based diet | use-case-landing | **educational** | ✗ |
| 36 | I want to make baby food at home | use-case-landing | use-case-landing | ✓ |
| 37 | Starting a juice cleanse routine | use-case-landing | **lifestyle** | ✗ |
| 38 | I drink protein shakes daily for fitness | use-case-landing | **educational** | ✗ |
| 39 | Making fresh soups for my family every week | use-case-landing | use-case-landing | ✓ |
| 40 | I have 4 kids and need quick healthy meals | use-case-landing | use-case-landing | ✓ |

### SUPPORT (8/8 = 100%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 41 | My Vitamix is leaking from the bottom | support | support | ✓ |
| 42 | The motor smells like it's burning | support | support | ✓ |
| 43 | Blender won't turn on | support | support | ✓ |
| 44 | Strange grinding noise when blending | support | support | ✓ |
| 45 | Container is cracked, what do I do? | support | support | ✓ |
| 46 | Help! My Vitamix stopped working | support | support | ✓ |
| 47 | Blade assembly is stuck | support | support | ✓ |
| 48 | Error code on my A3500 display | support | support | ✓ |

### CATEGORY-BROWSE (7/8 = 88%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 49 | Show me all Vitamix blenders | category-browse | category-browse | ✓ |
| 50 | What containers are available? | category-browse | **product-detail** | ✗ |
| 51 | All Vitamix accessories | category-browse | category-browse | ✓ |
| 52 | Browse the Ascent series | category-browse | category-browse | ✓ |
| 53 | What products do you have? | category-browse | category-browse | ✓ |
| 54 | Show me your blender lineup | category-browse | category-browse | ✓ |
| 55 | List all available containers | category-browse | category-browse | ✓ |
| 56 | Vitamix product catalog | category-browse | category-browse | ✓ |

### EDUCATIONAL (8/8 = 100%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 57 | How do I properly clean my Vitamix? | educational | educational | ✓ |
| 58 | What's the best technique for making nut butter? | educational | educational | ✓ |
| 59 | Tips for blending hot soup safely | educational | educational | ✓ |
| 60 | Best speed settings for smoothies | educational | educational | ✓ |
| 61 | How to use the tamper correctly | educational | educational | ✓ |
| 62 | Blending techniques for frozen fruit | educational | educational | ✓ |
| 63 | Guide to Vitamix programs and settings | educational | educational | ✓ |
| 64 | How to get the smoothest texture | educational | educational | ✓ |

### PROMOTIONAL (0/8 = 0%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 65 | Are there any Vitamix sales right now? | promotional | **campaign-landing** | ✗ |
| 66 | Black Friday Vitamix deals | promotional | **campaign-landing** | ✗ |
| 67 | Current discounts on blenders | promotional | **campaign-landing** | ✗ |
| 68 | Vitamix promo codes | promotional | **campaign-landing** | ✗ |
| 69 | Holiday sale on Vitamix | promotional | **campaign-landing** | ✗ |
| 70 | Any special offers available? | promotional | **campaign-landing** | ✗ |
| 71 | Refurbished Vitamix deals | promotional | **product-comparison** | ✗ |
| 72 | When is the next Vitamix sale? | promotional | **campaign-landing** | ✗ |

### QUICK-ANSWER (1/8 = 13%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 73 | What's the Vitamix warranty? | quick-answer | **support** | ✗ |
| 74 | Can I put hot liquids in my Vitamix? | quick-answer | **support** | ✗ |
| 75 | How long is the power cord? | quick-answer | **product-detail** | ✗ |
| 76 | Is the container dishwasher safe? | quick-answer | **product-detail** | ✗ |
| 77 | What's the return policy? | quick-answer | quick-answer | ✓ |
| 78 | How many watts is the A3500? | quick-answer | **product-detail** | ✗ |
| 79 | Where is Vitamix made? | quick-answer | **about-story** | ✗ |
| 80 | Can I blend ice in a Vitamix? | quick-answer | **educational** | ✗ |

### LIFESTYLE (6/8 = 75%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 81 | Tips for plant-based whole food eating | lifestyle | **educational** | ✗ |
| 82 | Healthy living with Vitamix | lifestyle | lifestyle | ✓ |
| 83 | Benefits of whole food nutrition | lifestyle | **educational** | ✗ |
| 84 | How blending fits into a healthy lifestyle | lifestyle | lifestyle | ✓ |
| 85 | Wellness journey with Vitamix | lifestyle | lifestyle | ✓ |
| 86 | Eating clean and healthy | lifestyle | lifestyle | ✓ |
| 87 | Nutrition tips for busy families | lifestyle | lifestyle | ✓ |
| 88 | Living a healthier life through food | lifestyle | lifestyle | ✓ |

### CAMPAIGN-LANDING (5/6 = 83%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 89 | Christmas gift ideas for someone who loves cooking | campaign-landing | campaign-landing | ✓ |
| 90 | Mother's Day gift guide | campaign-landing | campaign-landing | ✓ |
| 91 | Valentine's Day recipes and gifts | campaign-landing | campaign-landing | ✓ |
| 92 | New Year healthy eating kickstart | campaign-landing | **lifestyle** | ✗ |
| 93 | Father's Day blender gifts | campaign-landing | campaign-landing | ✓ |
| 94 | Wedding registry gift ideas | campaign-landing | campaign-landing | ✓ |

### ABOUT-STORY (6/6 = 100%)

| # | Query | Expected | Actual | Status |
|---|-------|----------|--------|--------|
| 95 | When was Vitamix founded? | about-story | about-story | ✓ |
| 96 | What's the Vitamix story? | about-story | about-story | ✓ |
| 97 | History of Vitamix | about-story | about-story | ✓ |
| 98 | Who founded Vitamix? | about-story | about-story | ✓ |
| 99 | Tell me about the Vitamix company | about-story | about-story | ✓ |
| 100 | Vitamix brand values and mission | about-story | about-story | ✓ |

---

## Observations & Recommendations

### Critical Issue #1: Promotional Layout Never Used (0% accuracy)

**Problem:** All promotional queries mapped to `campaign-landing` instead.

**Root Cause Analysis:**
- The prompt provides an example showing "Black Friday Vitamix deals" → campaign-landing
- This directly contradicts the expectation that promotional content should use `promotional` layout
- The LLM learned from the example rather than the layout description

**Recommendation:**
Either:
1. **Merge layouts:** If `promotional` and `campaign-landing` serve similar purposes, consolidate them
2. **Clarify distinction:** Add explicit disambiguation in the prompt:
   ```
   - promotional: General sales, discounts, promo codes, ongoing offers (NOT tied to events)
   - campaign-landing: Event-specific campaigns (holidays, gift guides, seasonal themes)
   ```
3. **Add examples:** Include explicit promotional examples:
   ```
   Query: "Vitamix promo codes"
   → layout_id: "promotional" (general discount, not event-based)

   Query: "Black Friday deals"
   → layout_id: "promotional" (sale event, but focused on discounts)
   ```

### Critical Issue #2: Quick-Answer Poorly Recognized (13% accuracy)

**Problem:** Quick-answer queries systematically mapped to more specific layouts.

**Pattern Analysis:**
| Query Pattern | Mapped To | Why |
|---------------|-----------|-----|
| Product specs ("watts", "cord length") | product-detail | LLM sees product attribute |
| Capability questions ("hot liquids", "ice") | support/educational | LLM sees usage question |
| Policy questions ("warranty", "return") | support | LLM sees customer service topic |
| Origin questions ("where made") | about-story | LLM sees company question |

**Root Cause:**
- `quick-answer` lacks strong signal words in the prompt
- Other layouts have more specific triggers that take precedence
- The prompt says "Simple factual question" but doesn't provide examples

**Recommendation:**
1. **Add signal words:** Define when to use quick-answer:
   ```
   - quick-answer: Direct factual questions with single-answer responses
     - Spec questions: "how many watts", "dimensions", "weight"
     - Yes/No capability: "can I...", "is it...", "does it..."
     - Policy facts: "warranty length", "return window"
     - Avoid: If the answer requires explanation or guidance → use educational/support
   ```

2. **Add decision hierarchy:**
   ```
   For factual questions, choose quick-answer ONLY if:
   - Answer is a single fact (number, yes/no, policy statement)
   - No troubleshooting or how-to explanation needed
   - No product comparison implied
   Otherwise, use the more specific layout.
   ```

3. **Consider if quick-answer is needed:** The model's choices (product-detail for specs, educational for capability questions) may actually be more useful UX patterns.

### Issue #3: Use-Case-Landing vs Educational/Lifestyle (63% accuracy)

**Problem:** Queries about starting routines often mapped to educational or lifestyle.

**Failed Queries:**
- "Getting started with whole food plant-based diet" → educational
- "Starting a juice cleanse routine" → lifestyle
- "I drink protein shakes daily for fitness" → educational

**Pattern:** "Getting started", "starting a routine", or habit descriptions without explicit action words like "I want to" mapped incorrectly.

**Recommendation:**
Add explicit signals:
```
- use-case-landing: User describes or wants to establish a HABIT/ROUTINE
  - Key signals: "every day", "every morning", "weekly", "I want to start", "getting started with"
  - Also: "routine", "habit", "regularly", "meal prep", "daily"
  - NOT just describing a lifestyle interest - must imply ongoing behavior
```

### Issue #4: Lifestyle vs Educational (75% accuracy)

**Problem:** "Tips" and "benefits" queries mapped to educational.

**Failed Queries:**
- "Tips for plant-based whole food eating" → educational
- "Benefits of whole food nutrition" → educational

**Root Cause:** "Tips" is listed as an educational signal in the prompt examples.

**Recommendation:**
Clarify the distinction:
```
- educational: HOW to do something with the BLENDER (techniques, settings, usage)
  - "tips for blending", "how to use", "settings for"
- lifestyle: General wellness/nutrition philosophy (may reference blending but focus is on life approach)
  - "tips for healthy eating", "benefits of nutrition", "wellness philosophy"
```

### Issue #5: Category-Browse Edge Case

**Failed Query:** "What containers are available?" → product-detail

**Analysis:** The phrasing sounds like a single-topic question about containers in general, not a catalog browse request.

**Recommendation:** Minor issue. The model's interpretation is defensible.

### Issue #6: Single-Recipe vs Recipe-Collection

**Failed Query:** "Acai bowl recipe" → recipe-collection

**Analysis:** "Acai bowl" may be interpreted as a category of recipes rather than a single specific recipe.

**Recommendation:** Add clarification:
```
- single-recipe: User wants ONE specific recipe with exact name
  - "tomato soup recipe", "hummus recipe", "banana ice cream recipe"
- recipe-collection: User wants VARIETIES or OPTIONS
  - "acai bowl recipes", "smoothie ideas", "what desserts can I make"
```

---

## Prompt Improvement Summary

### High Priority (Fix accuracy for 0% and 13% layouts)

1. **Promotional vs Campaign-Landing:** Either merge or add explicit disambiguation with examples
2. **Quick-Answer:** Either remove layout or add strong signal words and decision hierarchy

### Medium Priority (Fix 60-75% accuracy layouts)

3. **Use-Case-Landing:** Add more "getting started" and routine signals
4. **Lifestyle vs Educational:** Clarify that lifestyle is about philosophy, educational is about technique

### Low Priority (88% accuracy is acceptable)

5. **Single-Recipe vs Recipe-Collection:** Minor edge case clarification

---

## Test Artifacts

- **Test Runner:** `/tests/run-layout-classification-test.mjs`
- **Raw Output:** `/tests/layout-classification-output.txt`
- **Test Cases:** 100 queries defined in the test runner

---

## Next Steps

1. Update `src/prompts/intent.ts` with recommended changes
2. Re-run test suite to validate improvements
3. Target: ≥85% overall accuracy, with no layout below 50%
