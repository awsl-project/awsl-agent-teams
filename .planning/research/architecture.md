Now I have a thorough understanding. Here's the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: AWSL Agent Teams

#### Overview
Multi-agent orchestration engine that coordinates specialized AI agents (architect, coder, reviewer, tester) to execute complex software tasks. Dual-engine: spawns `claude -p` subprocesses or uses `pi-agent-core` in-process.

#### File Structure & Module Boundaries

**Core Pipeline** (data flows top→bottom):
| Module | Responsibility | Key Exports |
|---|---|---|
| `cli.ts` (46KB) | CLI entry point, command dispatch | `usage()`, command handlers |
| `orchestrator.ts` (46KB) | **Conductor** — wave-based task DAG execution: brainstorm→research→plan→execute→verify→replan | `executeTeam()`, `planOnly()`, `Task`, `TeamEvent` |
| `runner.ts` (14KB) | Agent execution, dual-engine (`claude-code` spawns CLI, `builtin` uses pi-agent-core) | `runAgent()`, `runParallel()`, `detectEngine()` |
| `validate.ts` (11KB) | PLAN.md parser + topological sort into waves | `validatePlan()` |
| `verify.ts` (17KB) | Two-stage verification: tsc + npm test + eslint, then static review | `runFullVerification()`, `runStaticReview()` |

**Agent Infrastructure**:
| Module | Responsibility |
|---|---|
| `agents.ts` (6.9KB) | Load agent defs from markdown+YAML frontmatter (`agents/*.md` + builtins) |
| `tools.ts` (9.5KB) | Built-in tool set per agent: read/write/edit/bash/memory_read/memory_write/report |
| `skills.ts` (8.7KB) | Guardian skill registry (TDD, brainstorm, code-review, etc.) injected into prompts |
| `memory.ts` (1.9KB) | In-process `Map<string, MemoryEntry>` — inter-agent key-value store |
| `sandbox.ts` (7.5KB) | Per-agent sandbox policies (path restrictions, bash command filtering) |

**Persistence & State** (file-as-state pattern → `.planning/`):
| Module | Responsibility |
|---|---|
| `planning.ts` (14KB) | `.planning/` directory management, checkpoint save/load, `parseStructuredTasks()` |
| `queue.ts` (24KB) | Task queue CRUD, `QUEUE.json` persistence, sequential execution with deps |
| `history.ts` (5.6KB) | Append-only `HISTORY.json` — execution records |
| `lock.ts` (4.6KB) | File-based concurrency lock (`.planning/.lock`) |

**Services**:
| Module | Responsibility |
|---|---|
| `dashboard.ts` (20KB) | HTTP server on :3120, serves pixel-art HTML dashboard + JSON API + SSE log streaming |
| `relay.ts` (8.5KB) | WebSocket relay server for remote client management |
| `remote.ts` (8KB) | Remote client — connects local machine to dashboard |
| `scheduler.ts` (4.3KB) | System-level scheduling (Windows `schtasks` / Unix `at`) |
| `projects.ts` (9.6KB) | Global project registry (`~/.awsl/projects.json`) |

**Utilities**:
| Module | Responsibility |
|---|---|
| `summary.ts` (12KB) | Session summary generator (git log + history → report) |
| `discuss.ts` (8KB) | Multi-agent discussion/debate mode |
| `context.ts` (3KB) | `RunContext` — shared execution context |
| `log.ts` (1.2KB) | Logging utility (replaces console.log) |
| `logstream.ts` (2KB) | Log stream for SSE |
| `install.ts` (11.5KB) | Skill installer for `.claude/skills/` |

#### Key Architectural Patterns

1. **File-as-state**: All orchestration state persists in `.planning/` (STATE.md, PLAN.md, QUEUE.json, CHECKPOINT.json, HISTORY.json). Enables crash recovery and cross-session continuity.

2. **Wave-based parallelism**: Tasks form a DAG; `validatePlan()` toposorts into waves. Each wave's tasks run in parallel via `runParallel()`, waves execute sequentially.

3. **Dual engine**: `claude-code` engine spawns `claude -p` as subprocess (full Claude Code tools). `builtin` engine uses `pi-agent-core` in-process with custom tools. Auto-detected.

4. **Agent = markdown file**: Agent definitions are `.md` files with YAML frontmatter (name, role, model, tools, skills) + system prompt body. Loaded from `agents/` dir or builtins.

5. **Guardian skills injection**: Skills (TDD, brainstorm, code-review) are injected into agent system prompts based on role or explicit config. Separate concern from agent definition.

6. **Event/hook system**: `TeamHook` callbacks on events (wave_start, task_done, verify_done, etc.) for external integration (dashboard, logging).

7. **Checkpoint recovery**: On rate limits or crashes, full state (tasks, memory, wave position) is serialized to `CHECKPOINT.json` and restored on restart.

#### Frameworks & Dependencies
- **TypeScript strict** (ES2022, Node16 modules, `.js` extension imports)
- **pi-agent-core** + **pi-ai**: In-process agent runtime + LLM provider abstraction
- **@sinclair/typebox**: JSON Schema for tool parameter validation
- **ws**: WebSocket for relay server
- **yaml**: YAML frontmatter parsing
- No web framework — raw `node:http` for dashboard

#### Module Dependency Graph (simplified)
```
cli.ts ─→ orchestrator.ts ─→ runner.ts ─→ pi-agent-core
  │              │                │
  │              ├→ planning.ts   ├→ tools.ts ─→ sandbox.ts
  │              ├→ validate.ts   └→ agents.ts
  │              ├→ verify.ts
  │              └→ skills.ts
  ├→ queue.ts ─→ orchestrator.ts
  ├→ dashboard.ts ─→ history.ts, queue.ts, relay.ts
  └→ projects.ts
```

#### Codebase Size
- **~35 source files**, ~280KB total TypeScript
- Two largest files (`cli.ts`, `orchestrator.ts`) are ~46KB each — the heaviest logic
- Test files co-located in `src/` (`.test.ts` suffix)