# task_3: In src/dashboard.ts, add a new route handler BEFORE the exis

Assignee: coder
Status: done

## Result
All green. `tsc --noEmit` passes with 0 errors, all 3 tests pass.

## AWSL_RESULT

Task complete. TDD RED-GREEN cycle verified.

### Files Modified
- **`src/dashboard.ts`** — Added `/api/history/:id/waves` route handler before the existing `/api/history` handler. Updated the log.info API listing to include the new endpoint.

### Files Created
- **`src/dashboard-waves.test.ts`** — 3 tests: returns wave details for valid entry, returns 404 for unknown entry, returns empty array when entry has no waves.

### Verification
- `npx tsc --noEmit` — **0 errors**
- `npx tsx src/dashboard-waves.test.ts` — **3/3 pass**