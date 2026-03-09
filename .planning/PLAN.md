# Execution Plan

## task_1: Phase 3 writes REVIEW.md + auto-fix reads both
- **Assignee:** coder
- **Files:** src/orchestrator.ts

### Action
In src/orchestrator.ts, make these changes:

1. Line 677: Change `planning.write("VERIFICATION.md", verifyResult.result)` to `planning.write("REVIEW.md", verifyResult.result)`

2. Line 678: Change `memory.set("verification", verifyResult.result, verifier.name)` to `memory.set("review", verifyResult.result, verifier.name)`

3. Line 718: Change the fixPrompt from:
`"Read .planning/VERIFICATION.md. Fix all FAIL items. Then re-run the failing commands to confirm they pass."`
to:
`"Read .planning/VERIFICATION.md and .planning/REVIEW.md. Fix all FAIL and CRITICAL items from both files. Then re-run the failing commands to confirm they pass."`

These changes ensure Phase 3 (LLM reviewer) writes to REVIEW.md exclusively, Phase 3b (runFullVerification) continues writing to VERIFICATION.md, and the auto-fix coder reads both files.

### Verify
npx tsc --noEmit

### Done
Phase 3 LLM reviewer writes REVIEW.md, auto-fix prompt references both REVIEW.md and VERIFICATION.md

## task_2: Update CLI help and skill descriptions
- **Assignee:** coder
- **Files:** src/cli.ts, src/install.ts

### Action
Update references to reflect the REVIEW.md / VERIFICATION.md separation:

1. In src/cli.ts line 50, the usage help says:
`4. awsl verify           → .planning/VERIFICATION.md (code: run tests/lint)`
Add a new line after it:
`5. awsl review           → .planning/REVIEW.md (static code review)`
And renumber subsequent items if needed.

2. In src/install.ts:
- Line 169: Keep `Output: .planning/VERIFICATION.md` as-is (this describes the deterministic verify skill)
- Line 173: Change the auto-fix skill description from just reading VERIFICATION.md to reading both:
  Change `Read \`.planning/VERIFICATION.md\`` to `Read \`.planning/VERIFICATION.md\` and \`.planning/REVIEW.md\``
- Line 296: Add `.planning/REVIEW.md` to the file list, described as `— LLM reviewer findings`

Keep the existing VERIFICATION.md references for deterministic checks intact — only add REVIEW.md where the LLM reviewer output or combined reading is relevant.

### Verify
npx tsc --noEmit

### Done
CLI help and skill installer descriptions reflect the two-file separation

## task_3: Update documentation
- **Assignee:** coder
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files to reflect the verification pipeline separation:

1. In README.md and README.zh-CN.md, find the section describing the .planning/ directory files or the verification phase. Add REVIEW.md as a new file:
- REVIEW.md: LLM reviewer findings (spec compliance + code quality)
- VERIFICATION.md: Deterministic check results (tsc, eslint, tests)
- Mention that auto-fix reads both files

2. In BEST_PRACTICES.md, find the verification/review section. Explain the separation:
- Phase 3 LLM reviewer → writes REVIEW.md with [CRITICAL]/[PASS]/[WARN] findings
- Phase 3b deterministic checks → writes VERIFICATION.md with test/lint/typecheck results
- Auto-fix reads both files to fix all issues
- This prevents the deterministic checks from overwriting LLM findings

Keep the language consistent with each file (English for README.md, Chinese for README.zh-CN.md and BEST_PRACTICES.md).

### Verify
git diff --stat README.md README.zh-CN.md BEST_PRACTICES.md

### Done
All three documentation files describe the REVIEW.md / VERIFICATION.md separation

## task_4: Build and verify
- **Assignee:** tester
- **Dependencies:** task_1, task_2
- **Files:** src/orchestrator.ts, src/cli.ts, src/install.ts

### Action
Run the full build and type-check to verify no regressions:

1. Run `npx tsc --noEmit` to type-check
2. Run `npm run build` to compile
3. Verify that:
   - No TypeScript errors
   - Build succeeds
   - grep for 'REVIEW.md' in src/orchestrator.ts confirms Phase 3 writes to it
   - grep for 'VERIFICATION.md' in src/orchestrator.ts confirms only auto-fix/Phase 3b references remain
   - The auto-fix prompt in orchestrator.ts mentions both files

### Verify
npm run build && npx tsc --noEmit

### Done
Build passes with zero errors, REVIEW.md written by Phase 3 only, VERIFICATION.md written by Phase 3b only, auto-fix reads both
