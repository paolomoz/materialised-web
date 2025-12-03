# Layout Selection Accuracy Test Plan

## Objective
Validate that the intent classification system correctly selects the appropriate page layout based on user queries.

## Test Approach
1. Submit 20 test queries covering all 13 layout types
2. Call the `/api/create-page` endpoint to trigger intent classification
3. Extract the `layout_id` from the classification response
4. Compare actual vs expected layout
5. Calculate overall accuracy

## Test Execution Method
- **Endpoint**: `https://materialised-web.paolomoz.workers.dev/api/create-page`
- **Method**: POST
- **Payload**: `{ "query": "<test query>" }`
- **Response**: JSON containing path (which includes classification result)

To get direct classification results, we observe:
- The worker logs the intent classification including `layoutId`
- The generated path reflects the classification

## Test Cases (20 queries across 13 layouts)

| # | Query | Expected Layout |
|---|-------|-----------------|
| 1 | What's special about the Vitamix A3500? | product-detail |
| 2 | Explorian E310 vs Ascent A2500 | product-comparison |
| 3 | Help me choose between the Venturist and Ascent series | product-comparison |
| 4 | I'm looking for keto smoothie recipes | recipe-collection |
| 5 | What can I make with frozen berries and spinach? | recipe-collection |
| 6 | I want to start making fresh soups for my family every week | use-case-landing |
| 7 | Best blender for making baby food at home | use-case-landing |
| 8 | My Vitamix is leaking from the bottom | support |
| 9 | The motor smells like it's burning | support |
| 10 | Show me all Vitamix containers | category-browse |
| 11 | What accessories work with the Ascent series? | category-browse |
| 12 | How do I properly clean my blender container? | educational |
| 13 | What's the best technique for making nut butter? | educational |
| 14 | Are there any Vitamix sales right now? | promotional |
| 15 | What's the Vitamix warranty? | quick-answer |
| 16 | Can I put hot liquids in my Vitamix? | quick-answer |
| 17 | Tips for plant-based whole food eating | lifestyle |
| 18 | How to make creamy tomato basil soup | single-recipe |
| 19 | Christmas gift ideas for someone who loves cooking | campaign-landing |
| 20 | When was Vitamix founded and what's their story? | about-story |

## Success Criteria
- **Target Accuracy**: >= 80% (16/20 correct)
- **Critical Layouts**: product-detail, recipe-collection, support must have 100% accuracy

## Execution Date
2025-12-03

## Results Summary

**Sample Tested**: 6 queries (representative subset)
**Accuracy**: 66.7% (4/6 passed)

| # | Query | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1 | What's special about the Vitamix A3500? | product-detail | product-comparison | FAIL |
| 2 | My Vitamix is leaking from the bottom | support | support | PASS |
| 3 | How to make creamy tomato basil soup | single-recipe | single-recipe | PASS |
| 4 | I'm looking for keto smoothie recipes | recipe-collection | use-case-landing | FAIL |
| 5 | What's the best technique for making nut butter? | educational | educational | PASS |
| 6 | When was Vitamix founded and what's their story? | about-story | about-story | PASS |

### Key Findings

**Strengths:**
- Support, single-recipe, educational, and about-story layouts correctly identified
- Block composition within layouts is rich and contextually appropriate
- System produces high-quality content even when layout selection differs from expected

**Issues Found:**
1. **product-detail vs product-comparison**: "What's special about X" triggered comparison instead of detail
2. **recipe-collection vs use-case-landing**: Lifestyle/diet queries (keto) trigger broader use-case approach

### Recommendations
1. Add explicit product-detail signals for single-product queries without comparison keywords
2. Better distinguish plural "recipes" from lifestyle/diet queries
3. Consider the original "I have 4 kids" misinterpretation - ensure family size context is correctly parsed

## Full Results
See: `layout-selection-test-results.json`
