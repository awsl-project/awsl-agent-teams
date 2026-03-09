# task_2: Modify src/tools.ts to enforce sandbox policy:
1. Import `Sa

Assignee: coder
Status: done

## Result
All changes are in place and type-check passes.

## AWSL_RESULT

**Modified:** `src/tools.ts`

**Changes:**
1. **Imports:** Added `SandboxPolicy` (type-only), `checkWritePath`, `checkBashCommand` from `./sandbox.js`
2. **`createWriteTool(cwd, sandbox?)`** — checks `checkWritePath` before `fs.writeFileSync`; returns error text if blocked
3. **`createEditTool(cwd, sandbox?)`** — same guard before `fs.writeFileSync`
4. **`createBashTool(cwd, sandbox?)`** — checks `checkBashCommand` before `execSync`; returns error text if blocked
5. **`ToolContext`** — added `sandbox?: SandboxPolicy` field
6. **`TOOL_FACTORIES`** — passes `ctx.sandbox` to write, edit, bash factories
7. **`createAgentTools()`** — added optional `sandbox?: SandboxPolicy` parameter (last arg), threaded into `ToolContext`

**Backward-compatible:** all sandbox params are optional; `undefined` means no enforcement.

**Verification:** `npx tsc --noEmit` — passes with no errors