The existing `conventions.md` is accurate and up to date. Here's the summary:

## AWSL Coding Conventions

| Category | Key Patterns |
|----------|-------------|
| **Naming** | camelCase functions, PascalCase types, UPPER_SNAKE constants, no enums (string unions) |
| **Style** | ES modules with `.js` imports, `node:` prefix for builtins, `import type` for types, tabs, no semicolons, section dividers `// ─── Name ────` |
| **Error Handling** | Fail-soft (return defaults, don't throw), bare `catch {}` when error unused, `catch (e: any)` when message needed, output truncation with `.slice()` |
| **Async** | async/await only, sync fs ops (`readFileSync`), `spawn` for streaming, `Promise.allSettled` for parallel agents |
| **Logging** | `log.info/warn/debug(source, msg)` from `./log.js`, never `console.log`, all output to stderr, ANSI colors by role |
| **State** | File-as-state in `.planning/`, JSON for data, Markdown for plans, `SharedMemory` Map for in-session IPC |
| **Testing** | Command-based verification (`tsc --noEmit`, `npm test`, `eslint`), provider pattern with mtime-based cache |
| **Architecture** | Conductor/Guardian split, dual engine (claude-code subprocess vs builtin in-process), factory functions, topo-sort waves, checkpoint/resume |

Full document already at `memory/conventions.md` (96 lines). No updates needed — it matches the current codebase.

## AWSL_RESULT

Conventions documented in `memory/conventions.md`. All patterns verified against current source. Key characteristics: strict TypeScript, fail-soft error handling, file-as-state persistence, dual-engine architecture with factory functions and provider patterns.