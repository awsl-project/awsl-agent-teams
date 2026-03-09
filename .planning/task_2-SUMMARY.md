# task_2: Update references to reflect the REVIEW.md / VERIFICATION.md

Assignee: coder
Status: done

## Result
Type-check passes cleanly.

## AWSL_RESULT

Updated CLI help and skill installer descriptions to reflect the REVIEW.md / VERIFICATION.md separation:

1. **src/cli.ts:51** — Added `5. awsl review → .planning/REVIEW.md (static code review)` to the CC Hybrid Mode help section
2. **src/install.ts:173** — Auto-fix step now reads both `VERIFICATION.md` and `REVIEW.md`
3. **src/install.ts:296-297** — Status skill file list now includes `.planning/REVIEW.md — LLM reviewer findings`

All existing VERIFICATION.md references for deterministic checks left intact. `npx tsc --noEmit` passes.