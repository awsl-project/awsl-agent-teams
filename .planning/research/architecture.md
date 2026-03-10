Now I have a comprehensive view. Here's the architecture analysis:

## AWSL Agent Teams — Architecture Analysis

### Project Overview
Multi-agent orchestration engine (TypeScript, ES modules, strict mode) that coordinates AI agents to execute software tasks in parallel waves. Two execution engines: `claude-code` (spawns `claude -p` CLI) and `builtin` (pi-agent-core in-process).

### File Structure (25 source files)

```
src/
├── cli.ts           (37K) — CLI entry: 20+ commands, flag parsing, usage()
├── orchestrator.ts  (46K) — Core: brainstorm → research → plan → execute → verify → replan
├── queue.ts         (21K) — Task queue with QUEUE.json persistence, sleep mode
├── runner.ts        (14K) — Dual engine: claude-code subprocess vs builtin Agent
├── planning.ts      (14K) — .planning/ dir state: PLAN.md, STATE.md, checkpoints
├── validate.ts      (12K) — PLAN.md parser + topological sort → WAVES.md
├── verify.ts        (18K) — Quality gate: tsc, npm test, eslint checks
├── install.ts       (12K) — Skill installer for .claude/skills/
├── tools.ts         (10K) — 8 built-in tools: read/write/edit/bash/memory/report
├── dashboard.ts     (10K) — HTTP server + SSE + JSON API for pixel art dashboard
├── skills.ts         (9K) — Guardian skill registry (TDD, debug, review, planning)
├── relay.ts          (9K) — WebSocket relay for remote client management
├── remote.ts         (8K) — Remote client connecting local → dashboard
├── sandbox.ts        (8K) — Write-path restrictions + bash command filtering
├── agents.ts         (7K) — Agent defs from YAML-frontmatter markdown files
├── history.ts        (5K) — HISTORY.json persistence
├── lock.ts           (5K) — File-based concurrency lock (.planning/.lock)
├── scheduler.ts      (4K) — OS-level scheduling (schtasks/at)
├── context.ts        (3K) — RunContext: lifecycle lock with signal handlers
├── index.ts          (2K) — Public API re-exports
├── memory.ts         (2K) — In-process SharedMemory (key-value Map)
├── logstream.ts      (2K) — Log stream for SSE
└── log.ts            (1K) — Logging utility
agents/               — Custom agent .md files (fullstack-coder, security-reviewer)
public/               — dashboard.html (pixel art UI)
test/                 — Test files
scripts/              — deploy-webhook.sh
```

### Module Boundaries

| Layer | Modules | Responsibility |
|-------|---------|----------------|
| **CLI** | `cli.ts` | Parses args, dispatches to orchestrator/queue/dashboard |
| **Orchestration** | `orchestrator.ts`, `queue.ts` | Wave-based DAG execution (Conductor), sequential queue |
| **Execution** | `runner.ts`, `tools.ts`, `sandbox.ts` | Runs agents via subprocess or in-process, provides sandboxed tools |
| **Planning** | `planning.ts`, `validate.ts`, `verify.ts` | File-as-state in `.planning/`, PLAN.md parsing, quality gates |
| **Definitions** | `agents.ts`, `skills.ts` | Agent config (YAML+MD), Guardian skill injection |
| **Infrastructure** | `lock.ts`, `context.ts`, `memory.ts`, `history.ts`, `log.ts`, `logstream.ts` | Concurrency, lifecycle, inter-agent comms, persistence |
| **Network** | `dashboard.ts`, `relay.ts`, `remote.ts`, `scheduler.ts` | HTTP dashboard, WebSocket relay, OS scheduling |

### Key Patterns

1. **Conductor/Guardian split** — Orchestrator (Conductor) handles *what/when*; Skills (Guardian) inject *how* into agent prompts based on role
2. **File-as-state** — All persistent state lives in `.planning/` (PLAN.md, QUEUE.json, STATE.md, CHECKPOINT.json, HISTORY.json, .lock)
3. **Wave-based parallelism** — Tasks form a DAG, topologically sorted into waves; tasks within a wave run in parallel
4. **Dual engine** — `claude-code` spawns `claude -p` as subprocess; `builtin` uses pi-agent-core Agent with custom tools in-process
5. **Checkpoint/recovery** — Rate limit detection → checkpoint to disk → resume from last good state
6. **Atomic commits** — Each completed task gets its own git commit via `atomicCommit()`
7. **RunContext** — RAII-style lock: acquire on start, auto-release on SIGINT/SIGTERM/scope-exit

### Dependencies
- **@mariozechner/pi-agent-core** + **pi-ai** — LLM agent framework (builtin engine)
- **@sinclair/typebox** — JSON Schema for tool parameters
- **ws** — WebSocket (relay server + remote client)
- **yaml** — YAML frontmatter parsing for agent definitions
- **tsx** — Dev-time TypeScript execution

### Data Flow
```
User goal → CLI → Orchestrator
  → Brainstorm (architect agent)
  → Research (parallel codebase scan)
  → Plan (structured task DAG → .planning/PLAN.md)
  → Execute (wave-by-wave, runner per task, atomic commits)
  → Verify (tsc + tests + lint + static review)
  → Auto-fix / Replan on failure
  → Result summary
```

The queue (`queue.ts`) provides an alternative entry: tasks are enqueued, persisted, and executed sequentially with optional scheduling and dependency tracking.

## AWSL_RESULT

**Architecture**: Layered TypeScript CLI with Conductor/Guardian pattern. Orchestrator manages wave-based parallel agent execution; Guardian skills inject quality methodology per agent role. Dual execution engine (claude-code subprocess vs pi-agent-core in-process). All state persisted to `.planning/` directory. Dashboard via HTTP+SSE+WebSocket.

**Key files**: `orchestrator.ts` (46K, core pipeline), `cli.ts` (37K, command dispatch), `queue.ts` (21K, task queue), `runner.ts` (14K, dual engine), `planning.ts` (14K, state persistence).

**Patterns**: File-as-state, wave-based DAG parallelism, checkpoint/recovery, atomic commits, RAII lock management, role-based skill injection, sandboxed tool execution.