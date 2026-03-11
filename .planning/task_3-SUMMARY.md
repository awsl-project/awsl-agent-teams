# task_3: Modify `src/queue.ts` to support discussion mode:

1. **Add 

Assignee: coder
Status: done

## Result
All tests pass. Here's the summary:

## AWSL_RESULT

### Task: Modify `src/queue.ts` to support discussion mode

**Status:** Complete

**Files modified:**
- `src/queue.ts` — Added discussion mode support to the task queue

**Files created:**
- `src/queue.test.ts` — 5 tests for the new mode/discussRounds fields

**Changes made:**

1. **Import:** Added `import { discussTeam } from "./discuss.js"`
2. **QueueTask interface:** Added `mode?: "build" | "discuss"` field and `discussRounds?: number` to options
3. **`add()` method:** Extended `extra` parameter to accept `mode`, sets it on the task when provided
4. **`start()` method:** Branches on `nextTask.mode === "discuss"`:
   - **Discussion path:** Calls `discussTeam()` with timeout, records history with `mode: "discuss"` and `answer` fields, skips autoCommit (no code changes)
   - **Build path:** Existing `executeTeam()` flow wrapped in `else` block, unchanged behavior
   - Shared timeout promise extracted before the if/else
5. **Error handling:** Existing catch block covers both modes

**Test results:**
```
# tests 5 (queue) + 5 (discuss) = 10
# pass 10
# fail 0
```

**Verification:** `npx tsc --noEmit` passes with zero errors.