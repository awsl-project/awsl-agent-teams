The conventions document is updated. Here's the final deliverable:

## AWSL_RESULT

### Conventions Analysis Complete

The existing `conventions.md` in auto-memory was already comprehensive. I updated it based on a full review of all 28 source files. Key conventions:

**Naming:** PascalCase interfaces, camelCase functions, `create*` factories, UPPER_SNAKE constants, string literal unions (no enums), underscore prefix for unused params.

**Style:** TypeScript strict, ES2022/Node16, `.js` import extensions, `node:` prefix on builtins, tabs, semicolons in production code, `// ─── Section ───` dividers, JSDoc file headers.

**Error Handling:** Fail-soft by default (return `null`/`false`/status objects, never reject Promises from agent runs). Bare `catch {}` for non-critical. `.slice(0, N)` truncation on external output. Throws only for true precondition failures.

**Async:** `async/await`, sync fs, `spawn` wrapped in `new Promise` (always resolves), `Promise.allSettled` for parallel providers, manual worker pool for concurrency.

**Logging:** `log.info/warn/debug(source, msg)` from `./log.js`, all to stderr, `console.log` only for user-facing CLI output.

**State:** File-as-state in `.planning/`, JSON for data, Markdown for plans, `SharedMemory` Map for in-session comms, `{ flag: "wx" }` for atomic lock creation.

**Testing:** Two styles — `node:test` + `node:assert/strict` (newer) and manual function arrays with custom `assert` helpers (older). Temp dir isolation, no mocking framework, no external test runner.

**Architecture:** Conductor/Guardian separation, dual engine, factory pattern, provider pattern, topo-sort waves, multi-strategy parsing, checkpoint/resume, RAII-style RunContext.

**Updated file:** `memory/conventions.md` — added missing module boundary entries for queue, agents, summary, history, projects, scheduler, relay, remote, logstream, sandbox.