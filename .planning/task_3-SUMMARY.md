# task_3: In src/planning.ts around lines 372-384:
1. Change `import {

Assignee: coder
Status: done

## Result
tsc passes clean.

## AWSL_RESULT

### Task 3: Replace shell-interpolated git commands with execFileSync — Complete

| File | Change |
|------|--------|
| `src/planning.ts:316` | Import updated: added `execFileSync` alongside `execSync` |
| `src/planning.ts:373` | `git add` now uses `execFileSync("git", ["add", "--", f], ...)` — no shell interpolation |
| `src/planning.ts:381` | `git commit` now uses `execFileSync("git", ["commit", "-m", commitMsg], ...)` — no shell interpolation |

**Security fix**: Both `git add` and `git commit` now bypass the shell entirely via `execFileSync` with array arguments, eliminating command injection through crafted filenames or commit messages. Verification: `npx tsc --noEmit` passes clean.