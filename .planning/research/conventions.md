Conventions document updated at `memory/conventions.md`. Here's the summary:

## AWSL_RESULT

The conventions file already existed and was comprehensive. I updated the **Testing** section to reflect the new `test/` directory using `node:test` + `assert/strict`.

### Key conventions at a glance:

| Area | Convention |
|------|-----------|
| **Naming** | camelCase vars/funcs, PascalCase types, UPPER_SNAKE constants, no enums (string unions) |
| **Style** | ES modules + `.js` ext, `node:` prefix, named exports, tabs, no semicolons, section dividers |
| **Errors** | Fail-soft (return defaults), bare `catch {}` when unused, `catch (e: any)` for message access |
| **Async** | async/await only, sync fs ops, `Promise.all` for parallel agents |
| **Logging** | `log.info/warn/debug(source, msg)` — never console.log, all to stderr |
| **State** | File-as-state in `.planning/`, JSON for data, Markdown for plans, `SharedMemory` for in-session |
| **Testing** | `node:test` + `assert/strict`, run via `npx tsx --test`, plus command-based verification providers |

**File**: `memory/conventions.md` (linked from MEMORY.md)