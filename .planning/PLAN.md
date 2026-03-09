# Execution Plan

## task_1: Create sandbox.ts module
- **Assignee:** coder
- **Files:** src/sandbox.ts

### Action
Create new file src/sandbox.ts with:
1. `SandboxPolicy` interface with `writePaths: string[]` and `bash: BashPolicy`
2. `BashPolicy` interface with `mode: 'allowlist' | 'denylist' | 'unrestricted'` and `patterns: string[]`
3. `defaultPolicy(role: string, cwd: string): SandboxPolicy` — returns role-based defaults per the design doc:
   - coder: denylist with dangerous patterns (rm -rf /, sudo, mkfs, dd if=, fork bomb, chmod 777, > /dev/sd)
   - tester: allowlist (npm test, npx tsc, npx vitest, npx jest, node, cat, ls, head, tail, grep, find, wc)
   - reviewer: allowlist (cat, ls, head, tail, grep, find, wc, git log, git diff, git show)
   - architect: allowlist (cat, ls, head, tail, grep, find, wc, tree)
   - planner: allowlist (cat, ls, find, wc)
   - other: same as coder
4. `checkWritePath(resolvedPath: string, policy: SandboxPolicy): string | null` — returns null if allowed, error message if blocked. Use path.resolve, case-insensitive on Windows (process.platform === 'win32').
5. `checkBashCommand(command: string, policy: SandboxPolicy): string | null` — allowlist checks startsWith, denylist checks includes on trimmed command.

Follow project conventions: ES modules with .js extensions, tabs, no semicolons, JSDoc file header, import type where possible.

### Verify
npx tsc --noEmit

### Done
src/sandbox.ts exists with all 5 exports, passes type-check

## task_2: Wire sandbox into tools.ts
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/tools.ts

### Action
Modify src/tools.ts to enforce sandbox policy:
1. Import `SandboxPolicy`, `checkWritePath`, `checkBashCommand` from './sandbox.js'
2. Add `sandbox?: SandboxPolicy` to the `ToolContext` interface
3. Update `createWriteTool(cwd)` — add sandbox parameter. Before fs.writeFileSync, if sandbox is set, call checkWritePath(filePath, sandbox). If blocked, return error text instead of writing.
4. Update `createEditTool(cwd)` — same guard as write: check path before fs.writeFileSync.
5. Update `createBashTool(cwd)` — add sandbox parameter. Before execSync, if sandbox is set, call checkBashCommand(command, sandbox). If blocked, return error text.
6. Update TOOL_FACTORIES: pass ctx.sandbox to write, edit, bash tool factories.
7. Update `createAgentTools()` function signature: add optional `sandbox?: SandboxPolicy` parameter after `allowedTools`. Pass it into ToolContext.

Keep backward-compatible: sandbox is optional, undefined means no enforcement.

### Verify
npx tsc --noEmit

### Done
tools.ts guards write/edit/bash with sandbox checks, createAgentTools accepts sandbox param

## task_3: Thread sandbox through runner and orchestrator
- **Assignee:** coder
- **Dependencies:** task_1, task_2
- **Files:** src/runner.ts, src/orchestrator.ts

### Action
Wire sandbox from ExecuteOptions down to tool creation:

**src/runner.ts:**
1. Import `SandboxPolicy`, `defaultPolicy` from './sandbox.js'
2. Add `sandbox?: SandboxPolicy | boolean` parameter to `runWithBuiltin()` (after skillRegistry)
3. In runWithBuiltin: if sandbox is not false, compute policy = (sandbox === true || sandbox === undefined) ? defaultPolicy(agentDef.role, cwd) : sandbox. Pass policy to createAgentTools as the new sandbox param.
4. Add `sandbox?: SandboxPolicy | boolean` parameter to public `runAgent()` function (after taskId). Pass it through to runWithBuiltin. For claude-code engine, sandbox is ignored (Claude Code has its own permission system).

**src/orchestrator.ts:**
1. Import `SandboxPolicy` type from './sandbox.js'
2. Add `sandbox?: boolean | SandboxPolicy` to `ExecuteOptions` interface with JSDoc comment: 'Sandbox policy for builtin engine. true=role defaults (default), false=disabled, or custom SandboxPolicy.'
3. In executeTeam(): extract sandbox option with `const sandbox = options?.sandbox ?? true`
4. Pass sandbox as additional argument to ALL runAgent() calls in orchestrator.ts (there are ~10 call sites). Add it as the last argument after taskId.
5. In planOnly(): also pass sandbox to runAgent calls.

### Verify
npx tsc --noEmit

### Done
Sandbox flows from ExecuteOptions → runAgent → runWithBuiltin → createAgentTools. Default is true (role-based).

## task_4: Export sandbox API and add to agents
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/index.ts, src/agents.ts

### Action
1. In src/index.ts: add export line: `export { type SandboxPolicy, type BashPolicy, defaultPolicy, checkWritePath, checkBashCommand } from './sandbox.js'`
2. In src/agents.ts: add optional `sandbox?: SandboxPolicy` field to TeamAgentDef interface (import type from './sandbox.js'). This allows per-agent sandbox override via agent definition files. No need to parse from frontmatter yet — just add the type field.

### Verify
npx tsc --noEmit

### Done
SandboxPolicy exported from index.ts, TeamAgentDef has optional sandbox field

## task_5: Update documentation
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Add sandbox documentation to all three docs:

**README.md** (English):
- Add a '### Sandbox' subsection under the builtin engine section. Explain: write paths restricted to project dir, bash commands controlled per role (allowlist/denylist). Mention ExecuteOptions.sandbox (true/false/custom). Show the role default table from the design doc.

**README.zh-CN.md** (Chinese):
- Mirror the same sandbox section in Chinese.

**BEST_PRACTICES.md** (Chinese):
- Add a sandbox configuration section. Include: how to disable sandbox (sandbox: false), how to customize per-agent, what each role's defaults are, example of custom SandboxPolicy object.

### Verify
cat README.md | head -5

### Done
All three docs mention sandbox feature with role defaults table and configuration guidance

## task_6: Build and type-check verification
- **Assignee:** tester
- **Dependencies:** task_2, task_3, task_4
- **Files:** src/sandbox.ts, src/tools.ts, src/runner.ts, src/orchestrator.ts

### Action
Run full build and type-check to verify all changes compile correctly:
1. Run `npx tsc --noEmit` — must pass with zero errors
2. Run `npm run build` — must produce dist/ output without errors
3. Verify src/sandbox.ts exists and exports the expected functions by reading dist/sandbox.js
4. Spot-check that the sandbox guards are present in the compiled output (grep for 'checkWritePath' in dist/tools.js, grep for 'defaultPolicy' in dist/runner.js)

Report any type errors or build failures with exact error messages.

### Verify
npm run build && npx tsc --noEmit

### Done
Full build passes, type-check passes, sandbox guards present in compiled output
