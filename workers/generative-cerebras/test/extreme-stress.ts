/**
 * Extreme stress test - try harder to trigger 403s
 *
 * Run with: npx tsx test/extreme-stress.ts
 */

const WORKER_URL = process.env.WORKER_URL || 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';

async function makeRequest(id: number): Promise<{ id: number; status: number | string; duration: number; error?: string }> {
  const start = Date.now();
  const query = `test query ${id} ${Date.now()}`;
  const slug = `extreme-${Date.now()}-${id}`;

  try {
    const url = `${WORKER_URL}/api/stream?slug=${slug}&query=${encodeURIComponent(query)}&images=fal`;
    const response = await fetch(url, { headers: { 'Accept': 'text/event-stream' } });

    if (!response.ok) {
      const text = await response.text();
      return { id, status: response.status, duration: Date.now() - start, error: text.substring(0, 100) };
    }

    // Read first chunk
    const reader = response.body?.getReader();
    if (reader) {
      const { value } = await reader.read();
      reader.cancel();
      const text = new TextDecoder().decode(value);
      if (text.includes('error')) {
        return { id, status: 'sse-error', duration: Date.now() - start, error: text.substring(0, 100) };
      }
    }

    return { id, status: response.status, duration: Date.now() - start };
  } catch (err) {
    return { id, status: 'fetch-error', duration: Date.now() - start, error: String(err).substring(0, 100) };
  }
}

async function main() {
  console.log('🔥 EXTREME Stress Test');
  console.log(`Target: ${WORKER_URL}\n`);

  // Test: 20 concurrent requests
  console.log('Test 1: 20 concurrent requests...');
  const test1 = await Promise.all(Array.from({ length: 20 }, (_, i) => makeRequest(i)));
  const errors1 = test1.filter(r => r.status !== 200);
  console.log(`  Results: ${test1.length - errors1.length}/20 success, ${errors1.length} errors`);
  if (errors1.length > 0) {
    errors1.slice(0, 5).forEach(e => console.log(`    ❌ ${e.status}: ${e.error}`));
  }

  await new Promise(r => setTimeout(r, 5000));

  // Test: 30 concurrent requests
  console.log('\nTest 2: 30 concurrent requests...');
  const test2 = await Promise.all(Array.from({ length: 30 }, (_, i) => makeRequest(i)));
  const errors2 = test2.filter(r => r.status !== 200);
  console.log(`  Results: ${test2.length - errors2.length}/30 success, ${errors2.length} errors`);
  if (errors2.length > 0) {
    errors2.slice(0, 5).forEach(e => console.log(`    ❌ ${e.status}: ${e.error}`));
  }

  await new Promise(r => setTimeout(r, 5000));

  // Test: Sustained load - 50 requests over 10 seconds
  console.log('\nTest 3: Sustained load (50 requests, staggered over 10s)...');
  const test3Results: typeof test1 = [];
  const test3Start = Date.now();

  for (let i = 0; i < 50; i++) {
    // Start a new request every 200ms
    makeRequest(i).then(r => test3Results.push(r));
    await new Promise(r => setTimeout(r, 200));
  }

  // Wait for all to complete
  await new Promise(r => setTimeout(r, 10000));
  const errors3 = test3Results.filter(r => r.status !== 200);
  console.log(`  Results: ${test3Results.length - errors3.length}/${test3Results.length} success, ${errors3.length} errors`);
  if (errors3.length > 0) {
    errors3.slice(0, 5).forEach(e => console.log(`    ❌ ${e.status}: ${e.error}`));
  }

  // Summary
  const totalErrors = errors1.length + errors2.length + errors3.length;
  console.log('\n' + '='.repeat(50));
  if (totalErrors > 0) {
    console.log(`⚠️  Triggered ${totalErrors} errors - check /api/dashboard/errors`);
  } else {
    console.log('✅ No errors triggered even under extreme load');
    console.log('\nConclusion: The Adobe user\'s 403 is likely caused by:');
    console.log('  1. Corporate network/proxy blocking or modifying requests');
    console.log('  2. IP reputation issues (shared corporate IP)');
    console.log('  3. Cloudflare bot detection based on browser fingerprint');
    console.log('\nNext steps:');
    console.log('  - Ask user to try from mobile hotspot (different network)');
    console.log('  - Check if user is on VPN and try without');
    console.log('  - Have user try different browser (incognito mode)');
  }
}

main().catch(console.error);
