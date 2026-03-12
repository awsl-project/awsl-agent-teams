# task_2: In src/orchestrator.ts, modify the waveInfos.push() block at

Assignee: coder
Status: done

## Result
All 10 tests pass. 

## AWSL_RESULT

Task complete. TDD RED-GREEN cycle done.

### Files Modified
- **`src/orchestrator.ts`** — Updated import to include `WaveTaskDetail` from `./history.js`. Replaced the simple `waveInfos.push()` block (~line 782) with enriched version that:
  1. Builds `WaveTaskDetail[]` array from wave tasks (mapping id, description, assignee, status, files, result truncated to 200 chars, error truncated to 200 chars)
  2. Computes wave-level status: `"success"` (all done/verified), `"failed"` (all failed), or `"partial"` (mixed)
  3. Pushes both `tasks` and `status` into the `WaveInfo` object

### Files Created
- **`src/wave-details.test.ts`** — 6 tests covering field mapping, truncation, all three status outcomes, and full WaveInfo integration

### Verification
- `npx tsc --noEmit` — **0 errors**
- `npx tsx --test src/wave-details.test.ts src/history-types.test.ts` — **10/10 pass**