# task_1: Create src/projects.ts with the ProjectManager class impleme

Assignee: coder
Status: done

## Result
Clean compilation confirmed.

## AWSL_RESULT

### Task Complete: ProjectManager module

**Files created:**
- `src/projects.ts` — ProjectManager class with global project registry
- `src/projects.test.ts` — 10 tests, all passing

**Files modified:**
- `src/index.ts` — Added `ProjectManager`, `ProjectEntry`, `ProjectRegistry`, `ProjectStatus` exports

**What was implemented:**

| Method | Description |
|--------|-------------|
| `registryPath()` | Returns `~/.awsl/projects.json` path |
| `load()` | Read registry, return empty if missing, auto-create dir |
| `save(registry)` | Atomic write (temp + rename) |
| `add(path, name?, tags?)` | Idempotent add, default name = basename |
| `remove(path)` | Remove by normalized path |
| `list()` | Return all ProjectEntry[] |
| `get(path)` | Find by exact normalized path |
| `find(nameOrPath)` | Fuzzy: exact path first, then case-insensitive name |
| `getStatus(entry)` | Reads QUEUE.json, .lock, HISTORY.json for status |
| `getAllStatuses()` | Map all entries through getStatus, fail-soft |
| `touch(path)` | Update lastActiveAt |
| `scan(dir, depth)` | Recursively find dirs with .planning/ or .git |

**Verification:**
- `npx tsc --noEmit` — clean, no errors
- `npx tsx src/projects.test.ts` — 10/10 tests passing