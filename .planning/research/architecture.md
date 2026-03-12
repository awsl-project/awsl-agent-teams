Here is the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**Package:** `awsl-agent-core` v0.1.0 — Multi-agent orchestration engine for Claude Code.

---

### Module Boundary Map

```
┌─────────────────────────────────────────────────────────────┐
│  CLI Layer                                                  │
│  cli.ts (60KB) — entry point, ~30 commands                  │
├─────────────────────────────────────────────────────────────┤
│  Orchestration Layer (Conductor)                            │
│  orchestrator.ts (50KB) — wave-based DAG execution          │
│  queue.ts (28KB) — sequential task queue + sleep mode       │
│  validate.ts (12KB) — PLAN.md parser + topo sort → WAVES.md│
├─────────────────────────────────────────────────────────────┤
│  Agent Layer                                                │
│  runner.ts (15KB) — dual-engine execution                   │
│  agents.ts (16KB) — agent defs from YAML-frontmatter .md   │
│  skills.ts (9KB) — Guardian quality skills (TDD, review...) │
│  tools.ts (10KB) — sandboxed file/bash/memory tools         │
│  discuss.ts (8KB) — multi-agent discussion mode             │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure Layer                                       │
│  planning.ts (14KB) — .planning/ dir state persistence      │
│  memory.ts (2KB) — in-process KV store (inter-agent)        │
│  lock.ts (5KB) — file-based concurrency lock                │
│  context.ts (4KB) — RunContext with signal-safe auto-release│
│  verify.ts (17KB) — provider-based code verification        │
│  history.ts (6KB) — HISTORY.json append-only log            │
│  fs-utils.ts (4KB) — atomic writes + file locks             │
│  sandbox.ts (8KB) — path/command allow/deny policies        │
├─────────────────────────────────────────────────────────────┤
│  Remote / Dashboard Layer                                   │
│  dashboard.ts (27KB) — HTTP server + SSE + JSON API         │
│  relay.ts (9KB) — WebSocket relay (server-side)             │
│  remote.ts (11KB) — WebSocket client (connects to relay)    │
│  projects.ts (9KB) — multi-project registry (~/.awsl/)      │
│  summary.ts (12KB) — session activity summarizer            │
│  logstream.ts (2KB) — log stream utility                    │
│  scheduler.ts (4KB) — OS-level task scheduling              │
│  install.ts (12KB) — Claude Code skill installer            │
│  public/dashboard.html — pixel-art dashboard SPA            │
└─────────────────────────────────────────────────────────────┘
```

---

### Key Patterns

| Pattern | Where | Detail |
|---------|-------|--------|
| **File-as-state** | `.planning/` dir | PLAN.md, WAVES.md, QUEUE.json, STATE.md, CHECKPOINT.json, HISTORY.json — all state persisted to disk, survives process restarts |
| **Conductor + Guardian** | orchestrator + skills | Conductor = macro (plan, waves, parallelism). Guardian = micro (TDD, review methodology injected into agent prompts) |
| **Wave-based parallelism** | orchestrator.ts | Tasks form a DAG → topological sort → parallel waves. Tasks in same wave run concurrently |
| **Dual engine** | runner.ts | `claude-code` engine spawns `claude -p` subprocess; `builtin` engine uses pi-agent-core in-process |
| **Agent-as-markdown** | agents.ts + `agents/` | YAML frontmatter (name, role, tools, model) + markdown body = system prompt. Custom agents in `agents/` dir |
| **Atomic file writes** | fs-utils.ts | `atomicWriteFileSync` (write-temp-then-rename) + `withFileLock` for concurrent safety |
| **Event/hook system** | orchestrator.ts | `TeamHook` callback receives typed events (wave_start, task_done, verify_done, etc.) |
| **Checkpoint/recovery** | planning.ts + orchestrator.ts | Saves checkpoint on rate-limit or crash → resumes from last good state |
| **Sandbox policies** | sandbox.ts | Per-agent read/write path restrictions + bash command allow/deny lists |

---

### Frameworks & Dependencies

- **TypeScript** strict, ES2022, Node16 module resolution
- **pi-agent-core** + **pi-ai** — LLM agent framework (for builtin engine)
- **@sinclair/typebox** — JSON Schema for tool parameter validation
- **ws** — WebSocket (relay server + remote client)
- **yaml** — YAML frontmatter parsing for agent definitions
- **tsx** — dev-time TS execution

---

### Data Flow

```
User goal
  → Brainstorm (Socratic exploration)
  → Research (parallel codebase analysis)
  → Plan (PLAN.md — structured task DAG)
  → Validate (topo sort → WAVES.md)
  → Execute (wave 1..N, parallel agents per wave)
     └─ Each agent: runner.ts → claude -p | pi-agent-core
        └─ Tools: read/write/edit/bash/memory + sandbox
  → Verify (tsc + npm test + eslint + static review)
  → Auto-fix → Retry → Re-plan (on failure)
  → Commit
```

---

### File Count & Size

- **21 source modules** (~350KB total)
- **10 test files** (~100KB)
- **2 custom agent definitions** in `agents/`
- **1 HTML dashboard SPA**
- Public API: 42 exports via `index.ts`