# Content Generation Performance Optimization

Created: 2025-11-30
Status: Planning

## Current Performance Profile

### Timing Breakdown (Typical Request)

| Stage | Duration | Notes |
|-------|----------|-------|
| Intent Classification | ~1-2 sec | Haiku, ~500 tokens output |
| RAG Retrieval | ~0.5 sec | Vectorize query |
| **Content Generation** | **~15-25 sec** | **Sonnet, ~2000+ tokens** |
| Image Generation | ~5-10 sec | Parallel, after content |
| **Total** | **~20-35 sec** | User sees nothing until complete |

### Why Content Generation is Slow

1. **Output Token Count** (Biggest Factor)
   - Claude generates tokens sequentially at ~50-100 tokens/second
   - Current flow generates ALL blocks in one JSON response
   - 6-block layout with detailed content = 2000+ tokens = ~20-30 seconds

2. **Model Choice**
   - Currently using `claude-sonnet-4-5-20250929` for quality
   - Haiku would be ~3x faster but lower quality

3. **Input Size**
   - Large system prompt (~500 lines of block schemas)
   - RAG context (variable, can be 1000+ tokens)
   - Layout template specification

4. **No Streaming**
   - We wait for complete response before streaming blocks
   - Claude's streaming API is available but not used

## Optimization Options to Evaluate

### Option 1: Use Haiku for Entire Flow

**Approach**: Replace Sonnet with Haiku for content generation.

**Expected Impact**:
- Content generation: ~15-25 sec → ~5-8 sec
- Total time: ~20-35 sec → ~10-15 sec

**Trade-offs**:
- Lower content quality (less nuanced, may miss brand voice subtleties)
- May not follow complex layout templates as precisely
- Simpler language, less creative headlines

**Implementation**: Single line change in `claude.ts`:
```typescript
// In generateContent()
model: 'claude-haiku-4-5-20251001',  // was: claude-sonnet-4-5-20250929
```

**Evaluation Criteria**:
- [ ] Brand voice compliance score
- [ ] Layout template adherence
- [ ] Content quality (subjective review)
- [ ] Time to complete

---

### Option 2: Reduce Blocks to 3 Per Page

**Approach**: Simplify layout templates to max 3 blocks per page.

**Current Layout Examples**:
- Lifestyle: Hero + Cards + Columns + Split + Tips + CTA (6 blocks)
- Recipe Collection: Hero + Search + FilterBar + Grid + Technique + CTA (6 blocks)

**Proposed Simplified Layouts**:
- Lifestyle-lite: Hero + Cards + CTA (3 blocks)
- Recipe-lite: Hero + Grid + CTA (3 blocks)
- Support-lite: SupportHero + Steps + CTA (3 blocks)

**Expected Impact**:
- Output tokens: ~2000 → ~1000 (50% reduction)
- Content generation: ~15-25 sec → ~8-12 sec
- Total time: ~20-35 sec → ~12-20 sec

**Trade-offs**:
- Less rich content experience
- Fewer features per page (no filtering, no tips, etc.)
- May feel incomplete for complex queries

**Implementation**:
- Create new `*-lite` layout templates in `layouts.ts`
- Add layout selection logic based on query complexity or user preference

**Evaluation Criteria**:
- [ ] User satisfaction (does 3 blocks feel "enough"?)
- [ ] Query coverage (can 3 blocks answer most queries?)
- [ ] Time savings actual vs theoretical

---

### Option 3: Two-Phase Generation (Hero First, Then Rest)

**Approach**: Split content generation into two sequential LLM calls:

1. **Phase 1**: Generate hero block + page context (fast, ~3-5 sec)
2. **Phase 2**: Generate remaining blocks with hero context (streams as ready)

**Architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                     PHASE 1 (Fast Path)                     │
├─────────────────────────────────────────────────────────────┤
│ Input:                                                      │
│   - User query                                              │
│   - RAG context                                             │
│   - Intent classification                                   │
│   - Layout template (full)                                  │
│                                                             │
│ Output:                                                     │
│   - Page headline & subheadline                             │
│   - Page theme/tone (for consistency)                       │
│   - Hero block content (complete)                           │
│   - Meta (title, description)                               │
│                                                             │
│ Tokens: ~400-600                                            │
│ Time: ~3-5 seconds                                          │
│                                                             │
│ → STREAM HERO TO CLIENT IMMEDIATELY                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 2 (Remaining)                      │
├─────────────────────────────────────────────────────────────┤
│ Input:                                                      │
│   - Everything from Phase 1 input                           │
│   - PLUS: Phase 1 output (hero content, theme, headline)    │
│   - Layout template (remaining blocks only)                 │
│                                                             │
│ Output:                                                     │
│   - Remaining blocks (aware of hero content)                │
│   - Citations                                               │
│                                                             │
│ Tokens: ~1400-1600                                          │
│ Time: ~12-18 seconds                                        │
│                                                             │
│ → STREAM BLOCKS TO CLIENT AS PARSED                         │
└─────────────────────────────────────────────────────────────┘
```

**Key Requirement**: Phase 2 receives Phase 1 output as context, ensuring:
- Consistent page theme/tone
- No repetition of hero content
- Coherent narrative flow

**Expected Impact**:
- Time to first content: ~20-35 sec → ~3-5 sec (hero visible)
- Total time: ~20-35 sec → ~18-25 sec (slightly longer due to 2 calls)
- Perceived performance: Much better (user sees content immediately)

**Trade-offs**:
- Slightly longer total time (overhead of 2 API calls)
- More complex orchestration logic
- Need to handle Phase 1 failure gracefully

**Implementation Details**:

```typescript
// New function in claude.ts
export async function generateHeroAndContext(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification,
  layout: LayoutTemplate,
  env: Env
): Promise<{
  headline: string;
  subheadline: string;
  theme: string;  // e.g., "energizing morning routine", "troubleshooting support"
  heroBlock: GeneratedBlock;
  meta: { title: string; description: string };
}>;

// New function in claude.ts
export async function generateRemainingBlocks(
  query: string,
  ragContext: RAGContext,
  intent: IntentClassification,
  layout: LayoutTemplate,
  heroContext: {
    headline: string;
    subheadline: string;
    theme: string;
    heroBlock: GeneratedBlock;
  },
  env: Env
): Promise<{
  blocks: GeneratedBlock[];
  citations: Citation[];
}>;
```

**Prompt for Phase 2** (includes hero context):
```
## Page Context (Already Generated)
Headline: "${heroContext.headline}"
Subheadline: "${heroContext.subheadline}"
Theme: "${heroContext.theme}"

Hero Block Content:
${JSON.stringify(heroContext.heroBlock.content)}

## Your Task
Generate the REMAINING blocks for this page. The hero block is already complete.
Ensure your content:
1. Flows naturally from the hero
2. Does not repeat information from the hero
3. Maintains the established theme and tone
4. Follows the layout template for remaining blocks
```

**Evaluation Criteria**:
- [ ] Time to first visible content
- [ ] Content coherence (hero → rest flow)
- [ ] No repetition between phases
- [ ] Total time overhead acceptable

---

## Evaluation Plan

### Test Queries

Use these queries to evaluate all options:

1. **Simple recipe query**: "green smoothie recipes"
2. **Product comparison**: "A3500 vs Explorian comparison"
3. **Troubleshooting**: "my Vitamix is making a grinding noise"
4. **Use case**: "meal prep for busy families"
5. **Complex query**: "high protein post-workout smoothies for muscle recovery"

### Metrics to Capture

| Metric | Option 1 (Haiku) | Option 2 (3 blocks) | Option 3 (2-phase) |
|--------|------------------|---------------------|---------------------|
| Time to first content | | | |
| Total generation time | | | |
| Content quality (1-5) | | | |
| Brand voice score | | | |
| Layout adherence | | | |
| User satisfaction | | | |

### Implementation Priority

Based on effort vs. impact:

1. **Option 1 (Haiku)**: Lowest effort, good for baseline comparison
2. **Option 3 (2-phase)**: Best UX improvement, moderate effort
3. **Option 2 (3 blocks)**: Content trade-off may not be acceptable

### Recommended Approach

**Combine Option 1 + Option 3**:
- Use Haiku for Phase 1 (hero generation) - speed is critical
- Use Sonnet for Phase 2 (remaining blocks) - quality matters more
- This gives fast first-content (~2-3 sec) with high-quality remaining content

```
Phase 1 (Haiku): ~2-3 sec → Hero visible
Phase 2 (Sonnet): ~12-18 sec → Remaining blocks stream in
Total: ~15-20 sec, but user sees content in 2-3 sec
```

---

## Isolated Experiment Architecture

To safely test the two-phase optimization without affecting the current production flow, we implement a completely isolated parallel system.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HOMEPAGE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────┐    ┌─────────────────────────────┐         │
│  │   Standard Input Field      │    │   Fast Input Field          │         │
│  │   "What would you like..."  │    │   "Try Fast Generation..."  │         │
│  │   → ?generate=...           │    │   → ?fast=...               │         │
│  └─────────────────────────────┘    └─────────────────────────────┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                │                                    │
                ▼                                    ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│   vitamix-generative          │    │   vitamix-generative-fast     │
│   (Current Worker)            │    │   (Experiment Worker)         │
├───────────────────────────────┤    ├───────────────────────────────┤
│ - Single LLM call             │    │ - Two-phase LLM calls         │
│ - Sonnet for all content      │    │ - Haiku for hero (Phase 1)    │
│ - ~20-35 sec total            │    │ - Sonnet for rest (Phase 2)   │
│ - Waits for all before stream │    │ - Hero streams in ~3 sec      │
└───────────────────────────────┘    └───────────────────────────────┘
                │                                    │
                ▼                                    ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│   scripts.js                  │    │   scripts.js (fast mode)      │
│   (Current Frontend)          │    │   (Same file, different path) │
├───────────────────────────────┤    ├───────────────────────────────┤
│ - Renders after all blocks    │    │ - Renders hero immediately    │
│ - Standard loading state      │    │ - Progressive block loading   │
│ - ?generate= handling         │    │ - ?fast= handling             │
└───────────────────────────────┘    └───────────────────────────────┘
```

### File Structure

```
workers/
├── generative/                     ← UNCHANGED (current production)
│   ├── src/
│   │   ├── index.ts
│   │   ├── lib/orchestrator.ts
│   │   └── ai-clients/claude.ts
│   └── wrangler.toml
│
└── generative-fast/                ← NEW (isolated experiment)
    ├── src/
    │   ├── index.ts               # Entry point with ?fast= handling
    │   ├── lib/
    │   │   └── orchestrator-twophase.ts  # Two-phase orchestration
    │   ├── ai-clients/
    │   │   └── claude.ts          # Copy with new functions:
    │   │                          #   - generateHeroAndContext()
    │   │                          #   - generateRemainingBlocks()
    │   └── ... (copy other files)
    └── wrangler.toml              # Separate worker config

scripts/
├── scripts.js                      ← MODIFIED (add ?fast= detection)
└── experiment.js                   ← EXISTING (progressive rendering)

blocks/
└── query-form/
    └── query-form.js              ← MODIFIED (add 'fast' variant)

index.html                          ← MODIFIED (add fast input field)
```

### Query Parameter Routing

| URL Parameter | Worker | Frontend | Behavior |
|---------------|--------|----------|----------|
| `?generate=...` | vitamix-generative | scripts.js | Current flow, waits for all |
| `?fast=...` | vitamix-generative-fast | scripts.js (fast mode) | Two-phase, hero first |
| `?experiment=...` | vitamix-generative | experiment.js | Progressive (frontend only) |

### Rollback Strategy

If the experiment fails or underperforms:
1. Remove the fast input field from homepage
2. Delete the `workers/generative-fast/` directory
3. Remove `?fast=` handling from scripts.js
4. No changes to production worker needed

### Deployment

```bash
# Deploy experiment worker (separate from production)
cd workers/generative-fast
npx wrangler deploy

# Worker URL: https://vitamix-generative-fast.paolo-moz.workers.dev
```

---

## Implementation Steps

1. [x] Document isolated architecture (this section)
2. [ ] Create `workers/generative-fast/` directory
3. [ ] Copy base files from `workers/generative/`
4. [ ] Add `generateHeroAndContext()` function to claude.ts
5. [ ] Add `generateRemainingBlocks()` function to claude.ts
6. [ ] Create `orchestrator-twophase.ts` with two-phase logic
7. [ ] Update `index.ts` entry point
8. [ ] Add 'fast' variant to query-form block
9. [ ] Add fast input field to homepage
10. [ ] Update scripts.js to detect `?fast=` and use fast worker
11. [ ] Deploy experiment worker
12. [ ] Test and capture metrics

---

## Technical Notes

### Claude Token Generation Speed
- Haiku: ~100-150 tokens/second
- Sonnet: ~50-100 tokens/second
- Opus: ~30-50 tokens/second

### API Call Overhead
- Each API call adds ~200-500ms of network/processing overhead
- Two-phase approach adds ~400-1000ms total overhead
- Acceptable trade-off for ~15-20 sec faster perceived performance

### Streaming Consideration
- Claude API supports streaming responses
- Could stream Phase 2 JSON as it generates
- Complex: need to parse partial JSON to extract complete blocks
- Future optimization if two-phase proves successful
