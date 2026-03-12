# task_1: 1. In src/history.ts, add a new interface BEFORE WaveInfo:



Assignee: coder
Status: done

## Result
## AWSL_RESULT

All changes implemented and verified. TDD RED-GREEN cycle complete.

### Files Modified
- **`src/history.ts`** — Added `WaveTaskDetail` interface (id, description, assignee, status, files, result, error) and enriched `WaveInfo` with optional `tasks?: WaveTaskDetail[]` and `status?: "success" | "partial" | "failed"` fields
- **`src/orchestrator.ts`** — Removed duplicate `WaveInfo` interface (was lines 74-79), replaced with `import type { WaveInfo } from "./history.js"` and `export type { WaveInfo }`
- **`src/index.ts`** — Removed `type WaveInfo` from orchestrator export (line 8), added `type WaveInfo, type WaveTaskDetail` to history.ts export (line 31)

### Files Created
- **`src/history-types.test.ts`** — 4 tests covering WaveTaskDetail required/optional fields, WaveInfo enriched fields, and backward compatibility

### Verification
- `npx tsc --noEmit` — **0 errors**
- `npx tsx --test src/history-types.test.ts` — **4/4 pass**