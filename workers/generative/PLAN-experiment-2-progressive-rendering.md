# Page Generation Experiment 2: Progressive Rendering

Created: 2025-11-30
Status: In Progress

## Goal

Experiment with a new **frontend rendering** experience where blocks are rendered one at a time as they arrive from the existing SSE stream, so users see content immediately and watch it progressively build as they read.

## Key Insight

The current worker **already streams blocks one at a time** via SSE events (`block-content`). The problem is the frontend (`scripts.js`) - it receives all blocks but doesn't show anything until the stream completes.

**This is a frontend-only experiment.** No worker changes needed.

## Current Flow (the problem)

1. User enters query → `?generate=...`
2. Worker streams blocks one at a time (✓ already works)
3. Frontend receives `block-content` events as they arrive
4. **Frontend waits for `generation-complete` before rendering anything** ← THE PROBLEM
5. User sees nothing for 10-15 seconds, then entire page appears

## Experimental Flow

1. User enters query → `?experiment=...`
2. Same worker, same SSE stream
3. Frontend receives first `block-content` event
4. **Frontend immediately renders & decorates that block** ← THE FIX
5. User sees first block in ~3 seconds
6. More blocks appear as they stream in
7. Smooth animations as content builds

## Architecture: Frontend-Only Change

```
workers/
  generative/                    ← UNCHANGED (already streams blocks)

scripts/
  scripts.js                     ← UNCHANGED (current flow still works)
  experiment.js                  ← NEW: progressive rendering logic

styles/
  experiment.css                 ← NEW: animation styles

blocks/
  query-form/                    ← MODIFIED: add 'experiment' variant
```

### Query parameter routing

| Param | Frontend Script | Worker | Behavior |
|-------|-----------------|--------|----------|
| `?generate=...` | scripts.js | vitamix-generative | Waits for complete, renders all |
| `?experiment=...` | experiment.js | vitamix-generative | Renders each block as it arrives |

**Same worker, different frontend behavior.**

## Frontend: Progressive Rendering

### experiment.js responsibilities

1. Detect `?experiment=` param
2. Show minimal loading state
3. Connect to **existing** SSE stream (`/api/stream`)
4. On each `block-content` event:
   - Create section element immediately
   - Insert HTML
   - Call `decorateBlock()`
   - Animate block appearance (fade in, slide up)
5. On `generation-complete` event:
   - Show completion indicator briefly
   - Enable persistence (if we add it)

### Key differences from scripts.js

| scripts.js (current) | experiment.js (new) |
|---------------------|---------------------|
| Hides loading state after ALL blocks | Hides after FIRST block |
| Renders all sections at once | Renders each section immediately |
| Decorates all blocks together | Decorates each block as it arrives |
| No animation | Fade-in animation per block |

## Implementation Steps

1. [x] Create `scripts/experiment.js` - progressive rendering client
2. [x] Create `styles/experiment.css` - animation styles
3. [x] Modify `scripts/scripts.js` - detect experiment mode, delegate
4. [x] Add `experiment` variant to query-form block
5. [x] Add experiment input field to homepage
6. [ ] Test with existing worker
7. [ ] Iterate on timing, animations, UX

## Files Created/Modified

### New Files
- `scripts/experiment.js` - Progressive rendering frontend
- `styles/experiment.css` - Experiment mode styles

### Modified Files
- `scripts/scripts.js` - Added experiment mode detection
- `blocks/query-form/query-form.js` - Added `experiment` variant
- `blocks/query-form/query-form.css` - Experiment variant styles
- `index.html` - Added experiment input field

### Files to Delete (no longer needed)
- `workers/generative-experiment/` - Entire directory (using main worker instead)

## Testing

1. Start local dev server: `npm start`
2. Test current flow: `http://localhost:3000/?generate=smoothie%20recipes`
3. Test experiment: `http://localhost:3000/?experiment=smoothie%20recipes`

Both should use the same deployed worker, just different frontend rendering.

## Success Criteria

- First block visible in < 3 seconds (same as worker response time)
- Smooth visual experience as blocks appear
- No regression to current `?generate=` flow
- Easy to A/B test both approaches
- No additional deployment/secrets needed

## Why This Approach is Better

1. **Simpler**: No new worker to deploy or maintain
2. **No secrets to copy**: Uses existing worker with existing API keys
3. **Faster iteration**: Just change frontend code
4. **Easy to discard**: Delete 2 files if experiment fails
5. **True isolation**: Current flow completely untouched
