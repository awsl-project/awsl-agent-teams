# task_3: Enhance the existing `agents` CLI command in src/cli.ts with

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task 3 Complete: Agents CLI Subcommands in `src/cli.ts`

**Implemented 6 subcommands:**

| Subcommand | Description |
|------------|-------------|
| `awsl agents` | List all agents (existing behavior preserved) |
| `awsl agents show <name>` | Show full details including systemPrompt via `getAgent()` |
| `awsl agents create <name>` | Create new agent with flags: `--role`, `--description`, `--prompt`, `--prompt-file`, `--tools`, `--model`, `--skills`, `--thinking`. Calls `saveAgent()` |
| `awsl agents edit <name>` | Update existing agent, merges with current values. Same flags as create |
| `awsl agents delete <name>` | Delete custom agent file. Rejects builtin-only agents |
| `awsl agents reset <name>` | Delete override file for builtin agent, restoring defaults. Only works for BUILTINS names |

**Helper added:** `parseAgentFlags()` — parses `--role`, `--description`, `--prompt`, `--prompt-file`, `--tools`, `--model`, `--skills`, `--thinking` flags from CLI args.

**Files modified:**
- `src/cli.ts` — Updated import, added `parseAgentFlags()`, refactored agents command block with 6 subcommands, updated `usage()` documentation

**Files created:**
- `tests/cli-agents.test.ts` — 13 tests covering all subcommands and edge cases

**Verification:**
- `npx tsc --noEmit` — clean, no errors
- `npx tsx tests/cli-agents.test.ts` — 13/13 passed
- `npx tsx src/agents.test.ts` — 17/17 passed (no regressions)