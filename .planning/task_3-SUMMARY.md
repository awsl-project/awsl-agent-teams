# task_3: Add tests to `src/queue.test.ts` for the new `planPreview` a

Assignee: tester
Status: done

## Result
Clean compile.

## AWSL_RESULT

**Added 4 planCommit edge-case tests to `src/queue.test.ts`:**

1. **`planCommit adds tasks with no dependencies`** — Independent tasks without `dependsOn`, verifies goal text, `quick` flag, and persistence via `list()`
2. **`planCommit resolves position-based dependencies`** — Combined test: empty deps → `undefined`, position ref `"1"` → resolved to actual ID, `"all"` → kept as `"all"`
3. **`planCommit applies defaults`** — Verifies `model` and `concurrency` defaults are applied to tasks
4. **`planCommit with empty array returns empty`** — Empty `PlannedTask[]` returns empty result without errors

**Verification:**
- `npx tsx --test src/queue.test.ts` — 14/14 pass (5 original + 5 coder + 4 new)
- `npx tsc --noEmit` — clean, no errors

**Files modified:**
- `src/queue.test.ts` — Added 4 test cases (lines 174–232)