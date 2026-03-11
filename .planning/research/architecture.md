Now I have a comprehensive view. Here's the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: `awsl-agent-teams`

**Type:** Multi-agent orchestration engine for Claude Code  
**Stack:** TypeScript (strict, ES2022), Node.js ESM, no frontend framework  
**Dependencies:** `pi-agent-core` + `pi-ai` (LLM runtime), `@sinclair/typebox` (schema validation), `ws` (WebSocket), `yaml` (agent frontmatter)

---

### Module Boundaries (4 layers)

| Layer | Modules | Responsibility |
|-------|---------|---------------|
| **CLI** | `cli.ts` | Command routing, argument parsing, user-facing output |
| **Orchestration** | `orchestrator.ts`, `queue.ts`, `scheduler.ts` | Task DAG execution, wave parallelism, queue persistence, system scheduling |
| **Agent Runtime** | `runner.ts`, `agents.ts`, `tools.ts`, `skills.ts`, `memory.ts`, `sandbox.ts`, `context.ts` | Dual-engine execution, agent definitions, tool injection, sandboxing, shared state |
| **Infrastructure** | `planning.ts`, `validate.ts`, `verify.ts`, `lock.ts`, `log.ts`, `logstream.ts`, `history.ts`, `projects.ts`, `dashboard.ts`, `relay.ts`, `remote.ts`, `install.ts` | File-as-state persistence, verification, concurrency, networking |

---

### Key Architectural Patterns

1. **Conductor + Guardian separation** — `orchestrator.ts` handles *what/when* (plan → wave → execute → verify → replan). `skills.ts` handles *how* (TDD, review methodology injected per-agent-role into prompts).

2. **Dual engine** (`runner.ts:29`) — `claude-code` engine spawns `claude -p` subprocesses; `builtin` engine uses `pi-agent-core` Agent class in-process. Auto-detected; claude-code preferred.

3. **File-as-state** — All orchestration state lives in `.planning/` directory (PLAN.md, STATE.md, QUEUE.json, CHECKPOINT.json, HISTORY.json). Enables crash recovery and cross-session persistence.

4. **Wave-based parallelism** — Tasks form a DAG with dependencies. `orchestrator.ts` topologically sorts into waves; tasks within a wave execute in parallel via `runParallel()`.

5. **Agent-as-markdown** — Agent definitions are `.md` files with YAML frontmatter (name, role, model, tools, sandbox policy). Loaded from `agents/` dir or built-in defaults. Parsed by `agents.ts`.

6. **Sandbox per agent** (`sandbox.ts`) — Write-path restrictions + bash command allowlist/denylist, role-based defaults. Only applies to `builtin` engine (claude-code has its own permissions).

7. **Event/hook system** (`orchestrator.ts:29-55`) — 15 event types (task_start, wave_end, rate_limit, etc.) with `TeamHook` callbacks for extensibility.

8. **RunContext** (`context.ts`) — RAII-style lock management with signal handlers (SIGINT/SIGTERM auto-release). File-based lock in `.planning/.lock`.

9. **SharedMemory** (`memory.ts`) — In-process key-value store for inter-agent communication. Serialized to checkpoint for persistence.

---

### File Structure

```
awsl-agent-teams/
├── src/                    # TypeScript source (28 files, ~300KB)
│   ├── cli.ts              # CLI entry (~42KB, largest file)
│   ├── orchestrator.ts     # Core engine (~47KB)
│   ├── runner.ts           # Dual-engine agent execution
│   ├── queue.ts            # Task queue with dependency tracking
│   ├── dashboard.ts        # HTTP server + SSE for pixel dashboard
│   ├── projects.ts         # Global project registry (~/.awsl/)
│   ├── relay.ts            # WebSocket relay server
│   ├── remote.ts           # Remote client for dashboard
│   ├── tools.ts            # 8 built-in agent tools (read/write/edit/bash/memory/report)
│   ├── *.test.ts           # Tests (vitest-compatible, uses node:test)
│   └── index.ts            # Public API re-exports (39 exports)
├── agents/                 # Agent markdown definitions
│   ├── fullstack-coder.md
│   └── security-reviewer.md
├── public/
│   └── dashboard.html      # Single-file pixel art dashboard UI
├── scripts/
│   └── deploy-webhook.sh
├── .planning/              # Runtime state directory (gitignored partially)
└── dist/                   # Compiled output
```

### Data Flow

```
User goal → CLI → Orchestrator
  → Brainstorm (Guardian skill) → Research (parallel agents)
  → Plan (structured task DAG) → Validate (topo-sort into waves)
  → Execute (wave-parallel, checkpoint after each wave)
  → Verify (tsc + eslint + tests) → Auto-fix → Retry/Replan
  → Atomic git commit per task
```

### Notable Design Decisions

- **No test framework dependency** — tests use `node:test` (built-in)
- **Single HTML file dashboard** — no bundler, served via `http.createServer`
- **Queue = sleep mode** — tasks persist in QUEUE.json, can be scheduled via OS scheduler (`schtasks`/`at`)
- **History tracking** (`history.ts`) — append-only HISTORY.json for session summaries
- **CC Hybrid Mode** — can operate without API keys by letting Claude Code do the LLM work while AWSL handles orchestration/validation