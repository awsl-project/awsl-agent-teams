# task_2: Refactor cli.ts to replace all scattered lock management wit

Assignee: coder
Status: done

## Result
Everything checks out.

## AWSL_RESULT

### Delivered: Refactored `cli.ts` — RunContext-based Lock Management

**File modified:** `src/cli.ts`

**Changes:**

| Section | Before | After |
|---------|--------|-------|
| Import (line 22-23) | `acquireLock, releaseLock, forceReleaseLock, checkLock, formatLockInfo` | Removed `acquireLock`; added `RunContext` import |
| Validate command (~line 207) | Manual `acquireLock`/`forceReleaseLock`/`releaseLock` pattern | `RunContext.acquire(cwd, { description, force })` + `ctx.release()` |
| Run command (~line 663) | Manual `acquireLock`/`forceReleaseLock` + 5× `releaseLock(cwd)` | `RunContext.acquire(cwd, { description, force })` + 5× `ctx.release()` |
| Queue start SIGINT (was ~line 598) | `process.removeAllListeners("SIGINT")` + custom handler with `releaseLock(cwd)` | Removed (queue's internal RunContext from task_3 will handle) |
| Process-level handlers (was ~line 770-787) | `releaseLock(process.cwd())` on catch/SIGINT/SIGTERM — **the `process.cwd()` bug** | Removed entirely; RunContext's own handlers use correct `cwd` |

**Key outcomes:**
- Eliminated the `process.cwd()` bug in signal handlers (the core problem)
- Lock lifecycle now tied to RunContext scope, not scattered across 10+ call sites
- `unlock` and `verify` commands retain direct lock access (admin/end-of-pipeline)
- `npx tsc --noEmit` passes with zero errors