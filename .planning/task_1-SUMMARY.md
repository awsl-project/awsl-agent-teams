# task_1: In src/orchestrator.ts, make these changes:

1. Line 677: Ch

Assignee: coder
Status: done

## Result
All three changes applied and type-check passes cleanly:

1. **Line 677**: `planning.write("REVIEW.md", ...)` — Phase 3 LLM reviewer now writes to `REVIEW.md`
2. **Line 678**: `memory.set("review", ...)` — Memory key changed from `"verification"` to `"review"`
3. **Line 718**: Auto-fix prompt now reads both `VERIFICATION.md` and `REVIEW.md`, fixing all `FAIL` and `CRITICAL` items from both

## AWSL_RESULT

### Task: Phase 3 writes REVIEW.md + auto-fix reads both

**Changes made to `src/orchestrator.ts`:**
- Phase 3 (LLM reviewer) now writes to `REVIEW.md` instead of `VERIFICATION.md` (line 677)
- Memory key updated from `"verification"` to `"review"` (line 678)
- Auto-fix coder prompt updated to read both `VERIFICATION.md` and `REVIEW.md` and fix both `FAIL` and `CRITICAL` items (line 718)

**Verification:** `npx tsc --noEmit` passes with no errors.

**Files modified:**
- `src/orchestrator.ts`