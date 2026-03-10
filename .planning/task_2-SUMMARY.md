# task_2: Add the `projects` CLI subcommand and auto-registration hook

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task Complete: CLI `projects` subcommand + auto-registration hooks

**Files modified:**
- `src/cli.ts` — Added `projects` subcommand and auto-registration hooks

**What was implemented:**

| Command | Description |
|---------|-------------|
| `awsl projects` | List all registered projects with status table (Name, Path, Queue, Last Run, Status) |
| `awsl projects add [path] [--name N]` | Register a project (defaults to cwd) |
| `awsl projects remove <path\|name>` | Unregister by path or name (uses fuzzy find) |
| `awsl projects scan [dir]` | Auto-discover projects in directory (defaults to parent of cwd), auto-registers new ones |

**Auto-registration hooks (fail-soft try/catch):**
- `start` command — calls `ProjectManager.add(cwd)` + `ProjectManager.touch(cwd)`
- `run` command — calls `ProjectManager.add(cwd)` + `ProjectManager.touch(cwd)`
- `queue start` command — calls `ProjectManager.add(cwd)` + `ProjectManager.touch(cwd)`

**Verification:**
- `npx tsc --noEmit` — clean, no errors
- `npx tsx src/projects.test.ts` — 10/10 tests passing