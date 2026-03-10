## AWSL_RESULT

Analyzed all 15+ source files in `src/` and `test/`. Conventions documented to `memory/conventions.md`.

**Key findings:**

| Area | Convention |
|------|-----------|
| **Naming** | camelCase functions, PascalCase interfaces/classes, UPPER_SNAKE constants, `create` prefix for factories, string unions instead of enums |
| **Style** | TS strict, ES modules with `.js` extensions, `node:` prefix, tabs, double quotes, section dividers with box-drawing chars, JSDoc file headers |
| **Error handling** | Fail-soft by default (return null/[]/false), bare `catch {}` for expected failures, `e: any` when message needed, never throw in agent tools |
| **Async** | async/await, sync fs ops, `Promise.allSettled` for parallel providers, manual worker pool for concurrency limits, child processes wrapped in resolve-only Promises |
| **Testing** | `node:test` + `node:assert/strict`, no mocking framework, source-reading verification tests, cross-platform aware |
| **State** | File-as-state in `.planning/`, JSON for data, Markdown for plans, atomic lock creation with `wx` flag |
| **Architecture** | Factory + provider patterns, RAII-style RunContext, dual engine abstraction, multi-strategy parsing, topo-sort wave execution |

**File produced:** `memory/conventions.md`