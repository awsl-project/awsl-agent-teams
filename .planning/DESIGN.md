## AWSL_RESULT

### Design: RunContext — Lifecycle-Aware Lock Management

**Problem**: Lock management is scattered across 20+ call sites in `cli.ts`/`queue.ts`. Process-level signal handlers at `cli.ts:773,779,784` use `process.cwd()` to release locks — **wrong** when `--cwd /other/path` was passed. The lock leaks on crash/signal.

**Solution**: New `RunContext` class in `src/context.ts`:

| API | Purpose |
|-----|---------|
| `RunContext.acquire(cwd, {description, force})` | Create context + acquire lock + register signal handlers |
| `RunContext.create(cwd)` | Lock-free context for commands that don't need locks |
| `ctx.run(fn)` | Execute with guaranteed cleanup (replaces try/finally) |
| `ctx.release()` | Idempotent lock release + unregister signal handlers |
| `LockConflictError` | Typed error with lock info (replaces console.error + exit) |

**Key decisions**:
1. Static factory (not constructor) — lock acquisition can fail
2. Per-context signal handlers — correct `cwd` captured in `this`, not `process.cwd()`
3. `ctx.run(fn)` for guaranteed cleanup — replaces 20+ scattered try/finally blocks
4. Scope boundary: orchestrator keeps `cwd: string` params, receives `ctx.cwd`
5. `lock.ts` unchanged — RunContext wraps it

**Files**: CREATE `src/context.ts` | MODIFY `cli.ts`, `queue.ts`, `index.ts`, docs | KEEP `lock.ts`, `orchestrator.ts`

**Design stored in**: `.planning/DESIGN.md` + `.planning/MEMORY.json` (key: "design")