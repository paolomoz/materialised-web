# RAG Quality Testing

This document describes the on-demand RAG quality testing endpoint that validates the RAG improvements.

## Endpoint

```
GET /api/rag-quality
```

### Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `test` | Run specific test by ID or improvement number | `?test=filter-vegan` or `?test=#2` |
| `verbose` | Include full chunk details in response | `?verbose=true` |

## Usage

### Run All Tests

```bash
# Local development
curl http://localhost:8787/api/rag-quality

# Production
curl https://your-worker.workers.dev/api/rag-quality
```

### Run Specific Test

```bash
# By test ID
curl http://localhost:8787/api/rag-quality?test=filter-vegan

# By improvement number
curl http://localhost:8787/api/rag-quality?test=#2

# With verbose output
curl http://localhost:8787/api/rag-quality?test=filter-vegan&verbose=true
```

## Test Cases

### Improvement #1: Positive Boosting

| ID | Name | What it tests |
|----|------|---------------|
| `boost-available` | Boost by available ingredients | Recipes with user's available ingredients rank higher |
| `boost-mustuse` | Boost by must-use ingredients | Recipes with must-use ingredients rank higher |

### Improvement #2: Dietary Filtering

| ID | Name | What it tests |
|----|------|---------------|
| `filter-vegan` | Vegan preference filters meat/dairy | No meat, dairy, eggs, or honey in results |
| `filter-keto` | Keto preference filters high-carb | No bread, pasta, rice, or sugar in results |
| `filter-avoid` | Explicit avoid terms filtered | Explicitly avoided terms not in results |

### Improvement #3: Query Augmentation

| ID | Name | What it tests |
|----|------|---------------|
| `augment-diabetes` | Diabetes condition augments query | Query includes "low sugar", "diabetic friendly" |
| `augment-quick` | Quick constraint augments query | Query includes "quick", "fast", "easy" |

### Improvement #4: Cuisine Boosting

| ID | Name | What it tests |
|----|------|---------------|
| `boost-cuisine` | Cuisine preference boosts results | Thai/Asian recipes rank higher when preference set |

## Response Format

```json
{
  "summary": {
    "total": 8,
    "passed": 7,
    "failed": 1,
    "passRate": "87%",
    "timestamp": "2024-12-02T10:30:00.000Z"
  },
  "byImprovement": {
    "#1 Positive Boosting": [...],
    "#2 Dietary Filtering": [...],
    "#3 Query Augmentation": [...],
    "#4 Cuisine Boosting": [...]
  },
  "results": [
    {
      "id": "filter-vegan",
      "name": "Vegan preference filters meat/dairy",
      "improvement": "#2 Dietary Filtering",
      "passed": true,
      "details": {
        "query": "smoothie recipe",
        "totalResults": 5,
        "violations": [],
        "boostHits": [],
        "topResults": [...]  // Only with ?verbose=true
      }
    }
  ]
}
```

### Result Details

- **violations**: Terms that should have been filtered but weren't
  ```json
  { "type": "unwanted_term", "term": "milk", "foundIn": "Creamy Berry Smoothie" }
  ```

- **boostHits**: How well boosted terms appear in results
  ```json
  { "term": "banana", "foundInTop": 3, "positions": [1, 2, 4] }
  ```

- **topResults** (verbose only): The actual chunks returned
  ```json
  { "title": "Green Smoothie", "score": 0.892, "snippet": "..." }
  ```

## Interpreting Results

### Pass Criteria

1. **Filtering tests**: Pass if no violations (unwanted terms found)
2. **Boosting tests**: Pass if at least one boosted term appears in top 5 results

### Common Failure Patterns

| Pattern | Meaning | Action |
|---------|---------|--------|
| Violations in filtering test | Unwanted content not filtered | Check `filterByUserContext` logic |
| Zero boostHits in boosting test | Preferred content not ranking | Check `boostByTerms` logic |
| Low positions array | Content exists but ranked poorly | Boost factor may need adjustment |

## Adding New Tests

Add new test cases to `handleRAGQualityCheck` in `src/index.ts`:

```typescript
{
  id: 'my-new-test',
  name: 'Description of what this tests',
  improvement: '#2 Dietary Filtering',
  query: 'the search query',
  userContext: {
    dietary: {
      avoid: [],
      preferences: ['vegetarian'],
    },
  },
  expectations: {
    mustNotContain: ['chicken', 'beef'],  // Should be filtered
    shouldBoost: ['tofu', 'tempeh'],      // Should rank higher
  },
}
```

## Viewing Logs

When tests run, detailed logs are output to the console:

```
[RAG] Query augmented: { original: 'smoothie', augmented: 'smoothie low sugar diabetic friendly' }
[RAG] Boosting by available/mustUse ingredients: ['banana', 'spinach']
[RAG] Expanding "vegan" preference to avoid: ['chicken', 'beef', ...]
[RAG] Filtered out chunk "Honey Yogurt Parfait" - contains "yogurt"
```

### Viewing Logs

```bash
# Local development - logs appear in terminal
npx wrangler dev

# Production - stream logs
npx wrangler tail generative-cerebras
```

## Continuous Monitoring

For ongoing quality tracking, consider:

1. **Scheduled tests**: Use Cloudflare Cron Triggers to run tests periodically
2. **Alerting**: Push results to external monitoring (Datadog, PagerDuty)
3. **Historical tracking**: Store results in KV or D1 for trend analysis

Example cron setup in `wrangler.toml`:

```toml
[triggers]
crons = ["0 */6 * * *"]  # Every 6 hours
```

Then handle in worker:

```typescript
async scheduled(event: ScheduledEvent, env: Env) {
  const results = await runRAGQualityTests(env);
  if (results.summary.failed > 0) {
    // Alert or log
  }
}
```
