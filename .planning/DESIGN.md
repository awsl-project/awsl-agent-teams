## AWSL_RESULT

### Design: Builtin Engine Minimal Sandbox

**Design document:** `.planning/DESIGN-sandbox.md`

### Summary of Key Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **SandboxPolicy interface** (not hardcoded guards) | ~10 extra lines buys configurability, per-agent override, future extensibility |
| 2 | **Role-based defaults** (not phase-based) | Roles already exist on every agent; phases would require threading new state through ToolContext |
| 3 | **String pattern matching for bash** (not AST parsing) | Shell parsing is a rabbit hole; prefix/contains matching prevents accidental damage, good enough for v1 |
| 4 | **Opt-out, not opt-in** | Security on by default; `sandbox: false` to disable |

### Architecture

```
ExecuteOptions.sandbox (bool | SandboxPolicy)
  → runWithBuiltin() computes defaultPolicy(role, cwd)
    → createAgentTools(…, sandbox)
      → ToolContext.sandbox
        → createWriteTool: checkWritePath() before fs.writeFileSync
        → createEditTool:  checkWritePath() before fs.writeFileSync  
        → createBashTool:  checkBashCommand() before execSync
```

### Files to Change

| File | Action | Lines |
|------|--------|-------|
| `src/sandbox.ts` | **NEW** | ~80 |
| `src/tools.ts` | Modify | +20 |
| `src/runner.ts` | Modify | +5 |
| `src/orchestrator.ts` | Modify | +10 |
| `src/agents.ts` | Modify | +5 |
| `src/index.ts` | Modify | +1 |
| Docs (3 files) | Update | ~30 each |

### Role → Policy Matrix

| Role | Write | Bash | Philosophy |
|------|-------|------|------------|
| coder | project dir | denylist (dangerous cmds) | Broad access, block footguns |
| tester | project dir | allowlist (test cmds) | Only what's needed to test |
| reviewer | project dir | allowlist (read cmds) | Read-only exploration |
| architect | project dir | allowlist (read cmds) | Read-only exploration |
| planner | project dir | allowlist (minimal) | Minimal shell access |