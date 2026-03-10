## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**What it is:** A multi-agent orchestration engine that coordinates specialized AI agents (architect, coder, reviewer, tester) to execute software tasks in parallel waves.

---

### Module Dependency Graph

```
cli.ts (entry point)
  ├── orchestrator.ts (Conductor — core pipeline)
  │     ├── runner.ts (dual engine: claude-code | builtin)
  │     │     ├── tools.ts (agent tool implementations)
  │     │     ├── sandbox.ts (path/command policy enforcement)
  │     │     └── logstream.ts (streaming log capture)
  │     ├── planning.ts (.planning/ state persistence)
  │     ├── memory.ts (SharedMemory — inter-agent KV store)
  │     ├── skills.ts (Guardian skill registry)
  │     └── verify.ts (tsc, eslint, npm test quality gate)
  ├── queue.ts (sequential task queue with QUEUE.json)
  │     ├── history.ts (execution history log)
  │     └── scheduler.ts (OS-level scheduling: schtasks)
  ├── dashboard.ts (HTTP server + SSE for pixel art UI)
  │     └── relay.ts (WebSocket relay for remote machines)
  ├── remote.ts (WebSocket client → relay)
  ├── agents.ts (markdown+YAML agent definitions)
  ├── validate.ts (PLAN.md parser + topological sort)
  ├── lock.ts (file-based concurrency lock)
  ├── context.ts (RunContext — per-execution state)
  └── install.ts (skill installer → .claude/skills/)
```

---

### Key Patterns

| Pattern | Where | Details |
|---------|-------|---------|
| **File-as-state** | `planning.ts` | All orchestration state lives in `.planning/` (PLAN.md, QUEUE.json, CHECKPOINT.json, shared-memory.json). Enables crash recovery and session-independent persistence. |
| **Dual engine** | `runner.ts` | `claude-code` spawns `claude -p` as subprocess; `builtin` uses pi-agent-core in-process with custom tools. Auto-detected. |
| **Wave-based parallelism** | `orchestrator.ts` | Tasks form a DAG → topologically sorted into waves → each wave runs agents in parallel via `runParallel()`. |
| **Conductor/Guardian split** | `orchestrator.ts` + `skills.ts` | Conductor handles macro (what/when/order). Guardian skills inject micro behavior (TDD, brainstorm, review) per-agent. |
| **Agent-as-markdown** | `agents.ts` | Agent definitions are `.md` files with YAML frontmatter (name, role, model, tools, skills). Loaded from `agents/` dir or builtins. |
| **Event hooks** | `orchestrator.ts` | `TeamHook` callback system for 15+ event types (wave_start, task_done, rate_limit, etc.). |
| **Checkpoint/recovery** | `planning.ts` | Serializes full state (tasks, memory, wave position) to CHECKPOINT.json. Resumes after rate limits or crashes. |
| **Sandbox policy** | `sandbox.ts` | Per-agent read/write path restrictions and bash command allow/deny lists. |

---

### Frameworks & Dependencies

- **TypeScript strict mode**, ES2022 target, Node16 module resolution
- **@mariozechner/pi-agent-core** + **pi-ai** — builtin engine's Agent class + multi-provider LLM access
- **@sinclair/typebox** — JSON Schema type definitions for agent tool parameters
- **ws** — WebSocket for relay server/remote client
- **yaml** — YAML frontmatter parsing for agent definitions
- Zero web framework — dashboard is raw `node:http` + SSE

---

### Data Flow (Full Pipeline)

```
Goal → Brainstorm → Research (parallel) → Plan (DAG)
  → Wave 1: [task_a, task_b] parallel → atomic commit
  → Wave 2: [task_c] (depends on wave 1) → atomic commit
  → Verify (tsc + test + eslint) → pass? done : re-plan → retry
```

### Data Flow (Queue/Sleep Mode)

```
queue add → QUEUE.json → queue start → per-task executeTeam()
  → auto-commit → auto-push → history.json → next task
```

---

### Key Files by Size (complexity proxy)

| File | Lines | Role |
|------|-------|------|
| `orchestrator.ts` | ~1200 | Core pipeline — brainstorm, research, plan, execute, verify, replan |
| `cli.ts` | ~950 | All CLI commands, argument parsing |
| `queue.ts` | ~550 | Queue management, plan parsing, execution loop |
| `verify.ts` | ~440 | Multi-tool verification (tsc, eslint, npm test) |
| `runner.ts` | ~350 | Dual engine agent execution |
| `planning.ts` | ~350 | .planning/ directory management, checkpoint |
| `validate.ts` | ~300 | PLAN.md parsing, topological sort |

### Module Boundaries

- **Execution layer** (`runner.ts`, `tools.ts`, `sandbox.ts`) — runs individual agents, knows nothing about orchestration
- **Orchestration layer** (`orchestrator.ts`, `validate.ts`, `planning.ts`) — manages the DAG, waves, retries
- **Queue layer** (`queue.ts`, `scheduler.ts`, `history.ts`) — sequential multi-goal execution, OS scheduling
- **Infrastructure** (`dashboard.ts`, `relay.ts`, `remote.ts`) — monitoring, remote access
- **Configuration** (`agents.ts`, `skills.ts`, `context.ts`) — agent/skill definitions, runtime context