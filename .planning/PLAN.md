# Execution Plan

## task_1: Create RunContext class
- **Assignee:** coder
- **Files:** src/context.ts, src/index.ts

### Action
Create src/context.ts with a RunContext class:

1. Interface `RunContextOptions { description: string; force?: boolean }`
2. Class `RunContext` with:
   - `readonly cwd: string` — the actual working directory (from --cwd or process.cwd())
   - `readonly sessionId: string` — from lock info
   - Private `released: boolean` flag to prevent double-release
   - Private `signalHandlers: Map<string, () => void>` to track registered handlers
   - Static factory `RunContext.acquire(cwd: string, opts: RunContextOptions): RunContext` that:
     a. Calls `acquireLock(cwd, opts.description)`. If not acquired and `opts.force`, calls `forceReleaseLock(cwd)` then retries `acquireLock`.
     b. If still not acquired, throws an error with `formatLockInfo`.
     c. Creates the RunContext instance, registers SIGINT/SIGTERM handlers that call `this.release()` then `process.exit()`.
   - `release(): boolean` — calls `releaseLock(this.cwd)`, deregisters signal handlers, sets `released = true`. No-op if already released.
   - `async run<T>(fn: (ctx: RunContext) => Promise<T>): Promise<T>` — wraps fn in try/finally that auto-releases.
   - Static `tryAcquire(cwd, opts)` that returns `RunContext | null` instead of throwing (for queue use).
3. Export RunContext and RunContextOptions from src/index.ts (add export line alongside existing lock exports).
4. Import from `./lock.js` for acquireLock, releaseLock, forceReleaseLock, formatLockInfo.
5. Follow conventions: tabs, no semicolons, double quotes, `log` from ./log.js, `.js` import extensions.

### Verify
npx tsc --noEmit

### Done
src/context.ts exists, exports RunContext class, compiles without errors, and is re-exported from index.ts

## task_2: Refactor cli.ts to use RunContext
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/cli.ts

### Action
Refactor cli.ts to replace all scattered lock management with RunContext:

1. Add import: `import { RunContext } from "./context.js"`
2. Remove imports of `acquireLock, releaseLock, forceReleaseLock` (keep `checkLock, formatLockInfo` for the `lock` status command which is read-only).

3. **validate command** (~lines 203-258): Replace the acquireLock/forceReleaseLock/releaseLock pattern with:
   ```
   const ctx = RunContext.acquire(cwd, { description: "validate", force })
   try {
     const result = validatePlan(cwd)
     // ... print results ...
     if (!result.success) ctx.release()  // release on failure
     // On success, keep lock (CC will execute next)
     process.exit(result.success ? 0 : 1)
   } catch (e) {
     ctx.release()
     throw e
   }
   ```
   Note: validate intentionally keeps the lock on success.

4. **verify command** (~lines 289-310): Wrap in RunContext but note verify doesn't acquire its own lock currently — it just releases. Keep as-is (just releaseLock at the end). Actually looking at the code, verify only calls releaseLock — import releaseLock just for verify, OR create a lightweight release-only path. Simplest: keep the releaseLock import just for the verify command's end-of-pipeline release.

5. **run command** (~lines 673-741): Replace the acquireLock/forceReleaseLock block with:
   ```
   const ctx = RunContext.acquire(cwd, { description: positional.join(" ").slice(0, 60) || "run", force })
   ```
   Replace all `releaseLock(cwd)` calls in the run command's try/catch/finally with `ctx.release()`.

6. **queue start SIGINT handler** (~line 598-604): Remove the `process.removeAllListeners("SIGINT")` and the custom SIGINT handler. The queue's internal RunContext (from task_3) will handle cleanup.

7. **CRITICAL — Remove process-level signal handlers** (~lines 770-787):
   - Remove the `.catch` handler's `releaseLock(process.cwd())` at line 773. Replace with: just `process.exit(1)` — RunContext's signal handlers will have already cleaned up, or if no context was acquired, there's nothing to release.
   - Remove the SIGINT handler at lines 778-781.
   - Remove the SIGTERM handler at lines 782-787.
   These are the exact lines with the `process.cwd()` bug. RunContext's own signal handlers (registered in acquire) use the correct cwd.

8. The `lock` and `unlock` CLI commands (lines 173-200) are fine as-is — they're diagnostic/admin commands that directly read/write lock state, not lifecycle-managed runs.

### Verify
npx tsc --noEmit

### Done
cli.ts has no process-level signal handlers using process.cwd() for lock release, all run/validate commands use RunContext, and the file compiles

## task_3: Refactor queue.ts to use RunContext
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/queue.ts

### Action
Refactor queue.ts to use RunContext for per-task lock management:

1. Replace import: change `import { acquireLock, releaseLock, checkLock } from "./lock.js"` to `import { RunContext } from "./context.js"`

2. In the `start()` method (~lines 148-433), replace the lock management block (lines 271-301 and the finally block at lines 417-422):

   **Before** (current pattern):
   ```
   let lockAcquired = false
   try {
     const lockResult = acquireLock(this.cwd, `queue:${nextTask.id}`)
     lockAcquired = lockResult.acquired
     if (!lockAcquired) { ... complex retry logic ... }
     // ... execute team ...
   } finally {
     if (lockAcquired) releaseLock(this.cwd)
   }
   ```

   **After** (using RunContext):
   ```
   const ctx = RunContext.tryAcquire(this.cwd, { description: `queue:${nextTask.id}` })
   if (!ctx) {
     log.warn("queue", `Cannot acquire lock for ${nextTask.id}, skipping`)
     const revertData = this.load()
     const revertTask = revertData.tasks.find(t => t.id === nextTask.id)
     if (revertTask) { revertTask.status = "pending"; revertTask.startedAt = undefined }
     this.save(revertData)
     break
   }
   try {
     // ... load agents, execute team (unchanged) ...
   } catch (err: any) {
     // ... error handling (unchanged) ...
   } finally {
     ctx.release()
   }
   ```

   This removes ~20 lines of lock retry logic and the `lockAcquired` boolean tracking.

3. Keep the rest of queue.ts unchanged (plan, add, remove, list, etc. don't touch locks).

### Verify
npx tsc --noEmit

### Done
queue.ts uses RunContext.tryAcquire() for per-task lock management, no direct acquireLock/releaseLock imports, compiles cleanly

## task_4: Update documentation
- **Assignee:** coder
- **Dependencies:** task_2, task_3
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files to reflect the new RunContext:

1. **README.md** (English): In the architecture/modules section, add a bullet for `context.ts — Lifecycle-aware run context with lock management`. If there's a section about lock management or concurrency, mention that RunContext replaces manual lock handling.

2. **README.zh-CN.md** (Chinese): Mirror the same addition. `context.ts — 带生命周期的运行上下文，统一管理锁`.

3. **BEST_PRACTICES.md**: Add a short section about RunContext usage:
   - Use `RunContext.acquire()` for commands that need exclusive access
   - Use `RunContext.tryAcquire()` in queues where failure should not throw
   - RunContext auto-registers signal handlers with the correct cwd
   - Always use try/finally or `ctx.run()` to ensure cleanup

Keep additions minimal — 3-5 lines per file.

### Verify
cat README.md README.zh-CN.md BEST_PRACTICES.md | grep -c context

### Done
All three docs mention RunContext/context.ts

## task_5: Type check and build
- **Assignee:** tester
- **Dependencies:** task_2, task_3
- **Files:** src/context.ts, src/cli.ts, src/queue.ts, src/index.ts

### Action
Run the full type check and build to verify everything compiles:

1. Run `npx tsc --noEmit` — must pass with zero errors
2. Run `npm run build` — must produce dist/ output
3. Check that `dist/context.js` exists in the build output
4. Verify no regressions: the lock.ts exports are still available in index.ts (backwards compat for any external consumers)

### Verify
npx tsc --noEmit && npm run build

### Done
tsc --noEmit passes, npm run build succeeds, dist/context.js exists

## task_6: Security review
- **Assignee:** reviewer
- **Dependencies:** task_2, task_3
- **Files:** src/context.ts, src/cli.ts, src/queue.ts

### Action
Review the RunContext implementation for:

1. **Signal handler leaks**: Verify that release() deregisters ALL handlers it registered. Check for the case where acquire() succeeds but the caller never calls release() — signal handlers should still clean up.
2. **Double-release safety**: Verify the `released` flag prevents double-release side effects.
3. **Race conditions**: Verify that the underlying lock.ts atomic `wx` flag is still being used (RunContext should delegate, not reimplement).
4. **Force override**: Verify that `force: true` properly releases existing locks before acquiring.
5. **Process exit codes**: Verify signal handlers use correct exit codes (130 for SIGINT, 143 for SIGTERM).
6. **No process.cwd() regression**: Grep for `process.cwd()` in cli.ts signal handlers — must not appear in any lock-related context.
7. **Queue edge case**: Verify that if RunContext.tryAcquire returns null in queue.ts, the task is properly reverted to pending (not left as running).

### Verify
npx tsc --noEmit

### Done
No security issues found, or issues identified and documented for fix
