Now I have a comprehensive view. Here's the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: `awsl-agent-core`

**What it is:** A multi-agent orchestration engine that coordinates specialized AI agents (architect, coder, reviewer, tester) to execute software engineering tasks in parallel waves.

---

### Module Dependency Graph

```
cli.ts (entry)
  ├── orchestrator.ts (core engine)
  │     ├── runner.ts (agent execution)
  │     │     ├── tools.ts (agent tooling: read/write/edit/bash/memory)
  │     │     ├── sandbox.ts (path/command restrictions)
  │     │     ├── memory.ts (in-process KV store)
  │     │     └── skills.ts (Guardian skill injection)
  │     ├── planning.ts (.planning/ state persistence)
  │     ├── validate.ts (PLAN.md → DAG topo-sort → waves)
  │     └── verify.ts (tsc/test/lint verification providers)
  ├── queue.ts (task queue with QUEUE.json persistence)
  │     ├── scheduler.ts (OS-level scheduling: schtasks/at)
  │     └── history.ts (execution history log)
  ├── dashboard.ts (HTTP server + SSE + JSON API)
  │     ├── relay.ts (WebSocket relay for remote clients)
  │     └── projects.ts (global project registry ~/.awsl/)
  ├── remote.ts (WebSocket client → relay)
  ├── summary.ts (session activity summarizer)
  └── install.ts (skill installer into .claude/skills/)
```

---

### Key Architectural Patterns

1. **Dual Engine** (`runner.ts`): Two execution backends:
   - `claude-code`: spawns `claude -p` subprocess (full Claude Code power)
   - `builtin`: in-process via `pi-agent-core` Agent class (any LLM provider)

2. **File-as-State** (`.planning/` directory):
   - `PLAN.md` → task DAG definition
   - `WAVES.md` → computed execution order
   - `QUEUE.json` → persistent task queue
   - `CHECKPOINT.json` → crash recovery
   - `STATE.md`, `REVIEW.md`, `VERIFICATION.md` → phase outputs
   - `HISTORY.json` → execution log

3. **Wave-based Parallelism** (`orchestrator.ts`):
   - Tasks form a DAG with explicit dependencies
   - `validate.ts` performs topological sort → groups into waves
   - Each wave runs tasks in parallel; waves run sequentially

4. **Conductor + Guardian separation**:
   - **Conductor** (orchestrator): macro-level planning, wave scheduling, re-planning on failure
   - **Guardian** (skills): micro-level quality — TDD, code review, brainstorming injected per-agent

5. **Agent Definitions** (`agents/` dir): Markdown files with YAML frontmatter → parsed by `agents.ts`. Fields: name, role, model, tools, skills, sandbox policy, system prompt.

6. **Sandboxing** (`sandbox.ts`): Per-agent path restrictions (read/write allow/deny globs) and bash command filtering.

7. **Event/Hook System** (`orchestrator.ts`): `TeamHook` callback receives typed events (`wave_start`, `task_done`, `rate_limit`, etc.) for dashboard integration.

---

### Frameworks & Dependencies

| Dependency | Purpose |
|---|---|
| `@mariozechner/pi-agent-core` | Agent runtime for builtin engine |
| `@mariozechner/pi-ai` | LLM provider abstraction (`getModel()`) |
| `@sinclair/typebox` | JSON Schema for tool parameters |
| `yaml` | YAML frontmatter parsing |
| `ws` | WebSocket for relay/remote |
| `tsx` | Dev-time TS execution |

---

### Module Boundaries Summary

| Layer | Modules | Responsibility |
|---|---|---|
| **CLI** | `cli.ts` | Command parsing, user-facing output |
| **Orchestration** | `orchestrator.ts`, `validate.ts`, `queue.ts` | Task DAG, waves, queue management |
| **Execution** | `runner.ts`, `tools.ts`, `sandbox.ts` | Agent spawning, tool provision, security |
| **State** | `planning.ts`, `memory.ts`, `history.ts` | Persistence, inter-agent communication |
| **Quality** | `verify.ts`, `skills.ts` | Verification providers, Guardian skills |
| **Infrastructure** | `dashboard.ts`, `relay.ts`, `remote.ts`, `scheduler.ts`, `projects.ts` | HTTP dashboard, WebSocket, OS scheduling |
| **Utilities** | `log.ts`, `logstream.ts`, `context.ts`, `install.ts`, `summary.ts` | Logging, session context, skill installation |
| **Public API** | `index.ts` | Re-exports all public types and functions |