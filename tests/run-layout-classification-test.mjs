/**
 * Layout Classification Test Runner
 *
 * Calls the deployed worker's /api/classify-batch endpoint to test
 * 100 queries across all 13 layout types.
 *
 * Usage: node tests/run-layout-classification-test.mjs
 */

const WORKER_URL = 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';

/**
 * 100 Test Cases across all 13 layouts
 */
const TEST_CASES = [
  // === PRODUCT-DETAIL (8 queries) ===
  { query: "Tell me about the A3500", expected: "product-detail" },
  { query: "A3500 features", expected: "product-detail" },
  { query: "What's special about the Vitamix A3500?", expected: "product-detail" },
  { query: "Vitamix Pro 750 specs", expected: "product-detail" },
  { query: "E310 blender details", expected: "product-detail" },
  { query: "How powerful is the A2500?", expected: "product-detail" },
  { query: "Does the 5200 have variable speed?", expected: "product-detail" },
  { query: "A3500 price and features", expected: "product-detail" },

  // === PRODUCT-COMPARISON (8 queries) ===
  { query: "A3500 vs A2500", expected: "product-comparison" },
  { query: "Compare Explorian E310 and Ascent A2500", expected: "product-comparison" },
  { query: "Which Vitamix is best for smoothies?", expected: "product-comparison" },
  { query: "Help me choose between Pro 750 and A3500", expected: "product-comparison" },
  { query: "What's the difference between Ascent and Legacy series?", expected: "product-comparison" },
  { query: "Best Vitamix for a family of 4", expected: "product-comparison" },
  { query: "Compare all Vitamix models", expected: "product-comparison" },
  { query: "Which blender should I buy?", expected: "product-comparison" },

  // === RECIPE-COLLECTION (8 queries) ===
  { query: "Green smoothie recipes", expected: "recipe-collection" },
  { query: "Soup recipes for winter", expected: "recipe-collection" },
  { query: "Healthy breakfast smoothie ideas", expected: "recipe-collection" },
  { query: "Vegan recipes I can make in a Vitamix", expected: "recipe-collection" },
  { query: "What desserts can I make?", expected: "recipe-collection" },
  { query: "Show me some nut butter recipes", expected: "recipe-collection" },
  { query: "Protein shake recipes for muscle building", expected: "recipe-collection" },
  { query: "Kid-friendly smoothie recipes", expected: "recipe-collection" },

  // === SINGLE-RECIPE (8 queries) ===
  { query: "How to make creamy tomato basil soup", expected: "single-recipe" },
  { query: "Recipe for banana ice cream", expected: "single-recipe" },
  { query: "How do I make hummus in a Vitamix?", expected: "single-recipe" },
  { query: "Vitamix green smoothie recipe", expected: "single-recipe" },
  { query: "Almond butter recipe", expected: "single-recipe" },
  { query: "How to make cauliflower soup", expected: "single-recipe" },
  { query: "Acai bowl recipe", expected: "single-recipe" },
  { query: "Make me a chocolate smoothie", expected: "single-recipe" },

  // === USE-CASE-LANDING (8 queries) ===
  { query: "I want to start making smoothies every morning", expected: "use-case-landing" },
  { query: "I want to meal prep for the week", expected: "use-case-landing" },
  { query: "Getting started with whole food plant-based diet", expected: "use-case-landing" },
  { query: "I want to make baby food at home", expected: "use-case-landing" },
  { query: "Starting a juice cleanse routine", expected: "use-case-landing" },
  { query: "I drink protein shakes daily for fitness", expected: "use-case-landing" },
  { query: "Making fresh soups for my family every week", expected: "use-case-landing" },
  { query: "I have 4 kids and need quick healthy meals", expected: "use-case-landing" },

  // === SUPPORT (8 queries) ===
  { query: "My Vitamix is leaking from the bottom", expected: "support" },
  { query: "The motor smells like it's burning", expected: "support" },
  { query: "Blender won't turn on", expected: "support" },
  { query: "Strange grinding noise when blending", expected: "support" },
  { query: "Container is cracked, what do I do?", expected: "support" },
  { query: "Help! My Vitamix stopped working", expected: "support" },
  { query: "Blade assembly is stuck", expected: "support" },
  { query: "Error code on my A3500 display", expected: "support" },

  // === CATEGORY-BROWSE (8 queries) ===
  { query: "Show me all Vitamix blenders", expected: "category-browse" },
  { query: "What containers are available?", expected: "category-browse" },
  { query: "All Vitamix accessories", expected: "category-browse" },
  { query: "Browse the Ascent series", expected: "category-browse" },
  { query: "What products do you have?", expected: "category-browse" },
  { query: "Show me your blender lineup", expected: "category-browse" },
  { query: "List all available containers", expected: "category-browse" },
  { query: "Vitamix product catalog", expected: "category-browse" },

  // === EDUCATIONAL (8 queries) ===
  { query: "How do I properly clean my Vitamix?", expected: "educational" },
  { query: "What's the best technique for making nut butter?", expected: "educational" },
  { query: "Tips for blending hot soup safely", expected: "educational" },
  { query: "Best speed settings for smoothies", expected: "educational" },
  { query: "How to use the tamper correctly", expected: "educational" },
  { query: "Blending techniques for frozen fruit", expected: "educational" },
  { query: "Guide to Vitamix programs and settings", expected: "educational" },
  { query: "How to get the smoothest texture", expected: "educational" },

  // === PROMOTIONAL (8 queries) ===
  { query: "Are there any Vitamix sales right now?", expected: "promotional" },
  { query: "Black Friday Vitamix deals", expected: "promotional" },
  { query: "Current discounts on blenders", expected: "promotional" },
  { query: "Vitamix promo codes", expected: "promotional" },
  { query: "Holiday sale on Vitamix", expected: "promotional" },
  { query: "Any special offers available?", expected: "promotional" },
  { query: "Refurbished Vitamix deals", expected: "promotional" },
  { query: "When is the next Vitamix sale?", expected: "promotional" },

  // === QUICK-ANSWER (8 queries) ===
  { query: "What's the Vitamix warranty?", expected: "quick-answer" },
  { query: "Can I put hot liquids in my Vitamix?", expected: "quick-answer" },
  { query: "How long is the power cord?", expected: "quick-answer" },
  { query: "Is the container dishwasher safe?", expected: "quick-answer" },
  { query: "What's the return policy?", expected: "quick-answer" },
  { query: "How many watts is the A3500?", expected: "quick-answer" },
  { query: "Where is Vitamix made?", expected: "quick-answer" },
  { query: "Can I blend ice in a Vitamix?", expected: "quick-answer" },

  // === LIFESTYLE (8 queries) ===
  { query: "Tips for plant-based whole food eating", expected: "lifestyle" },
  { query: "Healthy living with Vitamix", expected: "lifestyle" },
  { query: "Benefits of whole food nutrition", expected: "lifestyle" },
  { query: "How blending fits into a healthy lifestyle", expected: "lifestyle" },
  { query: "Wellness journey with Vitamix", expected: "lifestyle" },
  { query: "Eating clean and healthy", expected: "lifestyle" },
  { query: "Nutrition tips for busy families", expected: "lifestyle" },
  { query: "Living a healthier life through food", expected: "lifestyle" },

  // === CAMPAIGN-LANDING (6 queries) ===
  { query: "Christmas gift ideas for someone who loves cooking", expected: "campaign-landing" },
  { query: "Mother's Day gift guide", expected: "campaign-landing" },
  { query: "Valentine's Day recipes and gifts", expected: "campaign-landing" },
  { query: "New Year healthy eating kickstart", expected: "campaign-landing" },
  { query: "Father's Day blender gifts", expected: "campaign-landing" },
  { query: "Wedding registry gift ideas", expected: "campaign-landing" },

  // === ABOUT-STORY (6 queries) ===
  { query: "When was Vitamix founded?", expected: "about-story" },
  { query: "What's the Vitamix story?", expected: "about-story" },
  { query: "History of Vitamix", expected: "about-story" },
  { query: "Who founded Vitamix?", expected: "about-story" },
  { query: "Tell me about the Vitamix company", expected: "about-story" },
  { query: "Vitamix brand values and mission", expected: "about-story" },
];

async function runTest() {
  console.log('='.repeat(80));
  console.log('LAYOUT CLASSIFICATION DIRECT TEST (100 queries)');
  console.log('='.repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Worker: ${WORKER_URL}`);
  console.log(`Endpoint: /api/classify-batch`);
  console.log(`Test Cases: ${TEST_CASES.length}`);
  console.log('='.repeat(80));
  console.log('');
  console.log('Running batch classification...');
  console.log('');

  const startTime = Date.now();

  try {
    const response = await fetch(`${WORKER_URL}/api/classify-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries: TEST_CASES }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const elapsed = Date.now() - startTime;

    // Print results
    console.log('INDIVIDUAL RESULTS:');
    console.log('-'.repeat(80));
    for (const r of result.results) {
      const status = r.passed ? '✓' : '✗';
      const shortQuery = r.query.length > 42 ? r.query.substring(0, 39) + '...' : r.query;
      console.log(`[${r.index.toString().padStart(3)}] ${status} ${shortQuery.padEnd(42)} | Exp: ${r.expected.padEnd(18)} | Act: ${r.actual}`);
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total: ${result.summary.total}`);
    console.log(`Passed: ${result.summary.passed}`);
    console.log(`Failed: ${result.summary.failed} (${result.summary.errors} errors)`);
    console.log(`Accuracy: ${result.summary.accuracy}`);
    console.log(`Total Time: ${elapsed}ms (${(elapsed / result.summary.total).toFixed(0)}ms/query avg)`);
    console.log('');

    console.log('BY LAYOUT:');
    const sortedLayouts = Object.entries(result.byLayout).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [layout, stats] of sortedLayouts) {
      const pct = ((stats.passed / stats.total) * 100).toFixed(0);
      const status = stats.passed === stats.total ? '✓' : '✗';
      console.log(`  ${status} ${layout.padEnd(20)} ${stats.passed}/${stats.total} (${pct}%)`);
    }

    console.log('');
    console.log('CONFUSION MATRIX (misclassifications):');
    const sortedConfusion = Object.entries(result.confusionMatrix).sort((a, b) => b[1] - a[1]);
    if (sortedConfusion.length === 0) {
      console.log('  (none)');
    } else {
      for (const [pattern, count] of sortedConfusion) {
        console.log(`  ${pattern}: ${count}`);
      }
    }

    // Return the result for saving
    return {
      ...result,
      metadata: {
        ...result.metadata,
        totalElapsed: elapsed,
        workerUrl: WORKER_URL,
      },
    };
  } catch (error) {
    console.error('Test failed:', error.message);
    throw error;
  }
}

// Run and save results
runTest()
  .then(result => {
    console.log('');
    console.log('='.repeat(80));
    console.log('Test complete. JSON output follows:');
    console.log('JSON_START');
    console.log(JSON.stringify(result, null, 2));
    console.log('JSON_END');
  })
  .catch(err => {
    process.exit(1);
  });
