## AWSL_RESULT

### Architecture Analysis: `awsl-agent-core`

**Multi-agent orchestration engine** — TypeScript, ES modules, strict mode. Compiles to `dist/` via `tsc`.

---

### File Structure & Module Boundaries

| Module | File | LOC | Responsibility |
|--------|------|-----|----------------|
| **CLI** | `cli.ts` | 26K | Entry point, command parsing, `usage()` |
| **Orchestrator** | `orchestrator.ts` | 45K | Core pipeline: brainstorm → research → plan → execute (wave-parallel) → verify → replan |
| **Runner** | `runner.ts` | 13K | Dual-engine agent execution: `claude-code` (subprocess) or `builtin` (pi-agent-core in-process) |
| **Queue** | `queue.ts` | 20K | Sequential task queue with dependency tracking, QUEUE.json persistence |
| **Planning** | `planning.ts` | 14K | `.planning/` directory state: checkpoint, atomic commit, task parsing |
| **Validate** | `validate.ts` | 12K | PLAN.md parser + topological sort → WAVES.md |
| **Verify** | `verify.ts` | 18K | Two-stage verification: tsc + eslint + npm test + static review |
| **Agents** | `agents.ts` | 7K | Agent definition loading from YAML-frontmatter markdown files |
| **Skills** | `skills.ts` | 9K | Guardian skill registry (TDD, brainstorm, review, etc.) |
| **Tools** | `tools.ts` | 9K | Built-in agent tools: read, write, edit, bash, memory_*, report |
| **Context** | `context.ts` | 3K | `RunContext` — lifecycle-aware lock management with signal handlers |
| **Lock** | `lock.ts` | 5K | File-based concurrency lock |
| **Memory** | `memory.ts` | 2K | In-process KV store for inter-agent communication |
| **History** | `history.ts` | 5K | HISTORY.json append-only execution log |
| **Dashboard** | `dashboard.ts` | 8K | HTTP pixel dashboard for monitoring |
| **LogStream** | `logstream.ts` | 2K | Log streaming support |
| **Log** | `log.ts` | 1K | Structured logging utility |
| **Install** | `install.ts` | 12K | Skill installer into `.claude/skills/` |
| **Index** | `index.ts` | 2K | Public API re-exports |

---

### Key Architectural Patterns

1. **Conductor/Guardian separation** — Orchestrator (Conductor) handles *what* to do; Skills (Guardian) handle *how* to do it well. Skills are injected per-agent via role-based auto-activation.

2. **Wave-based parallelism** — Tasks form a DAG. `validate.ts` topologically sorts into waves. Tasks within a wave execute in parallel; waves execute sequentially.

3. **File-as-state** — All persistent state lives in `.planning/` directory: `STATE.md`, `PLAN.md`, `WAVES.md`, `QUEUE.json`, `HISTORY.json`, `CHECKPOINT.json`, `MEMORY.json`. No database.

4. **Dual engine** — `runner.ts` abstracts over two execution backends:
   - `claude-code`: spawns `claude -p` subprocess (full Claude Code capabilities)
   - `builtin`: in-process via `@mariozechner/pi-agent-core` Agent class (multi-provider)

5. **Checkpoint/recovery** — Rate limit detection + checkpoint serialization enables pause/resume across sessions.

6. **Event/hook system** — `TeamHook` callbacks for lifecycle events (`task_start`, `wave_end`, `rate_limit`, etc.)

7. **Lock-guarded execution** — `RunContext` wraps file-based locking with RAII pattern (`ctx.run(fn)`) and signal handler cleanup.

8. **Agent definitions as markdown** — Agents defined in `.md` files with YAML frontmatter (name, role, model, tools). Loaded from built-in defaults + `./agents/` directory.

---

### Dependencies

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-agent-core` | Builtin engine: Agent class, tool interface |
| `@mariozechner/pi-ai` | LLM provider abstraction (`getModel()`) |
| `@sinclair/typebox` | JSON schema validation for agent frontmatter + tool params |
| `yaml` | YAML frontmatter parsing |
| `tsx` | Dev-time TypeScript execution |

---

### Data Flow

```
CLI (cli.ts)
  ├── awsl run → Orchestrator (orchestrator.ts)
  │     ├── brainstorm phase → runAgent (runner.ts)
  │     ├── research phase   → runParallel (runner.ts)
  │     ├── plan phase       → runAgent → parseStructuredTasks (planning.ts)
  │     ├── execute phase    → waves of runParallel → atomicCommit (planning.ts)
  │     ├── verify phase     → runFullVerification (verify.ts)
  │     └── replan phase     → retry loop
  │
  ├── awsl queue → TaskQueue (queue.ts)
  │     └── executeTeam per task → Orchestrator
  │
  ├── awsl validate → validatePlan (validate.ts) → WAVES.md
  ├── awsl verify   → runFullVerification (verify.ts)
  └── awsl init     → runInstaller (install.ts)
```

### Key Design Decisions

- **No npm publish yet** — source-only install
- **Windows-compatible** — shell spawning accounts for platform
- **`unset CLAUDECODE`** required before spawning `claude -p` to avoid nested session blocking
- **Concurrency model**: file lock prevents parallel `awsl run` in same directory; within a run, wave-level parallelism via `Promise.allSettled`