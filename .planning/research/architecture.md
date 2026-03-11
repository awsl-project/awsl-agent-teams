Here's the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**What it is:** A multi-agent orchestration engine coordinating specialized AI agents (architect, coder, reviewer, tester) via wave-based parallel execution. Two names: CLI = `awsl`, package = `awsl-agent-core`.

---

### Module Dependency Graph

```
cli.ts (entry point — 42 CLI commands)
  ├── orchestrator.ts (Conductor — core pipeline, 46KB largest file)
  │     ├── runner.ts (dual engine: claude-code subprocess | builtin pi-agent-core)
  │     │     ├── tools.ts (8 agent tools: read/write/edit/bash/memory_*/report)
  │     │     ├── sandbox.ts (path & command allowlists)
  │     │     ├── skills.ts (Guardian skill registry — TDD, review, brainstorm, etc.)
  │     │     └── logstream.ts (real-time log capture)
  │     ├── planning.ts (file-as-state: .planning/ dir, checkpoints, task parsing)
  │     ├── memory.ts (in-process KV store for inter-agent communication)
  │     └── verify.ts (tsc + npm test + eslint quality gate)
  ├── queue.ts (sequential task queue → QUEUE.json, sleep mode)
  │     ├── scheduler.ts (OS-level scheduling: schtasks/at)
  │     └── history.ts (execution history log)
  ├── dashboard.ts (HTTP server + JSON API + SSE log streaming)
  │     ├── relay.ts (WebSocket server for remote clients)
  │     └── projects.ts (global project registry at ~/.awsl/projects.json)
  ├── remote.ts (WebSocket client — connects local machine to dashboard)
  ├── agents.ts (markdown + YAML frontmatter agent defs, TypeBox validation)
  ├── validate.ts (PLAN.md parser + topological sort → WAVES.md)
  ├── lock.ts (file-based concurrency lock)
  ├── context.ts (RunContext — execution environment wrapper)
  ├── install.ts (Claude Code skill installer)
  └── index.ts (public API re-exports — 38 exports)
```

### Key Patterns

| Pattern | Implementation |
|---------|---------------|
| **Dual engine** | `claude-code` (spawns `claude -p` subprocess) or `builtin` (pi-agent-core in-process with any LLM) |
| **File-as-state** | All state in `.planning/` — PLAN.md, WAVES.md, QUEUE.json, CHECKPOINT.json, STATE.md |
| **Wave execution** | Topological sort → parallel waves; tasks within a wave run concurrently |
| **Shared memory** | In-process `Map<string, MemoryEntry>` injected into agent prompts as context |
| **Agent definitions** | Markdown files with YAML frontmatter (`agents/`), validated via TypeBox schema |
| **Guardian skills** | Role-based auto-activation of quality enforcement (TDD, code review, brainstorming) |
| **Checkpoint recovery** | Serialize memory + task state → resume after rate limits or crashes |
| **Sandbox** | Path allowlists + bash command filtering per agent |

### Frameworks & Dependencies

| Dependency | Purpose |
|-----------|---------|
| `@mariozechner/pi-agent-core` | Builtin engine — Agent class, tool interface |
| `@mariozechner/pi-ai` | LLM provider abstraction (`getModel()`) |
| `@sinclair/typebox` | Runtime JSON schema validation (agent frontmatter, tool params) |
| `ws` | WebSocket for relay server + remote client |
| `yaml` | YAML frontmatter parsing for agent defs |
| `tsx` | Dev-time TypeScript execution |
| TypeScript 5.6+ strict | ES2022 target, Node16 module resolution |

### Execution Pipeline

```
Brainstorm → Research (parallel) → Plan (task DAG) → Execute (waves) → Verify → Auto-fix → Retry/Replan
```

### File Stats

- **28 source files** in `src/`, totaling ~280KB
- Largest: `orchestrator.ts` (47KB), `cli.ts` (43KB), `dashboard.ts` (19KB)
- 2 test files: `projects.test.ts`, `dashboard-projects.test.ts`
- 2 custom agent defs: `fullstack-coder.md`, `security-reviewer.md`
- 1 dashboard HTML: `public/dashboard.html`

### Module Boundaries

- **Core pipeline**: orchestrator + runner + planning + memory + verify (tightly coupled)
- **Queue system**: queue + scheduler + history (self-contained, uses orchestrator for execution)
- **Dashboard layer**: dashboard + relay + remote + projects (HTTP/WS, loosely coupled)
- **Agent system**: agents + skills + tools + sandbox (composable, injected into runner)
- **Public API**: index.ts re-exports everything — flat, no sub-packages