## AWSL_RESULT

Conventions document already existed at `memory/conventions.md` — verified against current codebase and updated with minor corrections.

### Key conventions summary:

**Naming**: camelCase functions (verb-first), PascalCase interfaces/classes, UPPER_SNAKE constants, `create` prefix for factories, no enums (string literal unions)

**Style**: TypeScript strict, ES modules with `.js` extensions, `node:` prefix for builtins, `import type` for types, tabs, double quotes, section dividers with `─── Title ───`

**Error handling**: Fail-soft (return defaults, not throw), bare `catch {}` when unused, `catch (e: any)` when message needed, never throw in agent tools, atomic file creation with `wx` flag

**Async**: async/await only, sync fs throughout, `spawn` for streaming, `Promise.allSettled` for non-critical parallel work, manual worker pool (`runParallel`)

**Testing**: `node:test` + `node:assert/strict`, tests colocated in `src/*.test.ts`, no mocking framework, temp dirs via `fs.mkdtempSync`, helper functions for fixture setup

**Architecture**: Conductor/Guardian pattern, dual engine, factory functions, provider pattern, topo-sort waves, checkpoint/resume, file-as-state in `.planning/`

### Files updated:
- `memory/conventions.md` — minor corrections to testing section, added `discuss.ts` to module boundaries