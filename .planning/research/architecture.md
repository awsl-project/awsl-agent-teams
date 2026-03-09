Now I have a thorough understanding. Here's the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**6,385 lines of TypeScript across 22 source files. ES modules, strict mode, no tests.**

---

### Module Dependency Graph (layered)

```
CLI Layer:        cli.ts → install.ts
                     ↓
Orchestration:    orchestrator.ts (1075 lines — largest file, "Conductor")
                     ↓
Execution:        runner.ts ←→ tools.ts ←→ sandbox.ts
                     ↓
Planning:         planning.ts, validate.ts, verify.ts, queue.ts
                     ↓
Support:          agents.ts, skills.ts, memory.ts, lock.ts, context.ts
                     ↓
Infra:            log.ts, logstream.ts, history.ts, dashboard.ts
                     ↓
Public API:       index.ts (re-exports everything)
```

---

### Key Architectural Patterns

| Pattern | Implementation |
|---------|---------------|
| **Dual engine** | `runner.ts` — "claude-code" spawns `claude -p` subprocess; "builtin" uses pi-agent-core in-process with custom tools |
| **Wave-based DAG execution** | `orchestrator.ts:topologicalSort()` — tasks form a DAG, executed in parallel waves by dependency order |
| **File-as-state** | `.planning/` directory: STATE.md, PLAN.md, CHECKPOINT.json, QUEUE.json, HISTORY.json — all state externalized to disk |
| **Event/hook system** | `TeamHook` callbacks for 15+ event types (wave_start, task_done, rate_limit, etc.) |
| **Role-based sandbox** | `sandbox.ts` — per-role bash policies (allowlist for tester/reviewer/architect, denylist for coder) + write-path restrictions |
| **Agent definitions as markdown** | `agents.ts` — YAML frontmatter + markdown body, loaded from `./agents/` directory or built-in defaults |
| **In-process shared memory** | `memory.ts` — `SharedMemory` class, key-value Map with author tracking, serializable for checkpoints |
| **Guardian skills** | `skills.ts` — SkillRegistry injects behavioral prompts (TDD, brainstorm, code review) per agent role |

---

### Orchestration Pipeline (orchestrator.ts)

```
Brainstorm → Research (parallel) → Plan (LLM generates task DAG)
    → Execute (wave-by-wave, parallel within waves)
    → Verify (tsc + npm test + eslint + LLM review)
    → Auto-fix (up to 3 attempts) → Re-plan (on failure)
```

Checkpoint/resume built-in: saves after each wave, detects rate limits with regex patterns, backs off with configurable schedule.

---

### Frameworks & Dependencies

| Dependency | Purpose |
|------------|---------|
| `@mariozechner/pi-agent-core` | Agent/tool framework for builtin engine |
| `@mariozechner/pi-ai` | LLM model provider abstraction |
| `@sinclair/typebox` | JSON Schema types for tool parameter validation |
| `yaml` | Agent definition frontmatter parsing |
| `tsx` | Dev-time TypeScript execution |

---

### Module Boundaries

- **orchestrator.ts** owns the entire lifecycle — it's the only module that calls `runner.ts`, `planning.ts`, `verify.ts`, and `skills.ts` together. This is the "god module" (1075 lines).
- **runner.ts** is engine-agnostic: `runAgent()` dispatches to claude-code subprocess or pi-agent-core based on engine selection.
- **tools.ts** creates tool instances (read/write/edit/bash/memory/report) per agent, parameterized by cwd and sandbox policy. Only used by builtin engine.
- **queue.ts** is an independent subsystem for batch/sleep-mode execution — it manages its own QUEUE.json persistence and calls back into `executeTeam()`.
- **verify.ts** uses a provider pattern — pluggable verification providers (tsc, npm test, eslint) with caching.
- **planning.ts** is pure file I/O — no business logic, just `.planning/` directory management and task parsing.

---

### Key Interfaces

```typescript
// Core task unit
Task { id, description, assignee, dependencies[], status, files?, verify?, result? }

// Agent definition  
TeamAgentDef { name, role, description, model?, tools?, skills?, sandbox?, systemPrompt }

// Execution config
ExecuteOptions { engine?, sandbox?, replan?, verify?, brainstorm?, research?, maxFixAttempts?, ... }

// Sandbox
SandboxPolicy { writePaths: string[], bash: { mode: "allowlist"|"denylist"|"unrestricted", patterns[] } }
```

---

### Notable Design Decisions

1. **No test suite** — verification is done via `verify.ts` running real build commands, not unit tests of this codebase itself
2. **Orchestrator is monolithic** — brainstorm, plan, execute, verify, auto-fix, re-plan all in one 1075-line file
3. **State is all on disk** — enables crash recovery and cross-session continuity, but makes the `.planning/` directory a critical shared resource (hence `lock.ts`)
4. **Two execution engines** — claude-code for full power, builtin for portability; the abstraction boundary is clean at `runner.ts`