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

## Key Rules

### Every new feature MUST update documentation

When implementing a new feature, you MUST also update:

1. **README.md** (English) — Add the feature to relevant sections
2. **README.zh-CN.md** (Chinese) — Mirror the same changes
3. **BEST_PRACTICES.md** — Add usage guidance, examples, and gotchas

This is a hard requirement, not optional. Features without documentation are incomplete.

### Code conventions

- TypeScript strict mode
- ES module imports with `.js` extensions
- Use `log` from `./log.js` for all logging (not console.log)
- File-as-state: persist important data to `.planning/` directory
- Exports: all public APIs must be re-exported from `src/index.ts`
- CLI: all new commands must be documented in `usage()` function
