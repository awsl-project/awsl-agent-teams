## AWSL_RESULT

Conventions document verified and updated at `memory/conventions.md` (132→135 lines).

### Summary of Conventions

| Category | Key Patterns |
|----------|-------------|
| **Naming** | camelCase functions, PascalCase types/classes, UPPER_SNAKE constants, no enums (string literal unions), `create` prefix for factories |
| **Style** | TypeScript strict, ES modules with `.js` extensions, `node:` prefix for builtins, `import type` for type-only, tabs, double quotes, section dividers `// ───` |
| **Error handling** | Fail-soft (return defaults, don't throw), bare `catch {}` when unused, `catch (e: any)` when message needed, never throw in agent tools, atomic file writes with `wx` flag |
| **Async** | async/await only, sync fs throughout, `Promise.all` for fail-fast, `Promise.allSettled` for best-effort, manual worker pool with concurrency limit |
| **Testing** | `node:test` + `node:assert/strict` in `test/`; plain-function tests in `src/`; no mocking framework; temp dirs via `mkdtempSync`; source-inspection assertions |
| **Architecture** | Conductor/Guardian pattern, dual engine, factory functions, provider pattern, topo-sort waves, file-as-state in `.planning/`, `SharedMemory` for inter-agent comms |

### Update made
- Testing section: added secondary `src/*.test.ts` pattern, test isolation via `_testRegistryPath` override, and `setup()`/`teardown()` helper convention.

**Files:** `memory/conventions.md` (updated)