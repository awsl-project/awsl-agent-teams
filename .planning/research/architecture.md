## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**Type**: Multi-agent orchestration engine for Claude Code  
**Stack**: TypeScript (strict, ES2022, ESM), Node.js, WebSocket  
**Entry**: `src/cli.ts` → `dist/cli.js` (binary: `awsl`)

---

### Module Dependency Graph

```
cli.ts ──→ orchestrator.ts (core pipeline)
              ├── runner.ts (dual engine: claude-code spawn | pi-agent-core in-process)
              ├── planning.ts (.planning/ state persistence, PLAN.md parsing)
              ├── skills.ts (Guardian skill registry: TDD, brainstorm, review, etc.)
              ├── memory.ts (in-process KV store for inter-agent comms)
              └── verify.ts (tsc, eslint, npm test runner)

cli.ts ──→ dashboard.ts (HTTP server for pixel art UI)
              ├── relay.ts (WebSocket server for remote client mgmt)
              ├── history.ts (task execution history)
              └── queue.ts (sleep-mode task queue, QUEUE.json)

cli.ts ──→ remote.ts (WebSocket client, connects to dashboard relay)
cli.ts ──→ install.ts (skill installer into .claude/skills/)
cli.ts ──→ scheduler.ts (OS-level scheduling via schtasks/at)
```

### Key Modules

| Module | Lines | Role |
|--------|-------|------|
| `orchestrator.ts` | ~1150 | **Core** — 5-phase pipeline: brainstorm → research → plan → execute → verify. Wave-based parallel execution with checkpoint/recovery |
| `cli.ts` | ~930 | CLI: 15+ subcommands (run, queue, dashboard, remote, validate, verify, review) |
| `runner.ts` | ~350 | Dual engine abstraction. `claude-code` spawns `claude -p`; `builtin` uses pi-agent-core in-process |
| `queue.ts` | ~530 | Persistent task queue (QUEUE.json), sleep mode, batch processing |
| `planning.ts` | ~350 | File-as-state: PLAN.md, WAVES.md, CHECKPOINT.json, HISTORY.json parsing/writing |
| `verify.ts` | ~440 | Two-stage verification: full (tsc+test+lint) and static review |
| `validate.ts` | ~300 | PLAN.md parser + topological sort into execution waves |
| `relay.ts` | ~215 | WebSocket relay server attached to dashboard HTTP, manages remote clients |
| `dashboard.ts` | ~255 | HTTP server serving `public/dashboard.html` + JSON API endpoints + SSE log streaming |
| `tools.ts` | ~240 | Built-in agent tools (read, write, edit, bash, memory_read/write, send_message, report) |
| `sandbox.ts` | ~150 | Path/command sandboxing policy for builtin engine agents |

### Key Patterns

1. **File-as-state**: All orchestration state persists in `.planning/` (PLAN.md, WAVES.md, STATE.md, CHECKPOINT.json, QUEUE.json, HISTORY.json). Enables crash recovery and cross-process coordination.

2. **Wave-based parallelism**: Tasks form a DAG → topological sort into waves → tasks within a wave run in parallel via `runParallel()`.

3. **Dual engine**: `claude-code` engine spawns `claude -p` subprocesses (leveraging full Claude Code); `builtin` engine runs pi-agent-core `Agent` in-process with custom tools and any LLM provider.

4. **Event/hook system**: `TeamHook` callbacks fire on lifecycle events (wave_start, task_done, verify_done, rate_limit, etc.) — used by CLI for progress display.

5. **Shared memory**: In-process `Map<string, MemoryEntry>` lets agents communicate mid-execution. Serializable for checkpoint persistence.

6. **Guardian skills**: Injected into agent system prompts (TDD, brainstorm, code review, etc.) to enforce quality micro-patterns.

7. **Dashboard + Remote**: HTTP server with SSE streaming + WebSocket relay. Remote clients connect via `remote.ts` to push status to a central dashboard.

### Dependencies

- `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai` — builtin engine LLM abstraction
- `@sinclair/typebox` — JSON schema validation
- `ws` — WebSocket (relay + remote)
- `yaml` — YAML parsing
- `tsx` — dev-time TypeScript execution

### Agent Definitions

Custom agents defined in `agents/` as markdown files (parsed by `agents.ts`):
- `fullstack-coder.md` — Full-stack TypeScript developer
- `security-reviewer.md` — Security-focused reviewer

Built-in roles (architect, coder, reviewer, tester) are defined in the skill system and injected contextually.

### Frontend

Single-file SPA: `public/dashboard.html` (~55KB) — pixel art themed dashboard with queue management, timeline view, remote client monitoring. Communicates with backend via fetch API + SSE.