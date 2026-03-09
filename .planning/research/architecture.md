Here is the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**Type:** Multi-agent orchestration engine for Claude Code / LLM-powered software development teams.

---

### File Structure & Module Boundaries

```
src/
├── cli.ts           (726 lines) — CLI entry, arg parsing, all subcommands
├── orchestrator.ts  (1125 lines) — Core: Conductor pipeline (brainstorm→research→plan→execute→verify→replan)
├── runner.ts        (350 lines)  — Dual engine: spawns `claude -p` or runs pi-agent-core in-process
├── queue.ts         (500 lines)  — Task queue with dependency tracking, persistence to QUEUE.json
├── planning.ts      (350 lines)  — .planning/ state dir: read/write/checkpoint/atomic commit
├── validate.ts      (300 lines)  — PLAN.md parser + topo sort → WAVES.md
├── verify.ts        (440 lines)  — Code verification: tsc, npm test, eslint (provider pattern, cached)
├── tools.ts         (220 lines)  — Built-in agent tools: read/write/edit/bash/memory/report
├── agents.ts        (170 lines)  — Agent defs from YAML-frontmatter markdown files
├── skills.ts        (220 lines)  — Guardian skill registry (TDD, debug, brainstorm, review, planning)
├── memory.ts        (68 lines)   — In-process KV store for inter-agent communication
├── context.ts       (113 lines)  — RunContext: file-based lock + signal handler lifecycle
├── lock.ts          (116 lines)  — File-based concurrency lock (.planning/.lock)
├── history.ts       (130 lines)  — Execution history persistence (HISTORY.json)
├── dashboard.ts     (210 lines)  — HTTP server: pixel-art dashboard + SSE log streaming
├── logstream.ts     (67 lines)   — Singleton EventEmitter ring buffer for real-time logs
├── log.ts           (47 lines)   — Colored logger with role-based styling
├── install.ts       (290 lines)  — Skill installer for Claude Code ~/.claude/skills/
├── index.ts         (34 lines)   — Public API re-exports
```

### Module Dependency Graph (simplified)

```
cli.ts ──→ orchestrator.ts ──→ runner.ts ──→ pi-agent-core (builtin engine)
  │              │                  │              └─→ tools.ts ──→ memory.ts
  │              │                  └─→ skills.ts
  │              ├──→ planning.ts
  │              ├──→ validate.ts (topo sort)
  │              └──→ verify.ts
  ├──→ queue.ts ──→ orchestrator.ts (full pipeline per queue task)
  ├──→ context.ts ──→ lock.ts
  ├──→ dashboard.ts ──→ history.ts, logstream.ts, queue.ts
  └──→ install.ts
```

### Key Architectural Patterns

1. **Conductor/Guardian split** — Conductor (orchestrator.ts) handles *what/when* (phases, waves, parallelism). Guardian (skills.ts) handles *how* (TDD, review methodology injected into agent prompts).

2. **Dual engine** — `claude-code` engine spawns `claude -p` subprocesses (full Claude Code power, no API key). `builtin` engine runs pi-agent-core in-process with custom tools (any LLM via pi-ai).

3. **File-as-state** — All persistent state lives in `.planning/` as human-readable files (PLAN.md, WAVES.md, STATE.md, QUEUE.json, CHECKPOINT.json, VERIFICATION.md). No database.

4. **Wave-based execution** — Tasks form a DAG. `topologicalSort()` computes parallel waves. Tasks within a wave run concurrently; waves execute sequentially.

5. **Event/hook system** — `TeamHook` callbacks receive typed events (task_start, wave_end, rate_limit, etc.) for extensibility.

6. **Agent definitions as markdown** — Agents defined in `agents/*.md` with YAML frontmatter (name, role, model, tools, skills) + system prompt body. Loaded from built-in defaults + user dirs.

7. **Verification provider pattern** — `verify.ts` uses a provider interface (`detect()` + `execute()`) with caching (5min TTL). Runs tsc, npm test, eslint deterministically.

8. **Checkpoint/recovery** — Orchestrator saves checkpoints after each wave, restores SharedMemory + task status on resume. Rate limit detection triggers exponential backoff.

### Frameworks & Dependencies

| Dependency | Purpose |
|---|---|
| `@mariozechner/pi-agent-core` | Agent runtime for builtin engine |
| `@mariozechner/pi-ai` | Multi-provider LLM access (getModel) |
| `@sinclair/typebox` | JSON Schema for tool parameter definitions |
| `yaml` | YAML frontmatter parsing in agent .md files |
| `tsx` | Dev-time TypeScript execution |
| `typescript` | Build (strict mode, ES2022, Node16 modules) |

### Key Interfaces

- **`Task`** — `{id, description, assignee, dependencies, status, files, verify, result}`
- **`TeamAgentDef`** — `{name, role, model, tools, skills, systemPrompt}`
- **`RunResult`** — `{agent, status, result, turns, inputTokens, outputTokens, costUsd}`
- **`ExecuteOptions`** — Pipeline config (replan, autoCommit, verify, brainstorm, engine, maxRetries, rateLimitBackoff)
- **`QueueTask`** — Persistent queued task with scheduling, dependencies, status tracking

### State Files (.planning/)

| File | Purpose |
|---|---|
| PLAN.md | Structured task plan (LLM-generated) |
| WAVES.md | Computed topological waves (code-generated) |
| STATE.md | Project decisions, blockers, position |
| QUEUE.json | Task queue persistence |
| CHECKPOINT.json | Recovery checkpoint (memory + task states) |
| VERIFICATION.md | Test/lint/typecheck results |
| REVIEW.md | Static review findings |
| HISTORY.json | Execution history for dashboard |
| research/ | Per-agent research outputs |
| task_N-SUMMARY.md | Per-task execution summaries |