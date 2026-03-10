## AWSL_RESULT

### Coding Conventions Summary

The conventions file at `memory/conventions.md` is already comprehensive and accurate. Updated with newer modules (relay, remote). Key patterns:

| Category | Convention |
|---|---|
| **Naming** | Files: lowercase. Types: PascalCase. Functions: camelCase verb-first. Constants: UPPER_SNAKE. No enums — string literal unions. |
| **Style** | ES modules with `.js` extensions, `node:` prefix for builtins, `import type` for type-only, tabs, no semicolons, double quotes, factory functions. |
| **Error handling** | Fail-soft (return null/false), bare `catch {}` when unused, `catch (e: any)` when needed, atomic `wx` flag for race safety. |
| **Async** | async/await only (no `.then()`), sync fs throughout, `Promise.all` for parallel agents. |
| **Logging** | `log.info/warn/debug(source, msg)` to stderr, ANSI role colors, ISO timestamps, debug gated by `DEBUG` env. |
| **State** | File-as-state in `.planning/`, JSON for data, Markdown for plans, `SharedMemory` KV for inter-agent comms. |
| **Testing** | No test framework — command-based verification (`tsc --noEmit`, `npm test`), provider pattern with mtime-based cache (5min TTL). |
| **Architecture** | Conductor/Guardian model, dual engine, topo-sort waves, 7-strategy parsing, checkpoint/resume, RAII-style RunContext. |

Full details in `memory/conventions.md`.