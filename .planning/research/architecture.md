Here's the architecture analysis:

## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**Type**: Multi-agent orchestration engine for Claude Code  
**Language**: TypeScript (strict mode, ES modules, `.js` extension imports)  
**Runtime**: Node.js (ES2022 target)  
**Build**: `tsc` → `dist/`, CLI binary at `dist/cli.js`

---

### Module Dependency Graph (simplified)

```
cli.ts  ──────────────────────────────────────────────┐
  ├── orchestrator.ts  (Conductor — core engine)      │
  │     ├── runner.ts   (dual engine: claude-code | builtin)
  │     │     ├── tools.ts      (builtin engine tool impls)
  │     │     ├── sandbox.ts    (path/command restrictions)
  │     │     └── logstream.ts  (streaming log capture)
  │     ├── planning.ts  (.planning/ state persistence)
  │     ├── skills.ts    (Guardian skill registry)
  │     ├── memory.ts    (in-process KV for inter-agent comms)
  │     └── verify.ts    (tsc + lint + test verification)
  ├── queue.ts         (sequential task queue, QUEUE.json)
  ├── discuss.ts       (multi-agent debate mode)
  ├── dashboard.ts     (HTTP server + JSON API + SSE logs)
  │     ├── relay.ts   (WebSocket server for remote clients)
  │     └── history.ts (HISTORY.json persistence)
  ├── remote.ts        (WebSocket client → dashboard relay)
  ├── projects.ts      (global project registry ~/.awsl/)
  ├── summary.ts       (night session aggregation)
  ├── agents.ts        (agent defs: YAML frontmatter + markdown)
  ├── context.ts       (RunContext — lock lifecycle + signals)
  ├── lock.ts          (file-based concurrency lock)
  ├── scheduler.ts     (OS-level scheduling: schtasks/at)
  ├── install.ts       (skill installer for .claude/skills/)
  └── validate.ts      (PLAN.md parser + topological sort)

index.ts  ── public API re-exports all modules
```

---

### Core Patterns

| Pattern | Where | Description |
|---------|-------|-------------|
| **Conductor/Guardian** | orchestrator + skills | Conductor = macro (planning, waves, parallelism). Guardian = micro (TDD, review, debug skills injected into prompts) |
| **Dual Engine** | runner.ts | `claude-code` spawns `claude -p` subprocess; `builtin` uses pi-agent-core in-process with custom tools |
| **Wave-based execution** | orchestrator.ts | Tasks form a DAG → topological sort → parallel waves. Each wave runs agents concurrently |
| **File-as-state** | .planning/ dir | STATE.md, PLAN.md, WAVES.md, QUEUE.json, HISTORY.json, CHECKPOINT.json — all state externalized to files |
| **Shared memory** | memory.ts | In-process `Map<string, MemoryEntry>` for inter-agent KV communication during a run |
| **Agent = markdown** | agents.ts | YAML frontmatter (name, role, tools, model) + markdown body (systemPrompt). Loaded from `agents/` dir or builtins |
| **RunContext** | context.ts | RAII-style lock: acquire → register signal handlers → auto-release on exit/crash |
| **Sandbox** | sandbox.ts | Allowlist/denylist bash commands + restricted read/write paths per agent role |

---

### Key Frameworks / Dependencies

- **@mariozechner/pi-agent-core** — Agent class, tool interface (builtin engine)
- **@mariozechner/pi-ai** — LLM provider abstraction (`getModel()`)
- **@sinclair/typebox** — JSON schema for tool parameter validation
- **ws** — WebSocket (relay server + remote client)
- **yaml** — YAML frontmatter parsing for agent definitions

---

### State Files (.planning/)

| File | Purpose |
|------|---------|
| `PLAN.md` | Task DAG written by planner agent |
| `WAVES.md` | Topological sort output |
| `STATE.md` | Running decisions/blockers |
| `QUEUE.json` | Persistent task queue |
| `HISTORY.json` | Completed task log |
| `CHECKPOINT.json` | Crash recovery snapshot |
| `VERIFICATION.md` | Test/lint results |
| `REVIEW.md` | Static review findings |
| `.lock` | Concurrency lock |

---

### Module Boundaries

1. **Orchestration layer** (`orchestrator`, `queue`, `discuss`) — coordinates agents, never touches tools directly
2. **Execution layer** (`runner`, `tools`, `sandbox`) — actually runs agent prompts via either engine
3. **State layer** (`planning`, `memory`, `history`, `lock`, `context`) — persistence and concurrency
4. **Quality layer** (`skills`, `verify`, `validate`) — Guardian enforcement + verification
5. **Networking layer** (`dashboard`, `relay`, `remote`) — HTTP dashboard + WebSocket remote management
6. **Infrastructure** (`cli`, `install`, `scheduler`, `projects`, `summary`, `agents`) — CLI, setup, utilities