Now I have a comprehensive view of the codebase. Here's my architecture analysis:

## AWSL_RESULT

### Architecture Analysis: `awsl-agent-teams`

**Runtime**: Node.js ES2022, TypeScript strict mode, ESM imports with `.js` extensions

**Dependencies**: `@mariozechner/pi-agent-core` + `pi-ai` (builtin LLM engine), `@sinclair/typebox` (schema validation), `ws` (WebSocket), `yaml` (frontmatter parsing)

---

### Module Boundaries (3 layers)

**1. Orchestration Layer** — plans and executes agent teams
- `orchestrator.ts` (45KB, largest file) — Conductor: 5-phase pipeline (brainstorm → research → plan → execute → verify → replan). Wave-based topological execution of task DAGs. Emits `TeamEvent` hooks.
- `runner.ts` — Dual engine abstraction. `claude-code` spawns `claude -p` subprocess; `builtin` uses pi-agent-core in-process. Rate limit detection + retry.
- `planning.ts` — `.planning/` directory as state machine. Checkpoint save/restore for crash recovery. Structured task parsing from LLM output.
- `validate.ts` — PLAN.md parser + topological sort into waves (WAVES.md)
- `verify.ts` — Two-stage verification: tsc + eslint + npm test, then static code review
- `queue.ts` — Sequential task queue with QUEUE.json persistence, scheduled execution (`runAt`), dependency chains between queue items

**2. Agent Layer** — defines and equips agents
- `agents.ts` — Loads agent definitions from markdown files with YAML frontmatter (builtin defaults + `./agents/` dir + CLI flag)
- `skills.ts` — Guardian skill registry (TDD, debug, brainstorm, code review, planning, subagent-dev). Skills auto-activate by agent role and inject methodology into system prompts.
- `tools.ts` — Built-in tool implementations for the builtin engine: read, write, edit, bash, memory_read/write/list, send_message, report. Uses TypeBox schemas.
- `memory.ts` — In-process `SharedMemory` (key-value Map) for inter-agent communication. Serializable for checkpoint persistence.
- `sandbox.ts` — Path/command sandboxing policies for agent tools
- `context.ts` — `RunContext` wraps per-run configuration (cwd, engine, agents, etc.)

**3. Infrastructure Layer** — CLI, dashboard, remote
- `cli.ts` (37KB) — CLI entry point. Commands: init, run, validate, verify, review, lock/unlock, agents, queue (add/plan/list/start/clear), dashboard, remote, start/stop/status
- `dashboard.ts` — HTTP server serving `public/dashboard.html` + JSON API endpoints (history, stats, queue CRUD, SSE log streaming)
- `relay.ts` — WebSocket relay server (`/ws/relay`) for remote machine management. Clients register with `clientId`, receive commands, push status.
- `remote.ts` — WebSocket client that connects a local machine to a remote dashboard
- `history.ts` — Append-only task execution history (HISTORY.json)
- `logstream.ts` — In-memory log stream with SSE support
- `lock.ts` — File-based concurrency lock (`.planning/.lock`)
- `scheduler.ts` — OS-level task scheduling (`schtasks` on Windows)
- `install.ts` — Skill installer for Claude Code integration
- `log.ts` — Centralized logging utility

---

### Key Patterns

| Pattern | Usage |
|---------|-------|
| **File-as-state** | `.planning/` directory stores all orchestration state (PLAN.md, WAVES.md, STATE.md, QUEUE.json, CHECKPOINT.json, HISTORY.json) |
| **Dual engine** | `claude-code` (subprocess) for Claude Code users; `builtin` (pi-agent-core in-process) for API-key users |
| **Conductor/Guardian separation** | Conductor = macro planning & parallelism; Guardian = micro methodology injection via skills |
| **Wave-based parallelism** | Tasks topologically sorted into dependency waves, executed in parallel within each wave |
| **Checkpoint recovery** | Serialize SharedMemory + task state to CHECKPOINT.json; restore on rate limit or crash |
| **Event hooks** | `TeamHook` callback system for progress tracking (17 event types) |
| **Markdown + YAML frontmatter** | Agent definitions are `.md` files with YAML frontmatter (name, role, tools, skills) |
| **Barrel exports** | `index.ts` re-exports all public APIs from every module |

### Data Flow

```
CLI/Skill → orchestrator.executeTeam()
  → brainstorm (Guardian skill)
  → research (parallel agents)
  → plan (structured task DAG → PLAN.md)
  → validate (topo sort → WAVES.md)
  → execute per wave (runner.runAgent/runParallel)
    → each agent gets: system prompt + Guardian skills + SharedMemory context + tools
  → verify (tsc + lint + tests)
  → replan on failure (up to N retries)
  → checkpoint after each wave
```

### File Structure Summary

```
src/           25 TypeScript files (~230KB total)
public/        dashboard.html (50KB single-file SPA)
agents/        2 custom agent definitions (.md)
.planning/     Runtime state directory (gitignored partially)
bench*/        Benchmark comparison directories
```