## AWSL_RESULT

## Architecture Analysis: awsl-agent-teams

### Overview

Multi-agent orchestration engine for Claude Code. Two core abstractions: **Conductor** (orchestrator — planning, waves, parallelism) and **Guardian** (skills — quality enforcement injected into agent prompts). TypeScript strict mode, ES modules, compiles to `dist/`.

### Module Dependency Graph

```
cli.ts ─────────┬──→ orchestrator.ts (Conductor)
                │       ├── runner.ts (dual engine: claude-code | builtin)
                │       ├── planning.ts (.planning/ state persistence)
                │       ├── memory.ts (SharedMemory KV store)
                │       ├── skills.ts (Guardian skill injection)
                │       └── verify.ts (tsc, lint, test verification)
                │
                ├──→ queue.ts (task queue with QUEUE.json persistence)
                │       └── orchestrator.ts (executeTeam per task)
                │
                ├──→ dashboard.ts (HTTP server + SSE)
                │       ├── relay.ts (WebSocket server for remote clients)
                │       └── history.ts (HISTORY.json read)
                │
                └──→ remote.ts (WebSocket client → relay)
```

### File Roles (25 source files)

| File | LOC | Purpose |
|------|-----|---------|
| **orchestrator.ts** | 1195 | Core engine: brainstorm → research → plan → execute (topo-sort waves) → verify → replan |
| **cli.ts** | 960 | CLI entry: `awsl run/start/queue/dashboard/remote/validate/verify` |
| **queue.ts** | 530 | Sequential task queue, QUEUE.json persistence, dependency chains |
| **verify.ts** | 450 | Post-execution verification: tsc, eslint, npm test |
| **runner.ts** | 350 | Agent execution via `claude -p` subprocess or pi-agent-core in-process |
| **planning.ts** | 350 | `.planning/` dir management, PLAN.md parsing, checkpoints |
| **validate.ts** | 300 | PLAN.md → topological sort → WAVES.md |
| **dashboard.ts** | 260 | HTTP server serving `public/dashboard.html` + JSON API + SSE logs |
| **tools.ts** | 250 | Agent tool implementations (read, write, edit, bash, memory_*, report) |
| **install.ts** | 290 | Skill installer → `.claude/skills/` |
| **relay.ts** | 220 | WebSocket relay server for multi-machine management |
| **sandbox.ts** | 210 | Path/command sandboxing for builtin engine agents |
| **remote.ts** | 200 | WebSocket client connecting local machine to dashboard |
| **agents.ts** | 180 | Agent defs from markdown+YAML frontmatter, builtin defaults |
| **skills.ts** | 220 | Guardian skills: TDD, systematic debug, brainstorm, code review, planning |
| **context.ts** | 80 | RunContext: lifecycle lock with signal handlers |
| **memory.ts** | 68 | SharedMemory: in-process KV for inter-agent comms |
| **history.ts** | 130 | Append-only HISTORY.json for dashboard stats |
| **scheduler.ts** | 110 | OS-level scheduling (schtasks on Windows) |
| **lock.ts** | 120 | File-based concurrency lock (.planning/.lock) |
| **logstream.ts** | 55 | SSE log streaming |
| **log.ts** | 30 | Logging utility |

### Key Patterns

1. **Dual Engine** (`runner.ts`): `claude-code` spawns `claude -p` subprocess (zero API key needed); `builtin` uses pi-agent-core in-process with custom tools
2. **File-as-State**: All persistent state lives in `.planning/` — PLAN.md, WAVES.md, QUEUE.json, CHECKPOINT.json, HISTORY.json, STATE.md. No database.
3. **Wave Execution**: Tasks form a DAG. `validate.ts` topo-sorts into parallel waves. `orchestrator.ts` executes each wave concurrently via `runParallel()`.
4. **Skill Injection**: Guardian skills auto-activate by agent role (e.g., TDD for coders, brainstorm for architects). Injected into system prompts at runtime.
5. **Agent Definitions**: Markdown files with YAML frontmatter in `agents/`. 4 built-in roles: architect, coder, reviewer, tester. Custom agents via `--agents-dir`.
6. **Inter-Agent Memory**: `SharedMemory` KV store passed between agents within a session. Serialized to checkpoint for crash recovery.
7. **Remote Management**: Dashboard (HTTP+SSE) ← Relay (WebSocket) ← Remote clients. Multi-machine task distribution.
8. **Sandbox**: Builtin engine tools filtered by `SandboxPolicy` — read/write path restrictions, bash command allowlist/denylist, sensitive file blocking.

### Frameworks / Dependencies

- **pi-agent-core** + **pi-ai**: LLM agent framework (builtin engine)
- **@sinclair/typebox**: JSON schema for tool parameter validation
- **ws**: WebSocket (relay/remote)
- **yaml**: Agent frontmatter parsing
- **tsx**: Dev-time TS execution

### Data Flow

```
User goal → CLI
  → orchestrator.executeTeam()
    → Phase 0a: brainstorm (architect agent)
    → Phase 0b: research (parallel coder agents scan codebase)
    → Phase 1: plan (architect writes PLAN.md)
    → Phase 2: execute (topo-sorted waves, runner.runParallel)
    → Phase 3: verify (tsc + lint + tests)
    → Phase 4: replan on failure (retry up to 2x)
  → Result: committed code + VERIFICATION.md
```

### Architecture Boundaries

- **Orchestration layer** (orchestrator, queue, validate, planning) — pure logic, no LLM calls
- **Execution layer** (runner, tools, sandbox) — handles LLM interaction
- **Quality layer** (skills, verify) — methodology enforcement
- **Persistence layer** (planning, history, lock, memory) — file-based state
- **Network layer** (dashboard, relay, remote, logstream) — HTTP/WS/SSE
- **CLI layer** (cli, install, scheduler, context) — user interface