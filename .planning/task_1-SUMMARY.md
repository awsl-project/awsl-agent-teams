# task_1: Refactor the existing `plan()` method in `src/queue.ts` into

Assignee: coder
Status: done

## Result
Clean compile. `PlannedTask` is already exported from `src/index.ts` (line 14 — confirmed in the read). No changes needed there.

## AWSL_RESULT

**Refactored `plan()` in `src/queue.ts` into two public methods:**

1. **`planPreview(description: string): Promise<PlannedTask[]>`** — Calls LLM, parses response, returns planned tasks without touching the queue
2. **`planCommit(planned: PlannedTask[], defaults?): QueueTask[]`** — Takes planned tasks, resolves dependency references (position→q_N IDs), adds to queue via `this.add()`
3. **`plan()`** — Backward-compatible wrapper: calls `planPreview()` then `planCommit()`

**Files modified:**
- `src/queue.ts` — Refactored plan method into planPreview + planCommit + wrapper
- `src/queue.test.ts` — Added 5 tests for planCommit (dependency resolution, defaults, persistence, "all" refs, task-level overrides)

**Verification:**
- `npx tsc --noEmit` — clean, no errors
- `npx tsx --test src/queue.test.ts` — 10/10 pass (5 existing + 5 new)
- `src/index.ts` — `PlannedTask` already exported, no changes needed