# task_6: Review the RunContext implementation for:

1. **Signal handl

Assignee: reviewer
Status: done

## Result
All files read, build passes, signal handler and lock management analyzed. Here's my review:

## AWSL_RESULT

### Security & Correctness Review: RunContext Implementation

---

#### 1. [WARN] Exit codes in signal handlers — Minor
**Location:** `src/context.ts:100`
**Severity:** minor
**Finding:** Signal handler uses `process.exit(1)` for both SIGINT and SIGTERM. Unix convention is exit code 130 (128+2) for SIGINT and 143 (128+15) for SIGTERM. Parent processes/scripts that check exit codes to distinguish "user interrupted" from "generic error" will misinterpret these.
**Suggestion:** Replace `process.exit(1)` with signal-specific exit codes:
```ts
const exitCode = signal === "SIGINT" ? 130 : 143;
process.exit(exitCode);
```

---

#### 2. [PASS] Double-release safety
**Location:** `src/context.ts:74-82`
The `released` flag is set to `true` (line 77) *before* the I/O operations (`deregisterSignalHandlers` + `releaseLock` on lines 78-79). Since Node.js signal handlers fire asynchronously on the event loop and `release()` is entirely synchronous, a concurrent signal cannot interrupt mid-release. The flag prevents double-release correctly.

---

#### 3. [PASS] Race conditions — atomic `wx` flag preserved
**Location:** `src/lock.ts:82` (delegated from `context.ts:33`)
`RunContext.acquire()` delegates to `acquireLock()` which uses `fs.writeFileSync(path, data, { flag: "wx" })` — the exclusive-create flag that atomically fails if the file exists. RunContext does not reimplement this logic.

---

#### 4. [PASS] Force override
**Location:** `src/context.ts:35-38`
Pattern is correct: try acquire → if fail and `force` → `forceReleaseLock` → retry acquire. The `forceReleaseLock` unconditionally deletes regardless of owner PID, which is the intended behavior for `--force`.

---

#### 5. [PASS] No `process.cwd()` regression
All three `process.cwd()` occurrences in `cli.ts` (lines 84, 158, 624) are default initializers for the `cwd` variable, overridden by `--cwd` parsing. No signal handlers or lock-related code references `process.cwd()`. The only signal handlers are in `context.ts` and they capture `this.cwd` (the resolved path from construction time).

---

#### 6. [PASS] Queue `tryAcquire` null handling
**Location:** `src/queue.ts:271-278`
When `tryAcquire` returns null: data is freshly reloaded, task is found by ID, status reverted to `"pending"`, `startedAt` cleared, data saved, loop breaks. The task is not left orphaned as "running".

---

#### 7. [PASS] Signal handler cleanup on release
**Location:** `src/context.ts:107-112`
`deregisterSignalHandlers()` iterates the `signalHandlers` Map, calls `process.removeListener` for each, then clears the Map. Both SIGINT and SIGTERM handlers are removed. No leak.

---

### Quality Gate

| Category | Result |
|----------|--------|
| Critical findings | 0 |
| Major findings | 0 |
| Minor findings | 1 (exit codes) |
| Build (`npx tsc --noEmit`) | PASS |

**Verdict: PASS** — No critical or major issues. One minor convention issue (exit codes) noted but does not block.