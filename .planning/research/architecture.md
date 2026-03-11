## AWSL_RESULT

### Architecture Analysis: awsl-agent-teams

**Package:** `awsl-agent-core` v0.1.0 — Multi-agent orchestration engine for Claude Code.

---

### File Structure

```
src/
├── cli.ts            (49K) — CLI entry, all commands (run/queue/dashboard/summary/etc.)
├── orchestrator.ts   (47K) — Conductor: brainstorm→research→plan→execute→verify→replan
├── runner.ts         (15K) — Dual engine: claude-code (spawn `claude -p`) or builtin (pi-agent-core)
├── queue.ts          (25K) — Task queue with QUEUE.json persistence, sleep mode
├── verify.ts         (18K) — Code verification: tsc, npm test, eslint, provider architecture
├── validate.ts       (12K) — PLAN.md parser + topological sort → WAVES.md
├── planning.ts       (14K) — .planning/ dir management, checkpoints, atomic commits
├── dashboard.ts      (20K) — HTTP server, JSON API, SSE streaming
├── summary.ts        (12K) — Session summary generation (night mode, time ranges)
├── discuss.ts        (8K)  — Multi-agent discussion/debate mode
├── install.ts        (12K) — Skill installer for Claude Code
├── tools.ts          (10K) — Built-in agent tools: read/write/edit/bash/memory/report
├── projects.ts       (10K) — Global project registry (~/.awsl/projects.json)
├── relay.ts          (9K)  — WebSocket relay server for remote clients
├── remote.ts         (8K)  — Remote client (connects local→dashboard)
├── sandbox.ts        (4K)  — Path/command sandboxing policies
├── skills.ts         (9K)  — Guardian skill registry (TDD, debug, review, brainstorm)
├── agents.ts         (7K)  — Agent defs: markdown + YAML frontmatter parser
├── context.ts        (3K)  — RunContext for execution state
├── memory.ts         (2K)  — In-process SharedMemory (key-value, author-tagged)
├── lock.ts           (5K)  — File-based concurrency lock
├── log.ts            (1K)  — Logging utility
├── logstream.ts      (2K)  — Log streaming
├── history.ts        (6K)  — Execution history persistence
├── scheduler.ts      (4K)  — OS-level scheduling (schtasks/at)
├── index.ts          (3K)  — Public API re-exports
└── *.test.ts         — Co-located tests
agents/               — Custom agent markdown definitions
public/               — Dashboard HTML + assets
.planning/            — Runtime state (PLAN.md, QUEUE.json, checkpoints, locks)
```

---

### Module Boundaries & Dependency Graph

```
cli.ts ─────────────┬──→ orchestrator.ts ──→ runner.ts ──→ [claude -p | pi-agent-core]
                    │         │                  │
                    │         ├──→ planning.ts   ├──→ tools.ts ──→ sandbox.ts
                    │         ├──→ skills.ts     └──→ agents.ts
                    │         ├──→ verify.ts
                    │         └──→ memory.ts
                    │
                    ├──→ queue.ts ──→ orchestrator.ts (reuses for full team runs)
                    ├──→ dashboard.ts ──→ history.ts, projects.ts, relay.ts
                    ├──→ summary.ts ──→ history.ts
                    └──→ discuss.ts
```

---

### Key Patterns

| Pattern | Where | Detail |
|---------|-------|--------|
| **Conductor/Guardian split** | orchestrator + skills | Conductor = what/when (waves, DAG). Guardian = how (TDD, review prompts injected per-agent) |
| **File-as-state** | `.planning/` dir | All orchestration state persisted to disk: PLAN.md, QUEUE.json, CHECKPOINT.json, STATE.md, locks |
| **Dual engine** | runner.ts | `claude-code` spawns `claude -p` subprocess; `builtin` uses pi-agent-core in-process with pi-ai models |
| **Wave-based parallelism** | orchestrator.ts | Tasks form a DAG → topological sort into waves → parallel execution within each wave |
| **Checkpoint/recovery** | planning.ts + orchestrator.ts | Serialize state to CHECKPOINT.json on rate limits; restore and resume |
| **Agent-as-markdown** | agents.ts | Agent definitions are markdown files with YAML frontmatter (name, role, model, tools, sandbox) |
| **Skill injection** | skills.ts | Skills auto-activate by agent role, appending methodology instructions to system prompts |
| **Sandbox policy** | sandbox.ts + tools.ts | Per-agent path/command restrictions on read/write/bash |
| **Event hooks** | orchestrator.ts | `TeamHook` callback on events (wave_start, task_done, rate_limit, etc.) |
| **Atomic commits** | planning.ts | `atomicCommit()` — git add + commit per completed task/wave |
| **SharedMemory** | memory.ts | In-process `Map<string, MemoryEntry>` for inter-agent data sharing, serializable for checkpoints |

---

### Frameworks / Dependencies

| Dependency | Purpose |
|------------|---------|
| `@mariozechner/pi-agent-core` | Builtin engine: Agent class, tool interface |
| `@mariozechner/pi-ai` | Model provider for builtin engine (`getModel()`) |
| `@sinclair/typebox` | JSON Schema for tool parameter validation |
| `ws` | WebSocket for relay server/remote client |
| `yaml` | YAML frontmatter parsing in agent definitions |
| `tsx` | Dev-time TS execution |
| TypeScript 5.6+ strict, ES2022, Node16 modules | |

---

### Architectural Notes

1. **No runtime framework** — pure Node.js `http` for dashboard, `child_process` for claude-code engine, no Express/Fastify.
2. **CLI-first** — `cli.ts` is the sole entry point (`bin: awsl`), no REST API beyond dashboard.
3. **Co-located tests** — `*.test.ts` files live in `src/` alongside implementation.
4. **Hybrid mode** — can run without API key by letting Claude Code do planning + execution, awsl just validates/verifies.
5. **Sleep mode** — queue tasks scheduled for later execution via OS scheduler, with dashboard monitoring.