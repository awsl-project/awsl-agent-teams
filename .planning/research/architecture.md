Now I have a complete picture. Here is the architecture analysis:

---

## AWSL Agent Teams — Architecture Analysis

### Overview

Multi-agent orchestration engine (TypeScript, ES modules, strict mode) that coordinates specialized AI agents to execute software tasks. Two conceptual layers: **Conductor** (planning, parallelism, wave execution) and **Guardian** (quality enforcement via skill injection).

### Module Boundaries & Dependencies

```
CLI (cli.ts)
 ├── Orchestrator (orchestrator.ts)  ← core pipeline engine
 │    ├── Runner (runner.ts)         ← dual engine: claude-code | builtin
 │    │    ├── Tools (tools.ts)      ← builtin agent tools (read/write/edit/bash/memory)
 │    │    └── Sandbox (sandbox.ts)  ← path + command restrictions
 │    ├── Planning (planning.ts)     ← .planning/ state persistence
 │    ├── Skills (skills.ts)         ← Guardian methodology injection
 │    ├── Memory (memory.ts)         ← in-process KV store for inter-agent comms
 │    └── Verify (verify.ts)         ← code verification (tsc/test/lint)
 ├── Queue (queue.ts)                ← sequential task queue with deps
 │    ├── Scheduler (scheduler.ts)   ← OS-level scheduling (schtasks)
 │    └── History (history.ts)       ← execution history persistence
 ├── Dashboard (dashboard.ts)        ← HTTP server + SSE + JSON API
 │    └── Relay (relay.ts)           ← WebSocket relay for remote clients
 ├── Remote (remote.ts)              ← connects local machine to remote dashboard
 ├── Agents (agents.ts)              ← markdown+YAML frontmatter agent definitions
 ├── Validate (validate.ts)          ← PLAN.md parser + topological sort
 ├── Lock (lock.ts)                  ← file-based concurrency lock
 └── Install (install.ts)            ← Claude Code skill installer
```

### Key Architectural Patterns

1. **Dual Engine** (`runner.ts`): `claude-code` spawns `claude -p` subprocess per task (full CC power); `builtin` uses `pi-agent-core` in-process with custom tools. Auto-detects which is available.

2. **Wave-Based Execution** (`orchestrator.ts`): Tasks form a DAG. Topological sort produces waves of independent tasks that execute in parallel. Pipeline phases: brainstorm → research → plan → execute → verify → auto-fix → retry → replan.

3. **File-as-State** (`.planning/` directory): All orchestration state persisted to disk — `STATE.md`, `PLAN.md`, `WAVES.md`, `CHECKPOINT.json`, `QUEUE.json`, `HISTORY.json`. Enables checkpoint/recovery across sessions and rate limit interruptions.

4. **Guardian Skills** (`skills.ts`): Role-based skill injection. Skills (TDD, debugging, review, brainstorm, etc.) auto-activate based on agent role and inject methodology instructions into system prompts.

5. **Agent Definitions** (`agents.ts` + `agents/` dir): Markdown files with YAML frontmatter define agents. Schema: name, role, model, tools, skills, sandbox policy, system prompt. Loads from built-in defaults + custom `agents/` dirs.

6. **Sandbox Policy** (`sandbox.ts`): Per-agent path restrictions and bash command filtering. Modes: allowlist, denylist, unrestricted. Blocks sensitive files (.env, credentials, keys).

7. **Event/Hook System** (`orchestrator.ts`): `TeamHook` callbacks for events like `wave_start`, `task_done`, `rate_limit`, `checkpoint` — enables UI integration and monitoring.

### Frameworks & Dependencies

| Dependency | Purpose |
|---|---|
| `@mariozechner/pi-agent-core` | Builtin engine — Agent class, tool interface |
| `@mariozechner/pi-ai` | LLM provider abstraction (`getModel()`) |
| `@sinclair/typebox` | JSON Schema for tool parameter validation |
| `ws` | WebSocket for relay server/remote client |
| `yaml` | YAML frontmatter parsing in agent definitions |
| `tsx` | Dev-time TypeScript execution |

### Data Flow

```
User Goal
  → Brainstorm (Socratic exploration)
  → Research (parallel codebase analysis)
  → Plan (structured task DAG → PLAN.md)
  → Validate (topo sort → WAVES.md)
  → Execute (wave-parallel agent runs)
  → Verify (tsc + tests + lint)
  → Auto-fix / Replan (on failure)
  → Atomic Commit
```

### File Structure Summary

- **`src/`** — 25 TypeScript source files (~250KB total)
- **`agents/`** — Custom agent definitions (fullstack-coder, security-reviewer)
- **`public/`** — Dashboard HTML (single-page pixel art UI)
- **`test/`** — 3 test files (new, untracked)
- **`bench*/`** — Multiple benchmark directories
- **`.planning/`** — Runtime state directory (gitignored partially)
- **`memory/`** — Shared memory persistence directory

### Key Interfaces

- `Task` — DAG node: id, description, assignee, dependencies, status, files, verify criteria
- `TeamAgentDef` — Agent definition: name, role, model, tools, skills, sandbox, systemPrompt
- `RunResult` — Agent execution result: status, result text, token counts, cost
- `SandboxPolicy` — Security boundary: read/write paths, bash command filtering
- `QueueTask` — Queued task: goal, engine, options, scheduling, dependencies

## AWSL_RESULT

Architecture analysis complete. The codebase is a ~250KB TypeScript ES module project implementing a multi-agent orchestration engine with:
- **Conductor/Guardian** dual-layer architecture (planning vs quality enforcement)
- **Dual engine** support (claude-code subprocess vs builtin pi-agent-core)
- **Wave-based parallel execution** with DAG dependency resolution
- **File-as-state** persistence in `.planning/` for crash recovery
- **Sandbox policies** for agent security isolation
- **Dashboard + WebSocket relay** for monitoring and remote management

Key files: `orchestrator.ts` (45KB, core pipeline), `cli.ts` (37KB, CLI), `queue.ts` (21KB, task queue), `verify.ts` (17KB, verification), `runner.ts` (14KB, dual engine), `planning.ts` (14KB, state persistence).