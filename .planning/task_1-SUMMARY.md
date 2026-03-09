# task_1: 1. In src/sandbox.ts, add a `checkReadPath()` function that 

Assignee: coder
Status: done

## Result
tsc passes clean.

## AWSL_RESULT

### Task 1: Add read tool path validation — Complete

**Changes made:**

| File | Change |
|------|--------|
| `src/sandbox.ts` | Added `checkReadPath()` — validates resolved path is within `policy.writePaths`, returns error message if blocked |
| `src/tools.ts` | `createReadTool()` now accepts optional `sandbox?: SandboxPolicy`; calls `checkReadPath` before reading; imported `checkReadPath` |
| `src/tools.ts` | `TOOL_FACTORIES.read` now passes `ctx.sandbox` to `createReadTool` |
| `src/index.ts` | Added `checkReadPath` to public exports |

**Verification:** `npx tsc --noEmit` passes with zero errors.