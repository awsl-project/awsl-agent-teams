Now I have a thorough understanding of the codebase. Here's the architecture analysis:

## AWSL_RESULT

### Architecture Overview

**AWSL Agent Core** is a multi-agent orchestration engine that coordinates specialized AI agents (architect, coder, reviewer, tester) to execute software engineering tasks in parallel waves.

### File Structure & Module Boundaries

```
awsl-agent-teams/
├── src/                    # TypeScript source (strict, ES2022, Node16 modules)
│   ├── cli.ts              # CLI entry — 37+ commands (run, queue, dashboard, etc.)
│   ├── index.ts            # Public API barrel — re-exports everything
│   ├── orchestrator.ts     # **Core** — Conductor: 6-phase pipeline (brainstorm→research→plan→execute→verify→replan)
│   ├── runner.ts           # Dual engine: "claude-code" (spawns `claude -p`) or "builtin" (pi-agent-core in-process)
│   ├── planning.ts         # .planning/ directory state persistence, checkpoint save/restore
│   ├── queue.ts            # TaskQueue — sequential job queue with dependency tracking, persists to QUEUE.json
│   ├── validate.ts         # PLAN.md parser + topological sort → WAVES.md
│   ├── verify.ts           # Code verification — runs tsc, npm test, eslint; provider architecture with caching
│   ├── agents.ts           # Agent definition loader — parses markdown frontmatter from agents/*.md
│   ├── skills.ts           # Guardian skills — composable prompt injections (TDD, debug, review, brainstorm, planning)
│   ├── tools.ts            # 8 built-in agent tools: read, write, edit, bash, memory_read/write/list, report
│   ├── sandbox.ts          # Security policy — path restrictions + bash command allowlist/denylist per role
│   ├── memory.ts           # SharedMemory — in-process KV store for inter-agent communication
│   ├── context.ts          # RunContext — execution context wrapper
│   ├── lock.ts             # File-based concurrency lock (.planning/.lock)
│   ├── dashboard.ts        # HTTP server — serves pixel dashboard + JSON API + SSE log streaming
│   ├── relay.ts            # WebSocket relay server for remote client management
│   ├── remote.ts           # Remote client — connects local machine to dashboard
│   ├── history.ts          # Execution history persistence (HISTORY.json)
│   ├── logstream.ts        # LogStream — real-time log aggregation
│   ├── scheduler.ts        # OS-level scheduling (schtasks on Windows)
│   ├── install.ts          # Skill installer — writes .claude/skills/ files
│   └── log.ts              # Simple logging utility
├── agents/                 # Agent definition files (markdown with YAML frontmatter)
│   ├── fullstack-coder.md
│   └── security-reviewer.md
├── public/
│   └── dashboard.html      # Pixel art dashboard UI
├── .planning/              # Runtime state directory (file-as-state pattern)
│   ├── PLAN.md, WAVES.md, STATE.md, DESIGN.md
│   ├── QUEUE.json, HISTORY.json, MEMORY.json
│   ├── CHECKPOINT.json, VERIFICATION.md, REVIEW.md
│   └── research/           # Per-task research outputs
└── test/                   # Tests (new, untracked)
```

### Key Architectural Patterns

1. **Conductor/Guardian split**: Conductor (`orchestrator.ts`) handles *what/when* (planning, waves, parallelism). Guardian (`skills.ts`) handles *how* (TDD, review methodology) via prompt injection.

2. **Wave-based execution**: Tasks form a DAG → topological sort → parallel waves. Tasks within a wave run concurrently; waves execute sequentially.

3. **Dual engine**: `runner.ts` supports `claude-code` (spawns CLI subprocess) and `builtin` (in-process via `pi-agent-core` + `pi-ai`). Default is claude-code if available.

4. **File-as-state**: All orchestration state persists to `.planning/` directory — enables checkpoint/recovery, cross-session continuity, and CC hybrid mode.

5. **Event/Hook system**: `TeamEventType` events (research_start, wave_start, task_done, etc.) flow through `TeamHook` callbacks for dashboard/logging.

6. **Sandbox per agent**: `SandboxPolicy` enforces path restrictions and bash command filtering per agent role (allowlist/denylist modes).

7. **Inter-agent communication**: `SharedMemory` KV store injected into agent prompts as context summaries; persisted in checkpoints.

### Frameworks & Dependencies

| Dependency | Purpose |
|---|---|
| `@mariozechner/pi-agent-core` | Builtin engine — Agent class, tool interface |
| `@mariozechner/pi-ai` | LLM provider abstraction (`getModel()`) |
| `@sinclair/typebox` | JSON Schema types for tool parameters |
| `ws` | WebSocket for relay server/remote client |
| `yaml` | Agent definition frontmatter parsing |
| `tsx` | Dev-time TS execution |

### Module Dependency Graph (simplified)

```
cli.ts → orchestrator.ts → runner.ts → [pi-agent-core, tools.ts, sandbox.ts]
                         → planning.ts
                         → verify.ts
                         → skills.ts
       → queue.ts → orchestrator.ts (full pipeline per task)
       → dashboard.ts → history.ts, queue.ts, relay.ts
       → validate.ts (standalone PLAN.md parsing)
```

### Key Interfaces

- **`Task`** — DAG node: id, description, assignee, dependencies, status, files, verify criteria
- **`RunResult`** — Agent execution result: status (done/failed/blocked/rate_limited), token counts
- **`TeamResult`** — Full pipeline result: success, all tasks, summary, memory, token totals
- **`SandboxPolicy`** — Per-agent security: read/write paths, blocked file patterns, bash policy
- **`QueueTask`** — Persistent job: goal, engine, options, status, scheduling, dependencies