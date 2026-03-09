# task_2: Update all three documentation files to reflect that --no-ve

Assignee: coder
Status: done

## Result
All three files are updated correctly.

## AWSL_RESULT

Updated all three documentation files to reflect `--no-verify` as a true master switch:

### Files modified:
1. **README.md** — Updated `--no-verify` option description (line 168) to state it skips ALL verification; added `[skipped by --no-verify]` annotations to Phase 3 and Phase 3b in pipeline phases (lines 182-183)
2. **README.zh-CN.md** — Mirrored the same changes in Chinese (lines 168, 182-183)
3. **BEST_PRACTICES.md** — Added a new `### --no-verify 验证总开关` section (lines 561-583) with:
   - Table of skipped phases (reviewer agent, provider verify, auto-fix loop)
   - Explanation that task auto-retry is NOT affected
   - When to use `--no-verify` (quick iterations, external CI, trusted code, debugging)
   - When NOT to use it (unattended builds, large projects, quality-critical scenarios)