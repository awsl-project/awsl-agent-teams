# task_1: Add four new exported functions to src/agents.ts:

1. `seria

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task 1 Complete: Agent CRUD functions in `src/agents.ts`

**Implemented 4 functions + 1 export:**

| Function | Description |
|----------|-------------|
| `serializeAgent(agent)` | Converts `TeamAgentDef` to YAML frontmatter + markdown body using `yaml.stringify` |
| `saveAgent(dir, agent)` | Validates name (`/^[a-z][a-z0-9-]*$/`, max 50 chars), merges with existing file, writes atomically (`.tmp` → rename) |
| `deleteAgent(dir, name)` | Deletes `{dir}/{name}.md`, returns `true`/`false` |
| `getAgent(dirs, name)` | Loads all agents via `loadAgents(dirs)` and finds by name |
| `BUILTINS` | Exported as `readonly TeamAgentDef[]` (frozen at runtime) |

**Files modified:**
- `src/agents.ts` — Added 4 functions, exported `BUILTINS` as frozen readonly array
- `src/index.ts` — Re-exports `serializeAgent`, `saveAgent`, `deleteAgent`, `getAgent`, `BUILTINS`

**Files created:**
- `src/agents.test.ts` — 17 tests covering all functions, edge cases, round-trip serialization

**Verification:**
- `npx tsc --noEmit` — clean, no errors
- `npx tsx src/agents.test.ts` — 17/17 passed