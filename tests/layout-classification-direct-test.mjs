/**
 * Direct Layout Classification Test
 *
 * Tests the intent classification component directly by calling Cerebras API
 * without going through the full page generation flow.
 *
 * Usage: CEREBRAS_API_KEY=xxx node tests/layout-classification-direct-test.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the intent classification prompt from the source
const intentPromptPath = join(__dirname, '../workers/generative-cerebras/src/prompts/intent.ts');
const intentPromptFile = readFileSync(intentPromptPath, 'utf-8');

// Extract the prompt string (between backticks after INTENT_CLASSIFICATION_PROMPT =)
const promptMatch = intentPromptFile.match(/export const INTENT_CLASSIFICATION_PROMPT = `([\s\S]*?)`;/);
if (!promptMatch) {
  console.error('Could not extract INTENT_CLASSIFICATION_PROMPT from intent.ts');
  process.exit(1);
}
const INTENT_CLASSIFICATION_PROMPT = promptMatch[1];

// Cerebras API configuration (same as production)
const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODEL = 'llama3.1-8b';
const CEREBRAS_TEMPERATURE = 0.3;
const CEREBRAS_MAX_TOKENS = 500;

/**
 * 100 Test Cases across all 13 layouts
 * Distribution: ~7-8 queries per layout for balanced coverage
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

/**
 * Call Cerebras API directly
 */
async function callCerebras(query) {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) {
    throw new Error('CEREBRAS_API_KEY environment variable required');
  }

  const messages = [
    {
      role: 'system',
      content: 'You are a query classifier for Vitamix. Respond only with valid JSON.',
    },
    {
      role: 'user',
      content: `${INTENT_CLASSIFICATION_PROMPT}\n\nUser Query: "${query}"`,
    },
  ];

  const response = await fetch(CEREBRAS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CEREBRAS_MODEL,
      messages,
      max_tokens: CEREBRAS_MAX_TOKENS,
      temperature: CEREBRAS_TEMPERATURE,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cerebras API error ${response.status}: ${errorText.substring(0, 200)}`);
  }

  const result = await response.json();
  return result.choices[0].message.content;
}

/**
 * Parse the classification response
 */
function parseClassification(response) {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { layoutId: 'PARSE_ERROR', raw: response };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      layoutId: parsed.layout_id || 'MISSING',
      intentType: parsed.intent_type || 'unknown',
      confidence: parsed.confidence || 0,
      entities: parsed.entities || {},
    };
  } catch (e) {
    return { layoutId: 'PARSE_ERROR', error: e.message, raw: response };
  }
}

/**
 * Run a single test
 */
async function runTest(testCase, index, total) {
  const { query, expected } = testCase;
  const startTime = Date.now();

  try {
    const response = await callCerebras(query);
    const classification = parseClassification(response);
    const elapsed = Date.now() - startTime;

    const actual = classification.layoutId;
    const passed = actual === expected;

    return {
      index: index + 1,
      query,
      expected,
      actual,
      passed,
      intentType: classification.intentType,
      confidence: classification.confidence,
      elapsed,
    };
  } catch (error) {
    return {
      index: index + 1,
      query,
      expected,
      actual: 'ERROR',
      passed: false,
      error: error.message,
      elapsed: Date.now() - startTime,
    };
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('='.repeat(80));
  console.log('DIRECT LAYOUT CLASSIFICATION TEST');
  console.log('='.repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Model: ${CEREBRAS_MODEL}`);
  console.log(`Temperature: ${CEREBRAS_TEMPERATURE}`);
  console.log(`Test Cases: ${TEST_CASES.length}`);
  console.log('='.repeat(80));
  console.log('');

  const results = [];
  const batchSize = 5; // Run 5 concurrent requests

  for (let i = 0; i < TEST_CASES.length; i += batchSize) {
    const batch = TEST_CASES.slice(i, i + batchSize);
    const batchPromises = batch.map((tc, j) => runTest(tc, i + j, TEST_CASES.length));
    const batchResults = await Promise.all(batchPromises);

    for (const result of batchResults) {
      results.push(result);
      const status = result.passed ? '✓' : '✗';
      const shortQuery = result.query.length > 45 ? result.query.substring(0, 42) + '...' : result.query;
      console.log(`[${result.index.toString().padStart(3)}] ${status} ${shortQuery.padEnd(45)} | Expected: ${result.expected.padEnd(18)} | Actual: ${result.actual}`);
    }

    // Small delay between batches
    if (i + batchSize < TEST_CASES.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Calculate statistics
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const errors = results.filter(r => r.actual === 'ERROR').length;
  const accuracy = ((passed / results.length) * 100).toFixed(1);

  // Group by expected layout
  const byLayout = {};
  for (const r of results) {
    if (!byLayout[r.expected]) {
      byLayout[r.expected] = { total: 0, passed: 0, failures: [] };
    }
    byLayout[r.expected].total++;
    if (r.passed) {
      byLayout[r.expected].passed++;
    } else {
      byLayout[r.expected].failures.push({
        query: r.query,
        actual: r.actual,
      });
    }
  }

  // Confusion matrix - what did each layout get misclassified as?
  const confusionMatrix = {};
  for (const r of results) {
    if (!r.passed && r.actual !== 'ERROR') {
      const key = `${r.expected} → ${r.actual}`;
      confusionMatrix[key] = (confusionMatrix[key] || 0) + 1;
    }
  }

  // Print summary
  console.log('');
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed} (${errors} errors)`);
  console.log(`Accuracy: ${accuracy}%`);
  console.log('');

  console.log('BY LAYOUT:');
  const sortedLayouts = Object.entries(byLayout).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [layout, stats] of sortedLayouts) {
    const pct = ((stats.passed / stats.total) * 100).toFixed(0);
    const status = stats.passed === stats.total ? '✓' : '✗';
    console.log(`  ${status} ${layout.padEnd(20)} ${stats.passed}/${stats.total} (${pct}%)`);
  }

  console.log('');
  console.log('CONFUSION MATRIX (misclassifications):');
  const sortedConfusion = Object.entries(confusionMatrix).sort((a, b) => b[1] - a[1]);
  for (const [pattern, count] of sortedConfusion) {
    console.log(`  ${pattern}: ${count}`);
  }

  // Build output object
  const output = {
    metadata: {
      timestamp: new Date().toISOString(),
      model: CEREBRAS_MODEL,
      temperature: CEREBRAS_TEMPERATURE,
      totalQueries: TEST_CASES.length,
    },
    summary: {
      total: results.length,
      passed,
      failed,
      errors,
      accuracy: `${accuracy}%`,
    },
    byLayout: Object.fromEntries(
      sortedLayouts.map(([layout, stats]) => [
        layout,
        {
          total: stats.total,
          passed: stats.passed,
          accuracy: `${((stats.passed / stats.total) * 100).toFixed(0)}%`,
          failures: stats.failures,
        },
      ])
    ),
    confusionMatrix,
    results: results.map(r => ({
      index: r.index,
      query: r.query,
      expected: r.expected,
      actual: r.actual,
      passed: r.passed,
      intentType: r.intentType,
      confidence: r.confidence,
      error: r.error,
    })),
  };

  // Output JSON
  console.log('');
  console.log('='.repeat(80));
  console.log('JSON_OUTPUT_START');
  console.log(JSON.stringify(output, null, 2));
  console.log('JSON_OUTPUT_END');

  return output;
}

// Run tests
runAllTests().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
