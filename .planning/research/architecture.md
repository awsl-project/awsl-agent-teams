## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**Type**: Multi-agent orchestration engine for Claude Code  
**Stack**: TypeScript (strict, ES2022), Node 16 modules, no framework  
**Dual engines**: `claude-code` (spawns `claude -p`) and `builtin` (pi-agent-core in-process)

---

### Module Boundary Map

```
┌─────────────────────────────────────────────────┐
│  CLI Layer                                       │
│  cli.ts (37K) — entry point, command routing     │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Orchestration Layer                             │
│  orchestrator.ts (46K) — Conductor engine        │
│    Phases: brainstorm→research→plan→execute→     │
│           verify→replan                          │
│  queue.ts (21K) — sleep mode task queue          │
│  validate.ts (12K) — PLAN.md → topo sort → DAG  │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Execution Layer                                 │
│  runner.ts (14K) — dual engine agent execution   │
│  tools.ts (10K) — built-in agent tools (8 tools) │
│  sandbox.ts (8K) — path/command restrictions     │
│  skills.ts (9K) — Guardian skill injection       │
│  agents.ts (7K) — agent def loader (markdown)    │
└──────────┬──────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Infrastructure Layer                            │
│  planning.ts (14K) — .planning/ file-as-state    │
│  memory.ts (2K) — in-process KV store            │
│  lock.ts (5K) — file-based concurrency lock      │
│  verify.ts (18K) — tsc/eslint/test runner        │
│  history.ts (5K) — execution history tracking    │
│  log.ts (1K) — logging utility                   │
│  logstream.ts (2K) — SSE log streaming           │
│  context.ts (3K) — RunContext per execution       │
└─────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Network Layer                                   │
│  dashboard.ts (10K) — HTTP server + JSON API     │
│  relay.ts (9K) — WebSocket relay for remotes     │
│  remote.ts (8K) — remote client connector        │
└─────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────┐
│  Setup Layer                                     │
│  install.ts (12K) — skill installer for CC       │
│  scheduler.ts (4K) — schtasks/at integration     │
└─────────────────────────────────────────────────┘
```

---

### Key Patterns

| Pattern | Where | Details |
|---|---|---|
| **File-as-state** | `planning.ts` | All state persisted to `.planning/` (PLAN.md, STATE.md, CHECKPOINT.json, QUEUE.json, HISTORY.json) — survives crashes, enables fresh context per task |
| **Wave execution** | `orchestrator.ts` | Tasks form a DAG → topological sort → parallel waves. Each wave runs tasks concurrently via `runParallel()` |
| **Dual engine** | `runner.ts` | `claude-code` spawns `claude -p` subprocess; `builtin` uses pi-agent-core Agent class in-process |
| **Guardian skills** | `skills.ts` | Reusable prompt-injection patterns (TDD, brainstorm, code-review, debug) injected into agent system prompts |
| **Checkpoint/recovery** | `orchestrator.ts`, `planning.ts` | Rate limit detection → save checkpoint → resume from last good state |
| **Shared memory** | `memory.ts` | In-process `Map<string, MemoryEntry>` for inter-agent communication; serialized to checkpoint |
| **Sandbox** | `sandbox.ts` | Per-agent policies: read/write path restrictions, bash command allowlist/denylist, sensitive file blocking |
| **Event hooks** | `orchestrator.ts` | 15 event types (task_start, wave_end, verify_done, etc.) with async hook callbacks |
| **Agent defs as markdown** | `agents/` | Agent definitions are `.md` files with YAML frontmatter (role, skills, sandbox policy) |

---

### Dependencies

- **`@mariozechner/pi-agent-core`** — Agent class, tool interface (builtin engine)
- **`@mariozechner/pi-ai`** — LLM provider abstraction (`getModel()`)
- **`@sinclair/typebox`** — JSON schema for tool parameters
- **`ws`** — WebSocket for relay server
- **`yaml`** — YAML parsing for agent frontmatter

---

### Data Flow

```
User goal
  → Brainstorm (Socratic exploration)
  → Research (parallel codebase scan)
  → Plan (structured PLAN.md with task DAG)
  → Validate (topo-sort → WAVES.md)
  → Execute (wave-parallel, atomic commits)
  → Verify (tsc + eslint + tests + static review)
  → Auto-fix / Replan on failure
  → Done
```

### Key Files by Size (complexity proxy)

| File | Lines | Role |
|---|---|---|
| `orchestrator.ts` | ~900 | Core brain — most complex module |
| `cli.ts` | ~750 | All CLI commands + routing |
| `queue.ts` | ~420 | Sleep mode task management |
| `verify.ts` | ~350 | Multi-tool verification |
| `runner.ts` | ~280 | Dual engine execution |
| `planning.ts` | ~280 | State persistence |
| `validate.ts` | ~240 | Plan parsing + topo sort |

### Public API Surface

Exported via `index.ts`: 37 named exports covering all major capabilities — `executeTeam`, `planOnly`, `runAgent`, `loadAgents`, `SharedMemory`, `TaskQueue`, `startDashboard`, `RelayServer`, `RemoteClient`, and more.