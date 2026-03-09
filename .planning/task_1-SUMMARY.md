# task_1: Create src/context.ts with a RunContext class:

1. Interface

Assignee: coder
Status: done

## Result
Compiles cleanly with no errors.

## AWSL_RESULT

### Delivered: `RunContext` — Lifecycle-Aware Lock Management

**Files created/modified:**
- `src/context.ts` — New file with `RunContext` class and `RunContextOptions` interface
- `src/index.ts` — Added re-export line

**API surface:**

| API | Description |
|-----|-------------|
| `RunContext.acquire(cwd, opts)` | Factory: acquires lock, registers SIGINT/SIGTERM handlers, throws on failure |
| `RunContext.tryAcquire(cwd, opts)` | Returns `RunContext | null` instead of throwing (queue-friendly) |
| `ctx.release()` | Releases lock, deregisters signal handlers, idempotent (no-op if already released) |
| `ctx.run(fn)` | Wraps async fn in try/finally for auto-release |
| `ctx.cwd` | The locked working directory |
| `ctx.sessionId` | Session ID from the lock |

**Key design decisions:**
- `checkLock(cwd)` called after `acquireLock` to retrieve the `sessionId` (since `acquireLock` doesn't return it)
- Signal handlers stored in a `Map` and cleaned up on release to prevent listener leaks
- `released` flag prevents double-release
- Force mode: `forceReleaseLock` → retry `acquireLock`

**Verification:** `npx tsc --noEmit` passes with zero errors.