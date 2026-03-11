# task_5: Add agent management commands to the RemoteClient's executeC

Assignee: coder
Status: done

## Result
Type-check clean, all 20 tests pass (GREEN).

## AWSL_RESULT

### Task 5 Complete: Agent CRUD commands in `src/remote.ts`

**4 command cases added to `executeCommand` switch:**

| Command | Description |
|---------|-------------|
| `agents:list` | Loads builtins + custom agents from `{cwd}/agents/`, returns `TeamAgentDef[]` |
| `agents:get` | Finds agent by `payload.name`, returns agent or `null` |
| `agents:save` | Calls `saveAgent(agentsDir, payload)`, returns saved `TeamAgentDef` |
| `agents:delete` | Calls `deleteAgent(agentsDir, payload.name)`, returns `{ deleted: boolean }` |

**Files modified:**
- `src/remote.ts` — Added import of `loadAgents`, `saveAgent`, `deleteAgent`; added 4 switch cases

**Files created:**
- `src/remote-agents.test.ts` — 20 tests covering all 4 commands (list, get, save, delete) including edge cases

**Verification:**
- `npx tsc --noEmit` — clean, no errors
- `npx tsx src/remote-agents.test.ts` — 20/20 passed