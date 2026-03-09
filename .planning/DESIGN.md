## AWSL_RESULT

### Design: Verification Pipeline Separation

**Problem:** `VERIFICATION.md` is overloaded — Phase 3 (LLM reviewer agent) and Phase 3b (`runFullVerification()`) both write to it. The LLM reviewer's findings get destroyed when deterministic checks overwrite the file. Auto-fix only sees deterministic results, missing code-quality issues.

**Solution: Simple File Split**

| File | Owner | Content |
|------|-------|---------|
| `REVIEW.md` | Phase 3 LLM reviewer | `[CRITICAL]/[PASS]/[WARN]` task-specific findings |
| `VERIFICATION.md` | Phase 3b deterministic providers | `[PASS]/[FAIL]` tsc/eslint/test output |
| Auto-fix prompt | Reads BOTH | Fixes all CRITICAL + FAIL items |

**4 changes in `src/orchestrator.ts`:**
1. **Line 677**: `planning.write("VERIFICATION.md", ...)` → `planning.write("REVIEW.md", ...)`
2. **Line 678**: `memory.set("verification", ...)` → `memory.set("review", ...)`
3. **Line 718**: Fix prompt updated to read both `REVIEW.md` and `VERIFICATION.md`

**No changes needed in:** `verify.ts` (already writes correct files), quality gate logic (reads in-memory, not file), CLI commands.

**Key decisions:**
1. **Reuse existing files** — REVIEW.md and VERIFICATION.md already exist with correct semantics
2. **No new abstractions** — agents can read two files; no need for a merged ISSUES.md
3. **Memory keys split** — `"review"` for LLM findings, `"verification"` for deterministic (future)
4. **Quality gate unaffected** — reads `verifyResult.result` variable, not the file

**Files produced:** `.planning/DESIGN.md`

**Design stored in shared memory as `design`.**