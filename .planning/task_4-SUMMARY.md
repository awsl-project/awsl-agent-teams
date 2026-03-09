# task_4: 1. In src/index.ts: add export line: `export { type SandboxP

Assignee: coder
Status: done

## Result
Type-check passes clean.

## AWSL_RESULT

**Modified files:**

1. **`src/index.ts`** — Added export line for `SandboxPolicy`, `BashPolicy`, `defaultPolicy`, `checkWritePath`, `checkBashCommand` from `./sandbox.js`
2. **`src/agents.ts`** — Added `import type { SandboxPolicy }` and optional `sandbox?: SandboxPolicy` field to `TeamAgentDef` interface

**Verification:** `npx tsc --noEmit` — passes with no errors