## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**Multi-agent orchestration engine** — "Conductor" plans & parallelizes, "Guardian" enforces quality. Two execution engines: `claude-code` (spawns `claude -p` subprocesses) and `builtin` (in-process via pi-agent-core).

---

#### File Structure & Module Boundaries

```
src/
├── cli.ts           (37KB) — CLI entry: commands, arg parsing, service mgmt
├── orchestrator.ts  (46KB) — Core pipeline: brainstorm→research→plan→execute→verify→replan
├── runner.ts        (14KB) — Dual engine: claude-code subprocess | builtin pi-agent-core
├── planning.ts      (14KB) — .planning/ directory state persistence, checkpoint/restore
├── queue.ts         (21KB) — Task queue with QUEUE.json, sleep mode, scheduling
├── validate.ts      (12KB) — PLAN.md parser, topo-sort into execution waves (WAVES.md)
├── verify.ts        (18KB) — Two-stage: tsc + npm test + eslint, then static review
├── tools.ts         (10KB) — Agent toolset: read/write/edit/bash/memory/report (pi-agent-core AgentTool)
├── sandbox.ts       (8KB)  — Path & command restrictions per agent role
├── agents.ts        (7KB)  — Agent defs from YAML-frontmatter markdown files
├── skills.ts        (9KB)  — Guardian skill registry (TDD, debug, brainstorm, review, planning)
├── memory.ts        (2KB)  — In-process key-value SharedMemory for inter-agent communication
├── dashboard.ts     (10KB) — HTTP server: dashboard HTML + JSON API + SSE log streaming
├── relay.ts         (9KB)  — WebSocket relay for remote client management
├── remote.ts        (8KB)  — Remote client connecting local machine to dashboard
├── lock.ts          (5KB)  — File-based concurrency lock (.planning/.lock)
├── history.ts       (5KB)  — Execution history persistence (HISTORY.json)
├── logstream.ts     (2KB)  — Log line streaming utility
├── context.ts       (3KB)  — RunContext options wrapper
├── scheduler.ts     (4KB)  — OS-level scheduling (schtasks on Windows)
├── install.ts       (12KB) — Skill installer into .claude/skills/
├── log.ts           (1KB)  — Logging utility
├── index.ts         (2KB)  — Public API re-exports
```

#### Key Architectural Patterns

| Pattern | Implementation |
|---------|---------------|
| **File-as-state** | All orchestration state lives in `.planning/` (PLAN.md, WAVES.md, STATE.md, CHECKPOINT.json, QUEUE.json, HISTORY.json) — survives crashes, enables resume |
| **Wave-based parallelism** | `validate.ts` topo-sorts task DAG into waves; `orchestrator.ts` runs each wave's tasks in parallel via `runParallel()` |
| **Dual engine** | `runner.ts` abstracts over `claude-code` (subprocess) and `builtin` (pi-agent-core in-process); auto-detects which is available |
| **Shared memory** | `SharedMemory` (in-process Map) injected into agent prompts as context; serialized to checkpoint |
| **Sandbox per role** | `sandbox.ts` enforces read/write path restrictions and bash command filtering per agent |
| **Agent-as-markdown** | Agent definitions are `.md` files with YAML frontmatter (name, role, model, tools, skills) + system prompt body |
| **Guardian skills** | Skill registry injects behavioral constraints (TDD, code review, brainstorming) into agent system prompts based on role |
| **Event hooks** | `TeamHook` callback system emits typed events (wave_start, task_done, verify_done, etc.) |

#### Dependencies

- **`@mariozechner/pi-agent-core`** + **`pi-ai`** — LLM agent framework (builtin engine)
- **`@sinclair/typebox`** — JSON schema for tool parameter validation
- **`ws`** — WebSocket for relay server
- **`yaml`** — YAML frontmatter parsing in agent definitions
- **`tsx`** — Dev-time TypeScript execution

#### Data Flow

```
User goal
  → Brainstorm (Guardian skill) → Research (parallel codebase analysis)
    → Plan (structured task DAG in PLAN.md)
      → Validate (topo-sort → WAVES.md)
        → Execute (wave-parallel, each task = fresh agent context)
          → Verify (tsc/test/lint + static review)
            → Auto-fix / Replan on failure
              → Atomic commit per task
```

#### Module Boundaries

- **Orchestrator** depends on runner, planning, verify, memory, skills — it's the hub
- **Runner** is self-contained (engine abstraction only)
- **Tools/Sandbox** are injected into builtin-engine agents only (claude-code has its own tools)
- **Dashboard/Relay/Remote** form an independent HTTP+WS layer for monitoring
- **Queue** is independent persistence layer consumed by CLI and orchestrator
- **Validate/Verify** are pure-logic modules (no LLM calls)