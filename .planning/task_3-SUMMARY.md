# task_3: Fix shell injection in git commands

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Changes Made

**File: `src/planning.ts`**

- **Removed `execSync` import** (line 316): Changed `import { execSync, execFileSync }` → `import { execFileSync }`. `execSync` spawns a shell (`/bin/sh -c` / `cmd.exe /c`) which interprets metacharacters (`; | & $ \``). No longer needed.

- **`changedFiles()` (line 324)**: Replaced `execSync("git status --porcelain", ...)` with `execFileSync("git", ["status", "--porcelain"], ...)`. Executes `git` directly without a shell, preventing any metacharacter injection via the `cwd` parameter or environment.

- **`atomicCommit()` (line 377)**: Replaced `execSync("git diff --cached --name-only", ...)` with `execFileSync("git", ["diff", "--cached", "--name-only"], ...)`. Same rationale.

### Why This Matters

`execSync(cmd)` passes `cmd` through a shell. While the command strings here were static, the `cwd` option and environment variables flow through the shell layer. `execFileSync` bypasses the shell entirely — arguments are passed as an array directly to the process, eliminating shell injection as a class of vulnerability. This is now consistent with the existing `git add` and `git commit` calls (lines 373, 381) which already used `execFileSync`.

### Verification
- `npx tsc --noEmit` — passes with zero errors