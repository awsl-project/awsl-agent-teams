## AWSL_RESULT

Analyzed all source files and documented conventions in `memory/conventions.md`.

**Key patterns found:**

| Category | Convention |
|---|---|
| **Naming** | PascalCase interfaces, camelCase functions (verb-first), UPPER_SNAKE constants, string literal unions (no enums) |
| **Style** | ES modules + `.js` extensions, `node:` prefix, tabs, no semicolons, `import type`, section dividers `// ───`, JSDoc file headers |
| **Error handling** | Fail-soft (return defaults, don't throw), bare `catch {}`, nested try-catch for cleanup, atomic `wx` flag writes, output truncation |
| **Async** | async/await only, sync fs ops (`readFileSync`), `execSync` for verification, `Promise.all` for parallel agents |
| **Logging** | `log.info/warn/debug(source, msg)` to stderr, ANSI colors by role, `DEBUG` env gate |
| **State** | `.planning/` directory as file-as-state, JSON for data, Markdown for plans, `SharedMemory` Map for in-session |
| **Architecture** | Conductor/Guardian split, dual engine, factory functions, provider pattern, typed events + hooks, topo-sort DAG waves |

**Files produced:** `memory/conventions.md`