# task_3: Update all three documentation files to reflect the verifica

Assignee: coder
Status: done

## Result
Type-check passes.

## AWSL_RESULT

Updated all three documentation files to reflect the REVIEW.md / VERIFICATION.md separation:

### Files modified

1. **README.md** (3 changes):
   - Pipeline Phases: Phase 3 now shows `LLM reviewer → REVIEW.md; tsc/test/eslint → VERIFICATION.md`
   - Self-Healing Features: Auto-fix loop reads both REVIEW.md + VERIFICATION.md
   - `.planning/` directory: Updated file descriptions (VERIFICATION.md = deterministic checks, REVIEW.md = LLM reviewer findings)

2. **README.zh-CN.md** (3 changes):
   - Same pipeline phases, self-healing, and `.planning/` directory updates in Chinese

3. **BEST_PRACTICES.md** (7 changes):
   - Architecture overview: Added LLM review → REVIEW.md and verify → VERIFICATION.md as separate steps
   - Section 4 verify command: Added REVIEW.md vs VERIFICATION.md comparison table + rationale for separation
   - Section 6 `.planning/` file list: Added REVIEW.md, updated VERIFICATION.md description
   - Section 10 verify failure: Auto-fix now reads both files
   - Benchmark data: Phase 3 label updated to "Review+Verify"
   - `--no-verify` table: Clarified which file each phase generates
   - Section 12 `awsl review`: Distinguished CLI static scan from LLM reviewer in pipeline

**Diff stats:** 3 files changed, 38 insertions, 22 deletions. Type-check passes.