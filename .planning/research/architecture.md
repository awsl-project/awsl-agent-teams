Now I have a complete picture. Here's the architecture analysis:

## AWSL_RESULT

### Architecture Overview

**AWSL Agent Core** is a multi-agent orchestration engine built in TypeScript (strict mode, ES modules, Node16 resolution). It coordinates multiple AI agents to plan, execute, verify, and fix software engineering tasks.

### Module Dependency Graph

```
cli.ts ──→ orchestrator.ts ──→ runner.ts ──→ pi-agent-core (builtin engine)
  │              │                  │              └→ claude -p subprocess (claude-code engine)
  │              │                  ├→ tools.ts (read/write/edit/bash/memory/report)
  │              │                  ├→ skills.ts (Guardian quality injection)
  │              │                  └→ logstream.ts (SSE broadcast)
  │              ├→ planning.ts ──→ .planning/ (file-as-state)
  │              ├→ memory.ts (in-process KV store)
  │              └→ verify.ts (tsc/eslint/npm test)
  │
  ├→ queue.ts ──→ orchestrator.ts (full team per queue task)
  │              └→ history.ts ──→ .planning/HISTORY.json
  │
  ├→ dashboard.ts ──→ history.ts, queue.ts, logstream.ts
  │                    └→ public/dashboard.html (pixel art UI)
  │
  ├→ validate.ts (PLAN.md parser + topo sort)
  ├→ lock.ts (file-based .planning/.lock)
  ├→ agents.ts (markdown+YAML frontmatter loader)
  └→ install.ts (skill installer)
```

### Key Architectural Patterns

| Pattern | Implementation |
|---------|---------------|
| **Dual engine** | `runner.ts` — `claude-code` (spawns `claude -p`) or `builtin` (pi-agent-core in-process) |
| **File-as-state** | All persistent state in `.planning/` (PLAN.md, WAVES.md, QUEUE.json, HISTORY.json, CHECKPOINT.json) |
| **Wave execution** | `orchestrator.ts` — topological sort of task DAG → parallel waves |
| **Conductor/Guardian split** | Conductor (orchestrator) handles *what/when*, Guardian (skills) handles *how* via prompt injection |
| **Shared memory** | `memory.ts` — in-process `Map<string, MemoryEntry>` for inter-agent communication |
| **Event hooks** | `TeamHook` callbacks for lifecycle events (task_start, wave_end, checkpoint, etc.) |
| **SSE log streaming** | `logstream.ts` singleton EventEmitter → `dashboard.ts` `/api/logs` endpoint |
| **File-based locking** | `lock.ts` — prevents concurrent orchestrations via `.planning/.lock` |

### Orchestration Pipeline (orchestrator.ts)

```
0a. Brainstorm → 0b. Research → 1. Plan → 2. Execute (waves) → 3. Verify → 4. Re-plan (on failure)
```

- **Brainstorm**: Socratic exploration via Guardian skill
- **Research**: Parallel codebase analysis agents
- **Plan**: LLM generates structured task DAG → `parseStructuredTasks()` parses it
- **Execute**: Topological waves, each task gets fresh agent context, atomic git commits
- **Verify**: `verify.ts` runs tsc/eslint/npm test + static review, quality gate blocks on critical findings
- **Re-plan**: Dynamic recovery — failed tasks get re-planned with error context

### Key Interfaces

- **`Task`** — `{id, description, assignee, dependencies[], status, files[], verify, result}`
- **`TeamAgentDef`** — `{name, role, systemPrompt, model?, tools?, skills[]}`
- **`QueueTask`** — Wraps a goal for sleep-mode sequential execution
- **`Skill`** — `{name, activatesFor: role[], instructions}` — auto-injected per agent role

### External Dependencies

- `@mariozechner/pi-agent-core` — Agent class, tool interface (builtin engine)
- `@mariozechner/pi-ai` — LLM provider abstraction (`getModel()`)
- `@sinclair/typebox` — JSON Schema for tool parameter definitions
- `tsx` — TypeScript execution for dev mode

### Frontend

Single-file `public/dashboard.html` — pixel art themed dashboard consuming REST APIs (`/api/history`, `/api/stats`, `/api/queue`, `/api/logs` SSE). Queue mutations via POST/DELETE endpoints.

### Public API Surface (`index.ts`)

Re-exports everything needed for programmatic use: `executeTeam`, `planOnly`, `loadAgents`, `SharedMemory`, `TaskQueue`, `SkillRegistry`, all tools, history, dashboard, lock, planning, validation, and verification.