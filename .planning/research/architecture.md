## Architecture Analysis: awsl-agent-teams

### Overview

Multi-agent orchestration engine that coordinates specialized AI agents (architect, coder, reviewer, tester) to execute complex software tasks via wave-based parallelism.

### Tech Stack

- **Language**: TypeScript strict mode, ES2022, ESM (`.js` extension imports)
- **Runtime**: Node.js
- **Dependencies**: `@mariozechner/pi-agent-core` + `pi-ai` (builtin LLM engine), `@sinclair/typebox` (schema validation), `ws` (WebSocket), `yaml` (frontmatter parsing)
- **Build**: `tsc` → `dist/`
- **No test framework** — tests are standalone `.test.ts` files with manual assertions

### Module Architecture (3 layers)

**Layer 1 — Core Engine**
| Module | Responsibility |
|---|---|
| `orchestrator.ts` (47KB) | **Conductor** — wave-based DAG execution: brainstorm → research → plan → execute → verify → replan |
| `runner.ts` (15KB) | Dual engine: spawns `claude -p` (claude-code) or runs `pi-agent-core` Agent in-process (builtin) |
| `planning.ts` (14KB) | `.planning/` directory state persistence, checkpoint save/restore, task parser |
| `validate.ts` (12KB) | PLAN.md parser + topological sort → WAVES.md |
| `verify.ts` (18KB) | Two-stage verification: tsc + npm test + eslint + static review |

**Layer 2 — Infrastructure**
| Module | Responsibility |
|---|---|
| `memory.ts` (2KB) | In-process `Map<string, MemoryEntry>` KV store for inter-agent communication |
| `tools.ts` (10KB) | Built-in agent tools: read, write, edit, bash, memory_read/write/list, report |
| `agents.ts` (7KB) | Agent definitions from YAML-frontmatter markdown files |
| `skills.ts` (9KB) | Guardian skill registry (TDD, brainstorm, code review, etc.) |
| `sandbox.ts` (8KB) | Path/command sandboxing policy for agent tools |
| `lock.ts` (5KB) | File-based concurrency lock (`.planning/.lock`) |
| `context.ts` (3KB) | RunContext — encapsulates cwd, engine, agents for a run |
| `log.ts` (1KB) | Logging utility |
| `logstream.ts` (2KB) | SSE log streaming |

**Layer 3 — User-Facing**
| Module | Responsibility |
|---|---|
| `cli.ts` (46KB) | CLI entry point (`awsl` command) — all subcommands |
| `queue.ts` (24KB) | Task queue with QUEUE.json persistence, sleep-mode execution |
| `dashboard.ts` (20KB) | HTTP server + REST API for pixel art dashboard |
| `history.ts` (6KB) | HISTORY.json — append-only execution log |
| `summary.ts` (12KB) | Session summary generation (overnight run reports) |
| `discuss.ts` (8KB) | Multi-agent discussion/debate mode |
| `projects.ts` (10KB) | Global project registry (`~/.awsl/projects.json`) |
| `relay.ts` (9KB) | WebSocket relay for remote client management |
| `remote.ts` (8KB) | Remote client connecting local machine to dashboard |
| `scheduler.ts` (4KB) | OS-level scheduling (`schtasks` / `at`) |
| `install.ts` (12KB) | Skill installer into `.claude/skills/` |

### Key Patterns

1. **File-as-state**: All durable state lives in `.planning/` (PLAN.md, WAVES.md, QUEUE.json, CHECKPOINT.json, STATE.md, HISTORY.json) — no database
2. **Wave-based parallelism**: Tasks form a DAG; topological sort groups them into waves; tasks within a wave run in parallel
3. **Dual engine**: `claude-code` engine spawns `claude -p` as subprocess; `builtin` engine uses pi-agent-core in-process with custom tools
4. **Agent = markdown file**: Agent definitions are `.md` files with YAML frontmatter (name, role, model, tools, skills) + system prompt body
5. **Guardian skills**: Injected behaviors (TDD, brainstorm, code review) that modify agent prompts based on role
6. **Checkpoint/recovery**: Rate limit detection → checkpoint → resume from last good state
7. **Event hooks**: `TeamHook` callback for lifecycle events (wave_start, task_done, verify_done, etc.)
8. **Public API via `index.ts`**: All exports re-exported from barrel file

### Data Flow

```
User goal → CLI → Queue/Orchestrator
  → Brainstorm (architect agent)
  → Research (parallel codebase scan)
  → Plan (structured task DAG → PLAN.md)
  → Execute (wave-by-wave, parallel agents per wave)
  → Verify (tsc + tests + lint + static review)
  → Auto-fix / Replan on failure
  → Atomic git commit per task
  → History append
```

### File Structure

```
awsl-agent-teams/
├── src/           # 35 TypeScript files (~350KB total)
├── agents/        # Custom agent .md definitions
├── public/        # dashboard.html (single-page pixel art UI)
├── .planning/     # Runtime state (gitignored artifacts)
├── memory/        # Persistent memory for builtin engine
├── scripts/       # Utility scripts
├── bench*/        # Benchmark directories
├── test/          # Additional test files
└── dist/          # Compiled JS output
```

## AWSL_RESULT

Analyzed the full codebase architecture of `awsl-agent-teams`:

- **35 TypeScript source files** organized in 3 layers: core engine (orchestrator, runner, planning, validate, verify), infrastructure (memory, tools, agents, skills, sandbox, lock), and user-facing (CLI, queue, dashboard, history, summary, discuss, projects, relay, remote)
- **Key pattern**: file-as-state in `.planning/`, wave-based DAG parallelism, dual LLM engine (claude-code subprocess vs pi-agent-core in-process), agent definitions as YAML-frontmatter markdown
- **Dependencies**: pi-agent-core, pi-ai, typebox, ws, yaml
- **No files produced** — research-only analysis