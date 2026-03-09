# task_1: Create new file src/sandbox.ts with:
1. `SandboxPolicy` inte

Assignee: coder
Status: done

## Result
All 5 exports present. The file is complete and type-checks clean.

## AWSL_RESULT

**Created:** `src/sandbox.ts` (117 lines)

**Exports:**
1. `SandboxPolicy` interface — `writePaths: string[]`, `bash: BashPolicy`
2. `BashPolicy` interface — `mode: 'allowlist' | 'denylist' | 'unrestricted'`, `patterns: string[]`
3. `defaultPolicy(role, cwd)` — role-based defaults for coder/tester/reviewer/architect/planner
4. `checkWritePath(resolvedPath, policy)` — path validation with Windows case-insensitive support
5. `checkBashCommand(command, policy)` — allowlist (startsWith) / denylist (includes) checking

**Verification:** `npx tsc --noEmit` — passes with no errors