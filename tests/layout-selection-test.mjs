/**
 * Layout Selection Accuracy Test
 *
 * Tests the intent classification system by submitting queries
 * and verifying the selected layout matches expectations.
 *
 * Strategy:
 * 1. Create page via /api/create-page (returns path)
 * 2. Connect to SSE stream for that page
 * 3. Capture the "layout" event which contains layoutId
 * 4. Compare actual vs expected
 */

const WORKER_URL = 'https://materialised-web.paolomoz.workers.dev';

const TEST_CASES = [
  { query: "What's special about the Vitamix A3500?", expected: "product-detail" },
  { query: "Explorian E310 vs Ascent A2500", expected: "product-comparison" },
  { query: "Help me choose between the Venturist and Ascent series", expected: "product-comparison" },
  { query: "I'm looking for keto smoothie recipes", expected: "recipe-collection" },
  { query: "What can I make with frozen berries and spinach?", expected: "recipe-collection" },
  { query: "I want to start making fresh soups for my family every week", expected: "use-case-landing" },
  { query: "Best blender for making baby food at home", expected: "use-case-landing" },
  { query: "My Vitamix is leaking from the bottom", expected: "support" },
  { query: "The motor smells like it's burning", expected: "support" },
  { query: "Show me all Vitamix containers", expected: "category-browse" },
  { query: "What accessories work with the Ascent series?", expected: "category-browse" },
  { query: "How do I properly clean my blender container?", expected: "educational" },
  { query: "What's the best technique for making nut butter?", expected: "educational" },
  { query: "Are there any Vitamix sales right now?", expected: "promotional" },
  { query: "What's the Vitamix warranty?", expected: "quick-answer" },
  { query: "Can I put hot liquids in my Vitamix?", expected: "quick-answer" },
  { query: "Tips for plant-based whole food eating", expected: "lifestyle" },
  { query: "How to make creamy tomato basil soup", expected: "single-recipe" },
  { query: "Christmas gift ideas for someone who loves cooking", expected: "campaign-landing" },
  { query: "When was Vitamix founded and what's their story?", expected: "about-story" },
];

/**
 * Connect to SSE stream and capture layout event
 */
async function captureLayoutFromStream(path, query) {
  const slug = path.split('/').pop();
  const streamUrl = `${WORKER_URL}/api/stream?slug=${encodeURIComponent(slug)}&query=${encodeURIComponent(query)}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for layout event (30s)'));
    }, 30000);

    // Use fetch with streaming for SSE
    fetch(streamUrl, {
      headers: { 'Accept': 'text/event-stream' },
    })
      .then(async (response) => {
        if (!response.ok) {
          clearTimeout(timeout);
          reject(new Error(`Stream HTTP ${response.status}`));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line

          for (const line of lines) {
            if (line.startsWith('event: layout')) {
              // Next line should be data
              continue;
            }
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                // Check if this is the layout event
                if (data.layoutId || data.layout_id || data.blocks) {
                  clearTimeout(timeout);
                  reader.cancel();
                  resolve({
                    layoutId: data.layoutId || data.layout_id,
                    blocks: data.blocks,
                  });
                  return;
                }
              } catch (e) {
                // Not JSON or not layout event
              }
            }
          }
        }

        clearTimeout(timeout);
        reject(new Error('Stream ended without layout event'));
      })
      .catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
  });
}

/**
 * Test a single query
 */
async function testQuery(query, expected, index) {
  const startTime = Date.now();

  try {
    // Step 1: Create page
    const createResponse = await fetch(`${WORKER_URL}/api/create-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      return {
        index: index + 1,
        query,
        expected,
        actual: 'ERROR',
        passed: false,
        elapsed: Date.now() - startTime,
        error: `Create failed: HTTP ${createResponse.status}`,
      };
    }

    const createResult = await createResponse.json();
    const path = createResult.path;

    // Step 2: Connect to stream and capture layout
    const streamResult = await captureLayoutFromStream(path, query);
    const elapsed = Date.now() - startTime;

    const actualLayout = streamResult.layoutId;
    const passed = actualLayout === expected;

    return {
      index: index + 1,
      query,
      expected,
      actual: actualLayout,
      path,
      blocks: streamResult.blocks?.map(b => b.type || b.blockType) || [],
      passed,
      elapsed,
    };
  } catch (error) {
    return {
      index: index + 1,
      query,
      expected,
      actual: 'ERROR',
      passed: false,
      elapsed: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('='.repeat(80));
  console.log('LAYOUT SELECTION ACCURACY TEST');
  console.log('='.repeat(80));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Worker: ${WORKER_URL}`);
  console.log(`Test Cases: ${TEST_CASES.length}`);
  console.log('='.repeat(80));
  console.log('');

  const results = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const { query, expected } = TEST_CASES[i];
    const shortQuery = query.length > 50 ? query.substring(0, 47) + '...' : query;
    console.log(`[${i + 1}/${TEST_CASES.length}] Testing: "${shortQuery}"`);

    const result = await testQuery(query, expected, i);
    results.push(result);

    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status} | Expected: ${expected} | Actual: ${result.actual} | ${result.elapsed}ms`);
    if (result.blocks?.length) {
      console.log(`  Blocks: ${result.blocks.join(', ')}`);
    }
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    console.log('');

    // Delay between tests to avoid overwhelming the API
    await new Promise(r => setTimeout(r, 1000));
  }

  // Calculate summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const errors = results.filter(r => r.actual === 'ERROR').length;
  const accuracy = ((passed / results.length) * 100).toFixed(1);

  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed} (${errors} errors)`);
  console.log(`Accuracy: ${accuracy}%`);
  console.log('');

  // List failures
  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach(r => {
      console.log(`  [${r.index}] "${r.query}"`);
      console.log(`       Expected: ${r.expected}, Got: ${r.actual}`);
      if (r.error) console.log(`       Error: ${r.error}`);
    });
    console.log('');
  }

  // By layout breakdown
  console.log('BY EXPECTED LAYOUT:');
  const byExpected = {};
  results.forEach(r => {
    if (!byExpected[r.expected]) {
      byExpected[r.expected] = { total: 0, passed: 0 };
    }
    byExpected[r.expected].total++;
    if (r.passed) byExpected[r.expected].passed++;
  });

  Object.entries(byExpected)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([layout, stats]) => {
      const pct = ((stats.passed / stats.total) * 100).toFixed(0);
      const status = stats.passed === stats.total ? '✓' : '✗';
      console.log(`  ${status} ${layout}: ${stats.passed}/${stats.total} (${pct}%)`);
    });

  // Build output object
  const output = {
    timestamp: new Date().toISOString(),
    worker: WORKER_URL,
    summary: {
      total: results.length,
      passed,
      failed,
      errors,
      accuracy: `${accuracy}%`,
    },
    byLayout: byExpected,
    results: results.map(r => ({
      index: r.index,
      query: r.query,
      expected: r.expected,
      actual: r.actual,
      passed: r.passed,
      elapsed: r.elapsed,
      error: r.error,
    })),
  };

  // Output results
  console.log('');
  console.log('='.repeat(80));
  console.log('JSON OUTPUT');
  console.log('='.repeat(80));
  console.log(JSON.stringify(output, null, 2));

  return output;
}

// Run
runTests().catch(console.error);
