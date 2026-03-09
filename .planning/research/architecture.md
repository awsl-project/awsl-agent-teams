Now I have a comprehensive view of the codebase. Here's the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: `awsl-agent-teams`

**What it is**: A multi-agent orchestration engine that coordinates specialized AI agents (architect, coder, reviewer, tester) to execute software tasks in parallel waves. Two operational metaphors: **Conductor** (planning & parallelism) and **Guardian** (quality enforcement).

---

### File Structure & Module Boundaries

| Module | File | LOC | Responsibility |
|--------|------|-----|----------------|
| **CLI** | `cli.ts` | ~800 | Entry point, arg parsing, command dispatch |
| **Orchestrator** | `orchestrator.ts` | ~1350 | Core pipeline: brainstorm→research→plan→execute→verify→replan |
| **Runner** | `runner.ts` | ~420 | Dual-engine agent execution (`claude -p` subprocess or `pi-agent-core` in-process) |
| **Planning** | `planning.ts` | ~420 | `.planning/` directory state persistence, checkpoint save/restore |
| **Validate** | `validate.ts` | ~360 | PLAN.md parser, topological sort into waves, WAVES.md output |
| **Verify** | `verify.ts` | ~530 | Code verification (tsc, npm test, eslint) via provider pattern |
| **Queue** | `queue.ts` | ~620 | Sequential task queue with scheduling, persisted to QUEUE.json |
| **Lock** | `lock.ts` | 170 | File-based concurrency lock (`.planning/.lock`, PID-based, 30min stale timeout) |
| **Memory** | `memory.ts` | 68 | In-process key-value store for inter-agent communication |
| **Tools** | `tools.ts` | ~260 | Agent tools (read/write/edit/bash/memory/report) for builtin engine |
| **Agents** | `agents.ts` | ~200 | Agent definitions from markdown files with YAML frontmatter |
| **Skills** | `skills.ts` | ~260 | Guardian skill registry (TDD, debug, review, brainstorm, planning) |
| **Log** | `log.ts` | ~36 | Logging utility |
| **LogStream** | `logstream.ts` | ~60 | Real-time log streaming |
| **Dashboard** | `dashboard.ts` | ~250 | HTTP dashboard for sleep mode |
| **History** | `history.ts` | ~150 | HISTORY.json append-only log |
| **Install** | `install.ts` | ~350 | Skill installer for Claude Code |
| **Index** | `index.ts` | 33 | Public API re-exports |

---

### Key Patterns

1. **File-as-state**: All orchestration state persists to `.planning/` (PLAN.md, WAVES.md, STATE.md, QUEUE.json, CHECKPOINT.json, HISTORY.json, .lock). No database — just JSON/Markdown files.

2. **Dual engine**: `runner.ts` abstracts two execution backends:
   - `claude-code`: spawns `claude -p` as a subprocess (full Claude Code tooling)
   - `builtin`: uses `@mariozechner/pi-agent-core` Agent class in-process with custom tools

3. **Wave-based parallelism**: `validate.ts` topologically sorts a task DAG into waves. `orchestrator.ts` runs tasks within each wave concurrently via `runParallel()`.

4. **Event/hook system**: `TeamEvent` + `TeamHook` callbacks for lifecycle events (wave_start, task_done, rate_limit, etc.).

5. **Guardian skill injection**: Skills auto-activate by agent role (e.g., `tdd` activates for `coder`). Instructions are injected into agent system prompts.

6. **Checkpoint recovery**: On rate limits or crashes, `saveCheckpoint()` serializes task state + shared memory. `loadCheckpoint()` resumes from where it stopped.

7. **Provider pattern in verify**: `VerifyProvider` interface with detect/execute — extensible verification (tsc, npm test, eslint each as a provider).

8. **Atomic lock**: `lock.ts` uses `writeFileSync` with `wx` flag for race-safe lock acquisition. Stale detection via PID liveness check + 30min timeout.

---

### Dependencies

- **`@mariozechner/pi-agent-core`** + **`@mariozechner/pi-ai`**: Builtin engine LLM agent framework
- **`@sinclair/typebox`**: JSON schema for tool parameter validation
- **`yaml`**: Agent definition frontmatter parsing
- **`tsx`**: Dev-time TypeScript execution

### Module Dependency Graph (simplified)

```
cli.ts ─────┬──→ orchestrator.ts ──→ runner.ts ──→ pi-agent-core
            │         │                  │
            │         ├──→ planning.ts   ├──→ tools.ts ──→ memory.ts
            │         ├──→ verify.ts     └──→ skills.ts
            │         ├──→ skills.ts
            │         └──→ memory.ts
            │
            ├──→ queue.ts ──→ orchestrator.ts (full pipeline per task)
            ├──→ validate.ts
            ├──→ lock.ts
            ├──→ agents.ts
            ├──→ install.ts
            └──→ dashboard.ts ──→ logstream.ts
```

### Config / Convention

- TypeScript strict mode, ES modules with `.js` import extensions
- Target ES2022, Node16 module resolution
- All logging through `log` utility (not console.log)
- Agent definitions: markdown files in `./agents/` with YAML frontmatter