# task_3: Wire sandbox from ExecuteOptions down to tool creation:

**s

Assignee: coder
Status: done

## Result
All 12 `runAgent()` calls in orchestrator now pass `sandbox`. 12 calls in total, all covered.

## AWSL_RESULT

**Modified files:**

1. **`src/runner.ts`**
   - **Imports:** Added `SandboxPolicy` (type-only) and `defaultPolicy` from `./sandbox.js`
   - **`runWithBuiltin()`:** Added `sandbox?: SandboxPolicy | boolean` parameter; computes `policy` — `defaultPolicy(role, cwd)` when true/undefined, passthrough when custom, undefined when false; passes policy to `createAgentTools()`
   - **`runAgent()`:** Added `sandbox?: SandboxPolicy | boolean` as last parameter; passes to `runWithBuiltin()`; ignored for claude-code engine (has its own permission system)

2. **`src/orchestrator.ts`**
   - **Import:** Added `SandboxPolicy` type from `./sandbox.js`
   - **`ExecuteOptions`:** Added `sandbox?: boolean | SandboxPolicy` with JSDoc
   - **`executeTeam()`:** Extracts `sandbox = options?.sandbox ?? true`; passes to all 9 `runAgent()` calls (brainstorm, research×2, plan, execute, verify, fix, retry, replan, replan-retry)
   - **`planOnly()`:** Added `sandbox` to options type; extracts with default `true`; passes to all 3 `runAgent()` calls

**Verification:** `npx tsc --noEmit` — passes with no errors