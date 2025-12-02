/**
 * Stress test to reproduce 403/rate limit errors
 *
 * Run with: npx tsx test/stress-test.ts
 *
 * This simulates various scenarios that might trigger Cloudflare/Cerebras blocks:
 * 1. Concurrent requests (multiple users at once)
 * 2. Rapid sequential requests (single user spamming)
 * 3. Burst patterns (realistic usage spikes)
 */

const WORKER_URL = process.env.WORKER_URL || 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';

const TEST_QUERIES = [
  'green smoothie recipes',
  'hot soup recipes for winter',
  'healthy breakfast ideas',
  'vitamix a3500 vs e310',
  'cleaning my vitamix',
  'protein shake recipes',
  'baby food recipes',
  'nut butter how to make',
  'frozen desserts',
  'meal prep smoothies',
];

interface TestResult {
  query: string;
  status: number | 'error';
  duration: number;
  error?: string;
  timestamp: string;
}

async function makeRequest(query: string): Promise<TestResult> {
  const start = Date.now();
  const slug = `stress-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  try {
    // Use the stream endpoint since that's what real users hit
    const url = `${WORKER_URL}/api/stream?slug=${slug}&query=${encodeURIComponent(query)}&images=fal`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'text/event-stream',
      },
    });

    // Just check initial response, don't consume the whole stream
    const status = response.status;

    // Read a bit to see if there's an immediate error
    if (!response.ok) {
      const text = await response.text();
      return {
        query,
        status,
        duration: Date.now() - start,
        error: text.substring(0, 200),
        timestamp: new Date().toISOString(),
      };
    }

    // For SSE, read first few events to check for errors
    const reader = response.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';

      // Read up to 5 chunks or until we see an error/success
      for (let i = 0; i < 5; i++) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Check for error event
        if (buffer.includes('event: error')) {
          reader.cancel();
          const errorMatch = buffer.match(/data: ({.*})/);
          return {
            query,
            status: 'error',
            duration: Date.now() - start,
            error: errorMatch ? errorMatch[1] : 'SSE error event',
            timestamp: new Date().toISOString(),
          };
        }

        // If we see layout or block-content, it's working
        if (buffer.includes('event: layout') || buffer.includes('event: block-content')) {
          reader.cancel();
          return {
            query,
            status: 200,
            duration: Date.now() - start,
            timestamp: new Date().toISOString(),
          };
        }
      }

      reader.cancel();
    }

    return {
      query,
      status,
      duration: Date.now() - start,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      query,
      status: 'error',
      duration: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    };
  }
}

async function runConcurrentTest(concurrency: number): Promise<TestResult[]> {
  console.log(`\n🔄 Running ${concurrency} concurrent requests...`);

  const queries = TEST_QUERIES.slice(0, concurrency);
  const promises = queries.map(q => makeRequest(q));

  const results = await Promise.all(promises);
  return results;
}

async function runRapidSequentialTest(count: number, delayMs: number = 0): Promise<TestResult[]> {
  console.log(`\n⚡ Running ${count} rapid sequential requests (${delayMs}ms delay)...`);

  const results: TestResult[] = [];

  for (let i = 0; i < count; i++) {
    const query = TEST_QUERIES[i % TEST_QUERIES.length];
    const result = await makeRequest(query);
    results.push(result);

    console.log(`  [${i + 1}/${count}] ${result.status} - ${result.duration}ms - ${query.substring(0, 30)}...`);

    if (delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

async function runBurstTest(bursts: number, requestsPerBurst: number, burstDelayMs: number): Promise<TestResult[]> {
  console.log(`\n💥 Running ${bursts} bursts of ${requestsPerBurst} requests (${burstDelayMs}ms between bursts)...`);

  const allResults: TestResult[] = [];

  for (let b = 0; b < bursts; b++) {
    console.log(`  Burst ${b + 1}/${bursts}...`);

    const queries = TEST_QUERIES.slice(0, requestsPerBurst);
    const promises = queries.map(q => makeRequest(q));
    const results = await Promise.all(promises);

    allResults.push(...results);

    const errors = results.filter(r => r.status !== 200);
    console.log(`    ${results.length - errors.length} success, ${errors.length} errors`);

    if (b < bursts - 1) {
      await new Promise(r => setTimeout(r, burstDelayMs));
    }
  }

  return allResults;
}

function summarizeResults(results: TestResult[], testName: string) {
  const total = results.length;
  const successes = results.filter(r => r.status === 200).length;
  const errors = results.filter(r => r.status !== 200);
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / total;

  console.log(`\n📊 ${testName} Results:`);
  console.log(`   Total: ${total}, Success: ${successes}, Errors: ${errors.length}`);
  console.log(`   Success rate: ${((successes / total) * 100).toFixed(1)}%`);
  console.log(`   Avg duration: ${avgDuration.toFixed(0)}ms`);

  if (errors.length > 0) {
    console.log(`\n   ❌ Errors:`);
    const errorsByStatus = new Map<string | number, TestResult[]>();
    errors.forEach(e => {
      const key = e.status;
      if (!errorsByStatus.has(key)) errorsByStatus.set(key, []);
      errorsByStatus.get(key)!.push(e);
    });

    errorsByStatus.forEach((errs, status) => {
      console.log(`      ${status}: ${errs.length} errors`);
      errs.slice(0, 3).forEach(e => {
        console.log(`        - "${e.query.substring(0, 30)}..." ${e.error?.substring(0, 100)}`);
      });
    });
  }

  return { total, successes, errors: errors.length, avgDuration };
}

async function main() {
  console.log('🧪 Cerebras Worker Stress Test');
  console.log(`   Target: ${WORKER_URL}`);
  console.log(`   Time: ${new Date().toISOString()}`);

  const allSummaries: { test: string; results: ReturnType<typeof summarizeResults> }[] = [];

  // Test 1: Low concurrency (baseline)
  const baseline = await runConcurrentTest(2);
  allSummaries.push({ test: 'Baseline (2 concurrent)', results: summarizeResults(baseline, 'Baseline') });

  await new Promise(r => setTimeout(r, 2000));

  // Test 2: Medium concurrency
  const medium = await runConcurrentTest(5);
  allSummaries.push({ test: 'Medium (5 concurrent)', results: summarizeResults(medium, 'Medium Concurrency') });

  await new Promise(r => setTimeout(r, 2000));

  // Test 3: High concurrency (likely to trigger limits)
  const high = await runConcurrentTest(10);
  allSummaries.push({ test: 'High (10 concurrent)', results: summarizeResults(high, 'High Concurrency') });

  await new Promise(r => setTimeout(r, 3000));

  // Test 4: Rapid sequential (no delay)
  const rapid = await runRapidSequentialTest(5, 0);
  allSummaries.push({ test: 'Rapid Sequential (no delay)', results: summarizeResults(rapid, 'Rapid Sequential') });

  await new Promise(r => setTimeout(r, 3000));

  // Test 5: Burst pattern
  const burst = await runBurstTest(3, 3, 1000);
  allSummaries.push({ test: 'Burst (3x3, 1s gap)', results: summarizeResults(burst, 'Burst Pattern') });

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📈 FINAL SUMMARY');
  console.log('='.repeat(60));

  allSummaries.forEach(({ test, results }) => {
    const status = results.errors > 0 ? '❌' : '✅';
    console.log(`${status} ${test}: ${results.successes}/${results.total} success (${((results.successes / results.total) * 100).toFixed(0)}%)`);
  });

  const totalErrors = allSummaries.reduce((sum, s) => sum + s.results.errors, 0);
  if (totalErrors > 0) {
    console.log(`\n⚠️  Total errors across all tests: ${totalErrors}`);
    console.log('   Check /api/dashboard/errors for details');
  } else {
    console.log('\n✅ All tests passed - no errors triggered');
  }
}

main().catch(console.error);
