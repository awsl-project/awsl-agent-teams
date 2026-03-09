Now I have a complete picture. Here's the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: `awsl-agent-teams`

**What it is:** A multi-agent orchestration engine that coordinates specialized AI agents (architect, coder, reviewer, tester) to execute complex software tasks in parallel waves.

---

### Module Dependency Graph

```
cli.ts (786L) — CLI entry point, command routing
  ├── orchestrator.ts (1070L) — Core pipeline ("Conductor")
  │     ├── runner.ts (429L) — Dual-engine agent execution
  │     │     ├── tools.ts (254L) — Built-in agent tools (read/write/edit/bash/memory)
  │     │     └── skills.ts (257L) — Guardian skill injection
  │     ├── planning.ts (438L) — .planning/ state persistence
  │     ├── verify.ts (538L) — Deterministic verification (tsc/eslint/test)
  │     └── memory.ts (68L) — In-process KV store for inter-agent comms
  ├── queue.ts (621L) — Task queue / sleep mode scheduler
  ├── validate.ts (369L) — PLAN.md parser + topological sort
  ├── agents.ts (201L) — Agent definition loader (YAML frontmatter markdown)
  ├── lock.ts (169L) — File-based concurrency lock
  ├── history.ts (169L) — Execution history log
  ├── dashboard.ts (238L) — HTTP dashboard for queue monitoring
  ├── logstream.ts (67L) — Live log streaming
  ├── install.ts (392L) — Skill installer for Claude Code
  └── index.ts (32L) — Public API re-exports
```

---

### Key Architectural Patterns

1. **Conductor/Guardian separation** — Orchestrator ("Conductor") handles macro-level flow (phases, waves, retries). Skills ("Guardian") inject micro-level quality enforcement per agent via system prompts.

2. **Dual engine** — `runner.ts` supports two execution backends:
   - `claude-code`: spawns `claude -p` subprocess (full Claude Code power, no API key in skill mode)
   - `builtin`: uses `pi-agent-core` Agent class in-process (any LLM via `pi-ai`)

3. **File-as-state** — All orchestration state externalized to `.planning/` directory (PLAN.md, STATE.md, WAVES.md, VERIFICATION.md, QUEUE.json, CHECKPOINT.json, task summaries). Enables checkpoint/resume and cross-session persistence.

4. **Wave-based parallelism** — Tasks form a DAG. `topologicalSort()` computes waves of independent tasks that run in parallel via `runParallel()`.

5. **Pipeline phases** — Fixed 6-phase pipeline:
   - 0a: Brainstorm (Socratic exploration)
   - 0b: Research (parallel codebase analysis)
   - 1: Plan (structured task DAG)
   - 2: Execute (topological waves with fresh context per task)
   - 3: Verify (LLM review → deterministic checks → auto-fix → retry)
   - 4: Re-plan (dynamic recovery)

6. **Agent definitions as markdown** — Agents defined in `.md` files with YAML frontmatter (`agents/`). Schema-validated with TypeBox. Supports built-in defaults + custom overrides.

7. **Event/hook system** — `TeamHook` callbacks for 15 event types (wave_start, task_done, verify_done, etc.)

---

### Frameworks & Dependencies

| Dependency | Purpose |
|---|---|
| `@mariozechner/pi-agent-core` | Agent runtime (builtin engine) |
| `@mariozechner/pi-ai` | Multi-provider LLM access |
| `@sinclair/typebox` | JSON schema validation for tool params & agent frontmatter |
| `yaml` | YAML frontmatter parsing |
| `tsx` | Dev-time TypeScript execution |
| TypeScript 5.6+ | Strict mode, ES2022 target, Node16 modules |

---

### Key Interfaces

- **`Task`** — Unit of work: id, description, assignee, dependencies, status, files, verify criteria
- **`TeamAgentDef`** — Agent definition: name, role, model, tools, skills, systemPrompt
- **`ExecuteOptions`** — Pipeline config: engine, replan, autoCommit, verify, qualityGate, maxFixAttempts, rate limit settings
- **`SharedMemory`** — In-process Map<string, MemoryEntry> with serialize/restore for checkpointing
- **`PlanningDir`** — Interface for .planning/ directory operations (init, read, write, phaseContext)
- **`QueueTask`** — Scheduled task with status, dependencies, timing, and result tracking

---

### .planning/ Directory (Runtime State)

| File | Purpose |
|---|---|
| `PLAN.md` | Task DAG with verify criteria |
| `WAVES.md` | Computed topological wave assignments |
| `STATE.md` | Current phase, decisions, blockers |
| `VERIFICATION.md` | Deterministic check results (tsc/eslint/test) |
| `REVIEW.md` | LLM reviewer findings |
| `QUEUE.json` | Persisted task queue |
| `MEMORY.json` | Serialized shared memory |
| `HISTORY.json` | Execution history |
| `.lock` | Concurrency lock file |
| `task_N-SUMMARY.md` | Per-task execution summaries |
| `research/` | Research phase outputs |