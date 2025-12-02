/**
 * Context Scenario Test Harness
 *
 * Tests session context handling across different query flows.
 * Run with: npx tsx test/context-scenarios.ts
 *
 * These tests verify that session context is properly maintained
 * and applied to subsequent queries.
 */

const WORKER_URL = process.env.WORKER_URL || 'https://vitamix-generative-cerebras.paolo-moz.workers.dev';

interface TestScenario {
  name: string;
  queries: string[];
  expectedPatterns: {
    query: string;
    titleShouldContain?: string[];
    titleShouldNotContain?: string[];
    layoutShouldBe?: string;
  }[];
}

const SCENARIOS: TestScenario[] = [
  // ===========================================
  // BIDIRECTIONAL CONTEXT TESTS
  // ===========================================
  {
    name: 'Bidirectional: Baby food → Soups = Baby-friendly soups',
    queries: [
      'recommended settings for making baby food',
      'creamy soups',
    ],
    expectedPatterns: [
      { query: 'creamy soups', titleShouldContain: ['baby', 'Baby'] },
    ],
  },
  {
    name: 'Bidirectional: Meal prep → Smoothies = Batch smoothies',
    queries: [
      'meal prep ideas for the week',
      'smoothie recipes',
    ],
    expectedPatterns: [
      { query: 'smoothie recipes', titleShouldContain: ['batch', 'prep', 'make-ahead', 'Meal', 'meal'] },
    ],
  },

  // ===========================================
  // CROSS-INTENT CONTEXT TESTS
  // ===========================================
  {
    name: 'Cross-intent: Tropical fruits → Blender = Blender for tropical',
    queries: [
      'I love tropical fruits',
      'any smoothie recipes?',
      'what is the best blender for me?',
    ],
    expectedPatterns: [
      { query: 'any smoothie recipes?', titleShouldContain: ['tropical', 'Tropical'] },
      { query: 'what is the best blender for me?', titleShouldContain: ['smoothie', 'Smoothie', 'tropical', 'Tropical'] },
    ],
  },
  {
    name: 'Cross-intent: Soups → Compare blenders = Blenders for soups',
    queries: [
      'ideas for all time creamy soups',
      'compare 2 of the line blenders',
    ],
    expectedPatterns: [
      { query: 'compare 2 of the line blenders', titleShouldContain: ['soup', 'Soup', 'creamy', 'Creamy'] },
    ],
  },

  // ===========================================
  // SAME-INTENT CONTEXT TESTS
  // ===========================================
  {
    name: 'Same-intent: Smoothies → Walnuts = Walnut smoothies',
    queries: [
      'I love smoothies',
      'any recipe with walnuts?',
    ],
    expectedPatterns: [
      { query: 'any recipe with walnuts?', titleShouldContain: ['smoothie', 'Smoothie'] },
    ],
  },
  {
    name: 'Same-intent: Green smoothies → Blueberry = Blueberry smoothie',
    queries: [
      'green smoothie recipes',
      'anything blueberry?',
    ],
    expectedPatterns: [
      { query: 'anything blueberry?', titleShouldContain: ['smoothie', 'Smoothie'] },
    ],
  },

  // ===========================================
  // ACCUMULATION TESTS (3+ queries)
  // ===========================================
  {
    name: 'Accumulation: Soups → Blenders → Baby food = References both',
    queries: [
      'creamy soup recipes',
      'compare 2 blenders',
      'recommended settings for making baby food',
    ],
    expectedPatterns: [
      { query: 'recommended settings for making baby food', layoutShouldBe: 'educational' },
      // Note: Harder to test content accumulation in title, but the content should reference soups/blenders
    ],
  },

  // ===========================================
  // LAYOUT SELECTION TESTS
  // ===========================================
  {
    name: 'Layout: Settings query → Educational layout',
    queries: [
      'best settings for baby food',
    ],
    expectedPatterns: [
      { query: 'best settings for baby food', layoutShouldBe: 'educational' },
    ],
  },
  {
    name: 'Layout: Tips query → Educational layout',
    queries: [
      'tips for making hot soup',
    ],
    expectedPatterns: [
      { query: 'tips for making hot soup', layoutShouldBe: 'educational' },
    ],
  },

  // ===========================================
  // CONTEXT RESET TESTS
  // ===========================================
  {
    name: 'Reset: "Actually" breaks context',
    queries: [
      'smoothie recipes',
      'actually, tell me about soups instead',
    ],
    expectedPatterns: [
      { query: 'actually, tell me about soups instead', titleShouldNotContain: ['smoothie', 'Smoothie'] },
    ],
  },
];

interface StreamEvent {
  type: string;
  data?: any;
}

async function runQuery(query: string, sessionContext?: object): Promise<{ title: string; layout: string }> {
  const slug = `test-${Date.now()}`;
  const contextParam = sessionContext
    ? `&ctx=${encodeURIComponent(JSON.stringify(sessionContext))}`
    : '';

  const url = `${WORKER_URL}/api/stream?slug=${slug}&query=${encodeURIComponent(query)}&images=none${contextParam}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const text = await response.text();
  const events: StreamEvent[] = [];

  // Parse SSE events
  const lines = text.split('\n');
  let currentEvent: Partial<StreamEvent> = {};

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent.type = line.substring(7);
    } else if (line.startsWith('data: ')) {
      try {
        currentEvent.data = JSON.parse(line.substring(6));
      } catch {
        currentEvent.data = line.substring(6);
      }
      if (currentEvent.type) {
        events.push(currentEvent as StreamEvent);
        currentEvent = {};
      }
    }
  }

  // Find title and layout from events
  let title = '';
  let layout = '';

  for (const event of events) {
    if (event.type === 'layout' && event.data?.template?.id) {
      layout = event.data.template.id;
    }
    if (event.type === 'headline' && event.data?.headline) {
      title = event.data.headline;
    }
    if (event.type === 'generation-complete' && event.data?.title) {
      title = event.data.title;
    }
  }

  return { title, layout };
}

interface SessionContext {
  previousQueries: Array<{
    query: string;
    intent: string;
    entities: {
      products: string[];
      ingredients: string[];
      goals: string[];
    };
  }>;
}

async function runScenario(scenario: TestScenario): Promise<{ passed: boolean; details: string[] }> {
  const details: string[] = [];
  let passed = true;

  const sessionContext: SessionContext = { previousQueries: [] };

  for (let i = 0; i < scenario.queries.length; i++) {
    const query = scenario.queries[i];

    try {
      const result = await runQuery(
        query,
        sessionContext.previousQueries.length > 0 ? sessionContext : undefined
      );

      details.push(`  Query ${i + 1}: "${query}"`);
      details.push(`    → Title: "${result.title}"`);
      details.push(`    → Layout: ${result.layout}`);

      // Check expectations for this query
      const expectation = scenario.expectedPatterns.find(e => e.query === query);
      if (expectation) {
        if (expectation.titleShouldContain) {
          const containsAny = expectation.titleShouldContain.some(p =>
            result.title.toLowerCase().includes(p.toLowerCase())
          );
          if (!containsAny) {
            passed = false;
            details.push(`    ❌ FAIL: Title should contain one of: ${expectation.titleShouldContain.join(', ')}`);
          } else {
            details.push(`    ✓ Title contains expected pattern`);
          }
        }

        if (expectation.titleShouldNotContain) {
          const containsNone = !expectation.titleShouldNotContain.some(p =>
            result.title.toLowerCase().includes(p.toLowerCase())
          );
          if (!containsNone) {
            passed = false;
            details.push(`    ❌ FAIL: Title should NOT contain: ${expectation.titleShouldNotContain.join(', ')}`);
          } else {
            details.push(`    ✓ Title does not contain excluded patterns`);
          }
        }

        if (expectation.layoutShouldBe && result.layout !== expectation.layoutShouldBe) {
          passed = false;
          details.push(`    ❌ FAIL: Layout should be "${expectation.layoutShouldBe}", got "${result.layout}"`);
        } else if (expectation.layoutShouldBe) {
          details.push(`    ✓ Layout is correct: ${result.layout}`);
        }
      }

      // Add to session context for next query
      sessionContext.previousQueries.push({
        query,
        intent: 'general', // Simplified for testing
        entities: { products: [], ingredients: [], goals: [query] },
      });

    } catch (error) {
      passed = false;
      details.push(`  Query ${i + 1}: "${query}"`);
      details.push(`    ❌ ERROR: ${error}`);
    }
  }

  return { passed, details };
}

async function main() {
  console.log('='.repeat(60));
  console.log('Context Scenario Test Harness');
  console.log(`Testing against: ${WORKER_URL}`);
  console.log('='.repeat(60));
  console.log('');

  let passedCount = 0;
  let failedCount = 0;

  for (const scenario of SCENARIOS) {
    console.log(`\n📋 ${scenario.name}`);
    console.log('-'.repeat(50));

    const result = await runScenario(scenario);

    for (const line of result.details) {
      console.log(line);
    }

    if (result.passed) {
      console.log(`\n✅ PASSED`);
      passedCount++;
    } else {
      console.log(`\n❌ FAILED`);
      failedCount++;
    }

    // Small delay between scenarios
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('='.repeat(60));

  process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(console.error);
