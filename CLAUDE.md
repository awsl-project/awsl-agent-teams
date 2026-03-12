# CLAUDE.md — Project Instructions

## Build & Dev

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript → dist/
npx tsc --noEmit     # Type-check without emitting
```

## Project Structure

- `src/` — TypeScript source
  - `runner.ts` — Agent execution (claude-code / builtin engines)
  - `orchestrator.ts` — Conductor: wave-based task orchestration
  - `planning.ts` — .planning/ state persistence + checkpoint
  - `queue.ts` — Task queue (sleep mode)
  - `cli.ts` — CLI entry point
  - `index.ts` — Public API exports
  - `agents.ts` — Agent definitions + markdown parser
  - `skills.ts` — Guardian skill registry
  - `lock.ts` — File-based concurrency lock
  - `verify.ts` — Code verification (tsc, npm test, eslint)
  - `validate.ts` — PLAN.md parser + topo sort
  - `memory.ts` — In-process shared memory
  - `tools.ts` — Built-in agent tools
  - `log.ts` — Logging utility
  - `install.ts` — Skill installer
  - `scheduler.ts` — System-level task scheduling (schtasks / at)
  - `projects.ts` — Global project registry (~/.awsl/projects.json)
  - `relay.ts` — WebSocket relay server for remote client management
  - `remote.ts` — Remote client (connects local machine to dashboard)

## Key Rules

### Every new feature MUST update documentation

When implementing a new feature, you MUST also update:

1. **README.md** (English) — Add the feature to relevant sections
2. **README.zh-CN.md** (Chinese) — Mirror the same changes
3. **BEST_PRACTICES.md** — Add usage guidance, examples, and gotchas

This is a hard requirement, not optional. Features without documentation are incomplete.

### Auto-queue for batch requirements

When the user's message contains what appears to be multiple actionable requirements (numbered list, bullet points, or clearly separate tasks), follow this procedure:

**Step 1: Analyze and extract**
- Parse the user's message carefully
- List each distinct requirement with a one-line summary
- Show the extracted list to the user in this format:

```
检测到 N 条需求：
1. <requirement summary>
2. <requirement summary>
...

要使用 /awsl-plan 生成执行计划吗？
```

**Step 2: On confirmation**, use `/awsl-plan` with all requirements combined as the goal.

**Step 3: Show the plan summary**, then ask: "要立刻开始执行吗？"

**Step 4: On confirmation**, execute with `/awsl-go`.

**When NOT to trigger:** follow-up questions, discussion points, clarifications, or single requirements with sub-points that form one logical task.

### Commit after every completed feature

When a feature is fully implemented (code + docs + build passes), immediately create a git commit. Do not wait or batch multiple features into one commit. One feature = one commit.

### Code conventions

- TypeScript strict mode
- ES module imports with `.js` extensions
- Use `log` from `./log.js` for all logging (not console.log)
- File-as-state: persist important data to `.planning/` directory
- Exports: all public APIs must be re-exported from `src/index.ts`
- CLI: all new commands must be documented in `usage()` function
