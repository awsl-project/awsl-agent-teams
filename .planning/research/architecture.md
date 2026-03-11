Now I have a comprehensive understanding of the codebase. Here's the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

---

### Tech Stack
- **Language**: TypeScript strict mode, ES2022 target, Node16 modules
- **Runtime**: Node.js (ESM with `.js` extension imports)
- **Dependencies**: `@mariozechner/pi-agent-core` + `pi-ai` (LLM agent framework), `@sinclair/typebox` (runtime schema validation), `ws` (WebSocket), `yaml` (frontmatter parsing)
- **Build**: `tsc` → `dist/`, no bundler

---

### Module Architecture (34 source files)

**Core Pipeline** (Conductor/Guardian pattern):
| Module | Role |
|--------|------|
| `orchestrator.ts` | **Conductor** — wave-based DAG execution: brainstorm → research → plan → execute → verify → replan |
| `runner.ts` | Dual engine: `claude-code` (spawns `claude -p` subprocess) or `builtin` (pi-agent-core in-process) |
| `planning.ts` | File-as-state persistence to `.planning/` directory |
| `validate.ts` | PLAN.md parser + topological sort → WAVES.md |
| `verify.ts` | Two-stage quality gate: full verification + static review |
| `skills.ts` | **Guardian** — composable skill injection (TDD, debug, review, brainstorm, planning, subagent-dev) auto-activated by agent role |

**Agent System**:
| Module | Role |
|--------|------|
| `agents.ts` | Loads agent definitions from `.md` files with YAML frontmatter; schema validated via TypeBox |
| `tools.ts` | Built-in tools for builtin engine: read, write, edit, bash, memory_read/write/list, send_message, report |
| `memory.ts` | In-process `SharedMemory` KV store for inter-agent communication, serializable for checkpoints |
| `context.ts` | `RunContext` — lock lifecycle with SIGINT/SIGTERM cleanup |
| `sandbox.ts` | Per-agent sandbox policy (path + bash command restrictions) |

**Queue & Scheduling**:
| Module | Role |
|--------|------|
| `queue.ts` | `TaskQueue` — persists to `QUEUE.json`, sequential execution with dependency tracking |
| `scheduler.ts` | OS-level scheduling (Windows `schtasks` / Unix `at`) |
| `discuss.ts` | Multi-agent discussion mode — parallel analysis → debate rounds → synthesis |

**Dashboard & Remote**:
| Module | Role |
|--------|------|
| `dashboard.ts` | HTTP server serving pixel art HTML dashboard + JSON API + SSE log streaming |
| `relay.ts` | WebSocket relay server (attached to dashboard) for remote client management |
| `remote.ts` | Remote client — connects local machine to dashboard relay |
| `logstream.ts` | SSE-compatible log stream |

**Utility**:
| Module | Role |
|--------|------|
| `cli.ts` | CLI entry point (`awsl` command) — ~20 subcommands |
| `index.ts` | Public API barrel export (40+ exports) |
| `lock.ts` | File-based concurrency lock |
| `history.ts` | Execution history tracking |
| `summary.ts` | Session activity summarization |
| `projects.ts` | Global project registry (`~/.awsl/projects.json`) |
| `install.ts` | Skill installer for `.claude/skills/` |
| `log.ts` | Logging utility |

---

### Key Patterns

1. **Conductor/Guardian separation**: Conductor (`orchestrator.ts`) handles *what* and *when*; Guardian (`skills.ts`) handles *how* via prompt injection
2. **File-as-state**: All orchestration state lives in `.planning/` (PLAN.md, WAVES.md, STATE.md, QUEUE.json, CHECKPOINT.json, HISTORY.json) — survives process crashes and context resets
3. **Wave-based parallelism**: Tasks form a DAG → topologically sorted into waves → each wave runs agents in parallel
4. **Dual engine**: Same orchestrator drives both `claude -p` subprocesses and in-process pi-agent-core agents
5. **Event/Hook system**: `TeamHook` callbacks for all lifecycle events (research, plan, wave, task, verify, checkpoint, rate_limit)
6. **Checkpoint/recovery**: Serializes SharedMemory + task state → `CHECKPOINT.json` → resumes after rate limits or crashes
7. **Agent definitions as markdown**: `.md` files with YAML frontmatter → validated against TypeBox schema → system prompt is the markdown body
8. **Lock-based concurrency**: File lock prevents multiple orchestration runs; `RunContext` auto-releases on signals/exceptions

---

### Data Flow

```
CLI / CC Skill
    ↓
orchestrator.executeTeam(goal, agents, options)
    ↓
[brainstorm] → [research (parallel)] → [plan → PLAN.md]
    ↓
validate → topological sort → waves
    ↓
for each wave:
    runner.runParallel(tasks) → [claude-code | builtin]
        ↓
    agents communicate via SharedMemory
    ↓
    atomicCommit per wave
    ↓
verify → quality gate → replan if needed
```

---

### File Structure Summary

```
agents/          → Agent .md definitions (fullstack-coder, security-reviewer)
public/          → dashboard.html (pixel art UI)
src/             → 34 TypeScript files (20 modules + 14 test files)
.planning/       → Runtime state directory
test/            → Integration tests
tests/           → Additional tests
memory/          → Persistent agent memory
bench*/          → Benchmark directories
```