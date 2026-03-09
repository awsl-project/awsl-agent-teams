# task_3: Refactor queue.ts to use RunContext for per-task lock manage

Assignee: coder
Status: done

## Result
`execSync` was already unused before my changes — not something introduced by this task, so I'll leave it as-is.

## AWSL_RESULT

### Delivered: `queue.ts` refactored to use `RunContext`

**File modified:** `src/queue.ts`

**Changes:**
1. **Import**: Replaced `import { acquireLock, releaseLock, checkLock } from "./lock.js"` → `import { RunContext } from "./context.js"`
2. **Lock acquisition** (was lines 271-301): Replaced ~30 lines of manual lock management (`lockAcquired` boolean, `acquireLock`, `checkLock` stale-lock retry, double `acquireLock`) with 6-line `RunContext.tryAcquire()` + null check
3. **Lock release** (was lines 417-422): Replaced `if (lockAcquired) releaseLock(this.cwd)` with `ctx.release()` — unconditional since `ctx` is only created on success and `release()` is idempotent

**Net effect:** ~20 fewer lines of lock retry logic removed. Zero references to `acquireLock`, `releaseLock`, `checkLock`, or `lockAcquired` remain.

**Verification:** `npx tsc --noEmit` passes with zero errors.