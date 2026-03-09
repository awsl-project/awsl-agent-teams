Now I have a thorough understanding of the codebase. Let me write the architecture analysis.

## AWSL_RESULT

### Architecture Analysis: `awsl-agent-core`

**6,144 LOC TypeScript** — Multi-agent orchestration engine with dual execution backends.

---

### Module Map

| Module (LOC) | Role | Key Exports |
|---|---|---|
| `orchestrator.ts` (1070) | **Core** — Conductor pattern: brainstorm → research → plan → execute → verify → auto-fix → retry → replan | `executeTeam()`, `planOnly()`, `Task`, `TeamResult` |
| `cli.ts` (786) | CLI entry point — `awsl` binary | `usage()`, subcommands: run, validate, verify, review, queue, dashboard, init |
| `queue.ts` (621) | Task queue with persistence, scheduling (`--at`), dependency chains | `TaskQueue` class, `QueueData`, `QueueTask` |
| `verify.ts` (538) | Code verification — runs tsc, npm test, eslint via provider architecture + result cache | `runFullVerification()`, `runStaticReview()` |
| `planning.ts` (438) | `.planning/` directory state persistence, checkpoint save/restore | `createPlanningDir()`, `parseStructuredTasks()`, `saveCheckpoint()` |
| `runner.ts` (429) | Dual-engine agent execution | `runAgent()`, `runParallel()`, `detectEngine()` |
| `validate.ts` (369) | PLAN.md parser + topological sort + file-conflict detection | `validatePlan()` |
| `install.ts` (392) | Skill installer (writes to `.claude/skills/`) | `runInstaller()` |
| `skills.ts` (257) | Guardian skills — composable methodology injection by role | `SkillRegistry`, 6 built-in skills |
| `tools.ts` (254) | Built-in agent tools (read/write/edit/bash/memory/report) for `builtin` engine | `createAgentTools()` |
| `agents.ts` (201) | Agent definitions — YAML frontmatter markdown parser | `loadAgents()`, `TeamAgentDef` |
| `dashboard.ts` (238) | HTTP dashboard for queue monitoring | `startDashboard()` |
| `history.ts` (169) | Execution history persistence | `appendHistory()`, `loadHistory()` |
| `memory.ts` (68) | In-process shared KV store for inter-agent communication | `SharedMemory` class |
| `logstream.ts` (67) | Real-time log streaming | `LogStream`, `getLogStream()` |
| `log.ts` (46) | Logging utility | `log.info/warn/error/section()` |

---

### Key Architectural Patterns

1. **Conductor + Guardian split**: Conductor (`orchestrator.ts`) handles *what/when* (planning, waves, parallelism). Guardian (`skills.ts`) handles *how* (TDD, debugging, review) via prompt injection based on agent role.

2. **Dual engine**: `runner.ts` supports two backends:
   - `claude-code`: spawns `claude -p` subprocess per task (full Claude Code capabilities)
   - `builtin`: in-process via `@mariozechner/pi-agent-core` Agent class + `@mariozechner/pi-ai` model providers

3. **Topological wave execution**: Tasks form a DAG. `topologicalSort()` computes parallel waves. Tasks within a wave run concurrently up to `maxConcurrency`.

4. **File-as-state**: All important state persists to `.planning/` directory — PLAN.md, DESIGN.md, WAVES.md, VERIFICATION.md, CHECKPOINT.json, QUEUE.json, STATE.md. Enables checkpoint recovery across sessions.

5. **Event/hook system**: 15 event types (`TeamEventType`) with async hook callbacks for external integration.

6. **6-phase pipeline**: 
   - 0a: Brainstorm (optional, Socratic exploration)
   - 0b: Research (parallel codebase analysis)
   - 1: Plan (LLM generates JSON task DAG → parsed + validated)
   - 2: Execute (wave-based parallel execution with fresh context per task)
   - 3: Verify (reviewer agent + `runFullVerification()` code checks)
   - 3b: Auto-fix loop (coder fixes failures, up to 3 attempts)
   - 4: Retry + replan on persistent failures

7. **Agent definitions as markdown**: YAML frontmatter + body system prompt, loaded from `agents/` directory or built-in defaults. Custom agents via `--agents-dir`.

8. **Verification provider architecture**: `verify.ts` uses pluggable providers (tsc, npm test, eslint) with auto-detection and 5-minute result cache.

---

### Dependencies

- `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai` — builtin engine's LLM agent framework
- `@sinclair/typebox` — tool parameter schemas (for builtin engine tools)
- `yaml` — agent definition frontmatter parsing
- `tsx` — dev-time TypeScript execution

---

### Data Flow

```
User goal → CLI (cli.ts)
  → executeTeam() (orchestrator.ts)
    → loadAgents() (agents.ts) — load agent definitions
    → SharedMemory (memory.ts) — inter-agent KV store
    → createPlanningDir() (planning.ts) — state directory
    → runAgent(planner) → produces JSON task DAG
    → parseStructuredTasks() → Task[]
    → topologicalSort() → Task[][] waves
    → for each wave: runParallel() (runner.ts)
      → per task: runAgent(assignee) with focused prompt
      → atomicCommit() on success
    → runFullVerification() (verify.ts) — tsc/test/eslint
    → auto-fix loop → retry → replan
  → TeamResult
```

### Module Boundaries

- **orchestrator** depends on: runner, planning, memory, skills, verify
- **runner** depends on: agents, memory, tools, skills, log
- **cli** depends on: all modules (top-level entry point)
- **queue** depends on: orchestrator, runner, agents, lock, history
- **verify** depends on: log (standalone — no LLM dependency)
- **validate** depends on: log (standalone — pure parsing)
- **memory**, **log**, **logstream** — leaf modules, no internal dependencies