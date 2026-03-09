# task_1: In src/queue.ts:
1. Add import: `import { atomicCommit } fro

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task Complete: Add atomicCommit to queue.ts

**File modified:** `src/queue.ts`

**Changes applied:**
1. **Line 18** — Added `import { atomicCommit } from "./planning.js";`
2. **Lines 359-364** — Auto-commit after task completion (success or failure), using `nextTask.id` for the commit message
3. **Lines 402-407** — Auto-commit after task error (catch path), using `nextTask.id` for the commit message

Both calls are wrapped in `try/catch` so commit failures are logged as warnings but don't interrupt queue execution. Used `nextTask` (always in scope) instead of `freshTask` (could be undefined outside the `if` block) to avoid potential runtime errors.

**Verification:** `npx tsc --noEmit` — passed with zero errors.