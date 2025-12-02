# RAG Improvement Opportunities

This document outlines potential improvements to the RAG (Retrieval-Augmented Generation) system in the generative-cerebras worker.

## Current State (as of Dec 2024)

### What's Implemented
- **Smart retrieval strategies** - Different strategies for catalog, ingredient, filtered, comprehensive, semantic queries
- **Term boosting** - Ingredient-based boosting for recipe searches (15% per match, max 60%)
- **Post-retrieval filtering** - Filters out chunks containing `userContext.dietary.avoid` terms
- **Allergen expansion** - "nuts" expands to almond, walnut, cashew, etc.
- **Deduplication** - By SKU, URL, or similarity
- **Token limiting** - Fits within context window (2500 tokens max)

### Known Limitations
- Vectorize metadata filtering is **disabled** (metadata mismatch issue)
- No positive filtering for dietary preferences (vegan, keto)
- No time-based filtering (quick recipes)
- No cuisine/cultural boosting
- Pure semantic search (no keyword/hybrid)

---

## Improvement Opportunities

### 1. Positive Boosting from userContext

**Priority:** High | **Effort:** Low | **Re-index:** No

Currently we boost by query ingredients, but not by `userContext.available` or `userContext.mustUse`.

```typescript
// In rag.ts, after boostByTerms for plan.boostTerms:

// Boost by ingredients user has on hand
if (userContext?.available?.length || userContext?.mustUse?.length) {
  const ingredientBoostTerms = [
    ...(userContext.available || []),
    ...(userContext.mustUse || []),
  ];
  chunks = boostByTerms(chunks, ingredientBoostTerms);
}
```

**Benefit:** "I have ripe bananas" → recipes with bananas ranked higher.

---

### 2. Dietary Preference Filtering

**Priority:** High | **Effort:** Low | **Re-index:** No

Extend `filterByUserContext` to handle positive preferences, not just avoidances.

```typescript
// Add to filterByUserContext in rag.ts

const preferenceFilters: Record<string, string[]> = {
  'vegan': ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp',
            'milk', 'cream', 'cheese', 'butter', 'yogurt', 'egg', 'honey'],
  'vegetarian': ['chicken', 'beef', 'pork', 'fish', 'salmon', 'tuna', 'shrimp'],
  'keto': ['sugar', 'flour', 'bread', 'pasta', 'rice', 'potato', 'corn'],
  'paleo': ['grain', 'wheat', 'rice', 'bread', 'pasta', 'legume', 'bean', 'dairy'],
};

// If user has dietary preferences, add those avoid terms
for (const pref of userContext.dietary?.preferences || []) {
  if (preferenceFilters[pref.toLowerCase()]) {
    avoidTerms.push(...preferenceFilters[pref.toLowerCase()]);
  }
}
```

**Benefit:** "vegan smoothie" → automatically filters out dairy/meat recipes at RAG level.

---

### 3. Query Augmentation for Context

**Priority:** Medium | **Effort:** Low | **Re-index:** No

Inject context signals into the semantic query before embedding.

```typescript
// New function in rag.ts

function augmentQueryWithContext(query: string, userContext?: UserContext): string {
  if (!userContext) return query;

  const augments: string[] = [];

  // Health conditions
  if (userContext.health?.conditions?.includes('diabetes')) {
    augments.push('low sugar', 'diabetic friendly', 'no added sugar');
  }
  if (userContext.health?.conditions?.includes('heart-health')) {
    augments.push('low sodium', 'heart healthy');
  }

  // Dietary preferences
  if (userContext.dietary?.preferences?.includes('vegan')) {
    augments.push('vegan', 'plant-based');
  }
  if (userContext.dietary?.preferences?.includes('keto')) {
    augments.push('keto', 'low carb');
  }

  // Constraints
  if (userContext.constraints?.includes('quick')) {
    augments.push('quick', 'fast', 'easy', '5 minute');
  }

  // Fitness
  if (userContext.fitnessContext?.includes('post-workout')) {
    augments.push('high protein', 'recovery');
  }
  if (userContext.fitnessContext?.includes('pre-workout')) {
    augments.push('energy', 'light');
  }

  return augments.length > 0 ? `${query} ${augments.join(' ')}` : query;
}

// Use in smartRetrieve:
const augmentedQuery = augmentQueryWithContext(plan.semanticQuery, userContext);
const queryEmbedding = await generateQueryEmbedding(augmentedQuery, env);
```

**Benefit:** Embedding search is context-aware, not just filtering after the fact.

---

### 4. Cuisine/Cultural Boosting

**Priority:** Low | **Effort:** Low | **Re-index:** No

Boost chunks that match user's cuisine preferences.

```typescript
// In smartRetrieve, after existing boosts:

if (userContext?.cultural?.cuisine?.length) {
  chunks = boostByTerms(chunks, userContext.cultural.cuisine);
}
if (userContext?.cultural?.regional?.length) {
  chunks = boostByTerms(chunks, userContext.cultural.regional);
}
```

**Benefit:** "Thai curry" with `cultural.cuisine: ["thai"]` → Thai recipes ranked higher.

---

### 5. Time-Based Filtering

**Priority:** Medium | **Effort:** Medium | **Re-index:** Yes

Filter recipes by prep time when user wants "quick" recipes.

**Step 1:** Add to chunk metadata during indexing (crawler):
```typescript
// In chunker.ts, when creating recipe chunks:
metadata.recipe_prep_time_mins = extractPrepTime(recipe); // e.g., 15
metadata.recipe_total_time_mins = extractTotalTime(recipe); // e.g., 30
```

**Step 2:** Filter in rag.ts:
```typescript
if (userContext?.constraints?.includes('quick')) {
  chunks = chunks.filter(chunk => {
    const prepTime = chunk.metadata.recipe_prep_time_mins;
    return !prepTime || prepTime <= 15; // 15 min or less, or unknown
  });
}
```

**Benefit:** "Quick breakfast" → only fast recipes in RAG context.

---

### 6. Fix Vectorize Metadata Filtering

**Priority:** High | **Effort:** Medium | **Re-index:** Maybe

Currently disabled in `buildMetadataFilter()` with comment: "Vectorize filter not matching indexed metadata."

**Investigation needed:**
1. Check what metadata is actually indexed (log `results.matches[0].metadata`)
2. Compare with filter syntax (`{ content_type: { $in: ['recipe'] } }`)
3. Verify field names match exactly (case-sensitive?)
4. Test with simple filters first

**If fixed, enables:**
```typescript
// Filter at Vectorize level - much faster
const filter = {
  content_type: { $eq: 'recipe' },
};
const results = await env.VECTORIZE.query(embedding, { topK: 20, filter });
```

**Benefit:** Faster retrieval, less post-processing.

---

### 7. Hybrid Search: Semantic + Keyword

**Priority:** High | **Effort:** High | **Re-index:** Yes (new index)

Combine semantic similarity with keyword matching for better recall.

**Architecture:**
```
Query: "butternut squash soup"
         ↓
    ┌────┴────┐
    ▼         ▼
Semantic    Keyword
(Vectorize) (New BM25 index)
    ▼         ▼
  Top 20    Top 20
    └────┬────┘
         ▼
  Reciprocal Rank Fusion
         ▼
    Combined Top 10
```

**Implementation options:**
1. Use Cloudflare D1 with FTS5 for keyword search
2. Use external service (Algolia, Typesense)
3. Build simple inverted index in KV

**Benefit:** Catches exact matches that semantic search might miss.

---

### 8. Cross-Encoder Re-Ranking

**Priority:** Medium | **Effort:** Medium | **Re-index:** No

Use a more powerful model to re-rank top candidates.

```typescript
// After initial retrieval:
const candidates = chunks.slice(0, 30); // Top 30 from bi-encoder

// Re-rank with cross-encoder (sees query + doc together)
const reranked = await rerankWithCrossEncoder(query, candidates, env);
// Could use: @cf/reranker or external API

const finalChunks = reranked.slice(0, 10);
```

**Benefit:** More accurate relevance scoring for final results.

---

### 9. Freshness Decay

**Priority:** Low | **Effort:** Low | **Re-index:** No (uses existing metadata)

Boost newer content, decay older content.

```typescript
// In processResultsWithThreshold:
const now = Date.now();
const chunk = {
  ...baseChunk,
  score: baseChunk.score * calculateFreshnessBoost(chunk.metadata.indexed_at, now),
};

function calculateFreshnessBoost(indexedAt: string, now: number): number {
  const age = now - new Date(indexedAt).getTime();
  const daysOld = age / (1000 * 60 * 60 * 24);
  // 1.0 for fresh, decays to 0.8 over 90 days
  return Math.max(0.8, 1 - (daysOld / 450));
}
```

**Benefit:** Prefer recently updated content.

---

## Implementation Priority

| # | Improvement | Impact | Effort | Dependencies |
|---|-------------|--------|--------|--------------|
| 1 | Positive boosting (available/mustUse) | Medium | Low | None |
| 2 | Dietary preference filtering | High | Low | None |
| 3 | Query augmentation | Medium | Low | None |
| 4 | Cuisine boosting | Low | Low | None |
| 5 | Fix Vectorize metadata | High | Medium | Investigation |
| 6 | Time-based filtering | Medium | Medium | Re-index |
| 7 | Hybrid search | High | High | New index |
| 8 | Cross-encoder re-ranking | Medium | Medium | Model access |
| 9 | Freshness decay | Low | Low | None |

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 8 → 7 → 9

---

## Implementation Status

| # | Improvement | Status | Date |
|---|-------------|--------|------|
| 1 | Positive boosting (available/mustUse) | ✅ Done | Dec 2024 |
| 2 | Dietary preference filtering | ✅ Done | Dec 2024 |
| 3 | Query augmentation | ✅ Done | Dec 2024 |
| 4 | Cuisine boosting | ✅ Done | Dec 2024 |
| 5 | Time-based filtering | ⏳ Pending | - |
| 6 | Fix Vectorize metadata | ⏳ Pending | - |
| 7 | Hybrid search | ⏳ Pending | - |
| 8 | Cross-encoder re-ranking | ⏳ Pending | - |
| 9 | Freshness decay | ✅ Done | Dec 2024 |
| 10 | Semantic query caching | ✅ Done | Dec 2024 |
| 11 | Negative boosting | ✅ Done | Dec 2024 |
| 12 | Result diversity | ✅ Done | Dec 2024 |
| 13 | Session-aware RAG | ⏳ Pending | - |
| 14 | Confidence-based fallbacks | ✅ Done | Dec 2024 |

---

## Additional Improvement Ideas

### 10. Freshness Decay (Ready to Implement)

**Priority:** Low | **Effort:** Low | **Re-index:** No

Boost newer content, decay older content based on `indexed_at` metadata.

```typescript
function calculateFreshnessBoost(indexedAt: string, now: number): number {
  const age = now - new Date(indexedAt).getTime();
  const daysOld = age / (1000 * 60 * 60 * 24);
  // 1.0 for fresh, decays to 0.8 over 90 days
  return Math.max(0.8, 1 - (daysOld / 450));
}

// In processResultsWithThreshold:
const freshnessBoost = calculateFreshnessBoost(chunk.metadata.indexed_at, Date.now());
chunk.score *= freshnessBoost;
```

**Benefit:** Prefer recently updated recipes/content.

---

### 11. Semantic Query Caching

**Priority:** Medium | **Effort:** Low | **Re-index:** No

Cache query embeddings in KV to avoid recomputing for common queries.

```typescript
async function getCachedEmbedding(query: string, env: Env): Promise<number[]> {
  const cacheKey = `embed:${simpleHash(query.toLowerCase())}`;

  // Check cache first
  const cached = await env.CACHE.get(cacheKey, 'json');
  if (cached) return cached as number[];

  // Generate and cache
  const embedding = await generateQueryEmbedding(query, env);
  await env.CACHE.put(cacheKey, JSON.stringify(embedding), { expirationTtl: 86400 });

  return embedding;
}
```

**Benefit:** Faster responses for repeated queries, lower AI costs.

---

### 12. Negative Boosting (Conflict Penalization)

**Priority:** Medium | **Effort:** Low | **Re-index:** No

Penalize chunks that contain terms conflicting with user intent.

```typescript
const conflictingTerms: Record<string, string[]> = {
  'quick': ['overnight', 'slow-cooked', 'marinate for hours', '24 hours'],
  'simple': ['advanced', 'chef-level', 'complex', 'intricate'],
  'beginner': ['expert', 'professional', 'master chef'],
  'healthy': ['indulgent', 'decadent', 'rich', 'fried'],
};

function penalizeConflicts(chunks: RAGChunk[], userContext: UserContext): RAGChunk[] {
  const conflicts: string[] = [];

  if (userContext.constraints?.includes('quick')) {
    conflicts.push(...conflictingTerms['quick']);
  }
  if (userContext.constraints?.includes('simple')) {
    conflicts.push(...conflictingTerms['simple']);
  }

  return chunks.map(chunk => {
    const text = chunk.text.toLowerCase();
    const hasConflict = conflicts.some(term => text.includes(term));
    return hasConflict
      ? { ...chunk, score: chunk.score * 0.7 }  // 30% penalty
      : chunk;
  });
}
```

**Benefit:** Reduce false positives where content semantically matches but contradicts intent.

---

### 13. Result Diversity Enforcement

**Priority:** Low | **Effort:** Low | **Re-index:** No

Ensure top results aren't all from the same source or category.

```typescript
function ensureDiversity(chunks: RAGChunk[], maxPerSource: number = 2): RAGChunk[] {
  const sourceCounts = new Map<string, number>();
  const diverse: RAGChunk[] = [];

  for (const chunk of chunks) {
    const source = chunk.metadata.source_url;
    const count = sourceCounts.get(source) || 0;

    if (count < maxPerSource) {
      diverse.push(chunk);
      sourceCounts.set(source, count + 1);
    }
  }

  return diverse;
}

// Also consider category diversity:
function ensureCategoryDiversity(chunks: RAGChunk[], maxPerCategory: number = 3): RAGChunk[] {
  const categoryCounts = new Map<string, number>();

  return chunks.filter(chunk => {
    const category = chunk.metadata.recipe_category || 'other';
    const count = categoryCounts.get(category) || 0;

    if (count < maxPerCategory) {
      categoryCounts.set(category, count + 1);
      return true;
    }
    return false;
  });
}
```

**Benefit:** Better variety in results, not all smoothies or all from one recipe page.

---

### 14. Session-Aware RAG

**Priority:** Medium | **Effort:** Medium | **Re-index:** No

Use previous queries from the session to inform retrieval.

```typescript
function buildSessionContext(previousQueries: QueryHistoryEntry[]): string[] {
  const contextTerms: string[] = [];

  // Extract ingredients mentioned in session
  for (const entry of previousQueries.slice(-3)) {  // Last 3 queries
    contextTerms.push(...entry.entities.ingredients);
  }

  // Extract recurring themes
  const allGoals = previousQueries.flatMap(q => q.entities.goals);
  const frequentGoals = findFrequent(allGoals, 2);  // Mentioned 2+ times
  contextTerms.push(...frequentGoals);

  return [...new Set(contextTerms)];
}

// In smartRetrieve:
if (sessionContext?.previousQueries?.length) {
  const sessionTerms = buildSessionContext(sessionContext.previousQueries);
  chunks = boostByTerms(chunks, sessionTerms);
}
```

**Benefit:** "Now show me breakfast options" remembers you were looking at vegan recipes.

---

### 15. Confidence-Based Fallbacks

**Priority:** Low | **Effort:** Low | **Re-index:** No

When RAG results are low-confidence, adjust behavior.

```typescript
function assessResultQuality(chunks: RAGChunk[]): 'high' | 'medium' | 'low' {
  if (chunks.length === 0) return 'low';

  const avgScore = chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length;
  const topScore = chunks[0]?.score || 0;

  if (topScore > 0.85 && avgScore > 0.75) return 'high';
  if (topScore > 0.70 && avgScore > 0.60) return 'medium';
  return 'low';
}

// In orchestrator:
const quality = assessResultQuality(context.chunks);

if (quality === 'low') {
  // Expand search or inform user
  console.log('[RAG] Low confidence results, expanding search...');
  // Could: broaden query, remove filters, or signal to LLM to be more creative
}
```

**Benefit:** Graceful degradation when RAG doesn't have good matches.

---

## Updated Priority Table

| # | Improvement | Impact | Effort | Status |
|---|-------------|--------|--------|--------|
| 1 | Positive boosting (available/mustUse) | Medium | Low | ✅ Done |
| 2 | Dietary preference filtering | High | Low | ✅ Done |
| 3 | Query augmentation | Medium | Low | ✅ Done |
| 4 | Cuisine boosting | Low | Low | ✅ Done |
| 5 | Time-based filtering | Medium | Medium | ⏳ Needs re-index |
| 6 | Fix Vectorize metadata | High | Medium | ⏳ Investigation |
| 7 | Hybrid search | High | High | ⏳ New index |
| 8 | Cross-encoder re-ranking | Medium | Medium | ⏳ Model access |
| 9 | Freshness decay | Low | Low | ✅ Done |
| 10 | Semantic query caching | Medium | Low | ✅ Done |
| 11 | Negative boosting | Medium | Low | ✅ Done |
| 12 | Result diversity | Low | Low | ✅ Done |
| 13 | Session-aware RAG | Medium | Medium | ⏳ Ready |
| 14 | Confidence fallbacks | Low | Low | ✅ Done |

**Next recommended:** 6 → 5 → 13 → 8 → 7

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/rag.ts` | Main RAG logic, filtering, boosting |
| `src/lib/retrieval-planner.ts` | Strategy selection, query planning |
| `src/types.ts` | Add new metadata fields if needed |
| `../crawler/src/chunker.ts` | Add metadata during indexing |
| `../crawler/src/extractor.ts` | Extract additional data from HTML |

---

## Testing

### Automated Testing Endpoint

Use the RAG quality check endpoint for on-demand validation:

```bash
# Run all tests
curl http://localhost:8787/api/rag-quality

# Run specific test
curl http://localhost:8787/api/rag-quality?test=filter-vegan

# Verbose output with chunk details
curl http://localhost:8787/api/rag-quality?verbose=true
```

See [RAG_QUALITY_TESTING.md](./RAG_QUALITY_TESTING.md) for full documentation.

### Manual Test Queries

Test queries for validation:
1. `I can't eat carrots, soup recipes` → No carrot recipes in RAG
2. `Vegan smoothie` → No dairy/meat in RAG (after #2)
3. `I have ripe bananas` → Banana recipes boosted (after #1)
4. `Quick breakfast for diabetics` → Fast, low-sugar content (after #3, #5)
5. `Thai curry halal` → Thai + halal compliant (after #4, #2)
