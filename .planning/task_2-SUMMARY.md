# task_2: Add agent CRUD API endpoints to the dashboard HTTP server in

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task 2 Complete: Agent CRUD API endpoints in `src/dashboard.ts`

**4 endpoints added before the 404 handler:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/agents` | Returns all agents (builtins + custom from `agents/` dir). With `?name=X`, returns single agent or 404 |
| `POST /api/agents` | Creates new custom agent. Validates name pattern, requires non-empty systemPrompt, rejects duplicates (409) |
| `PUT /api/agents` | Updates existing agent (builtin or custom). Must exist (404 if not). Merges via `saveAgent()` |
| `DELETE /api/agents?name=X` | Deletes custom agent file. Cannot delete builtin-only agents (400). Returns `{ deleted: boolean }` |

**Files modified:**
- `src/dashboard.ts` — Added import of agent CRUD functions + BUILTINS, added PUT to CORS methods, added 4 route handlers (~95 lines)

**Files created:**
- `src/dashboard-agents.test.ts` — 15 tests covering all endpoints, validation, edge cases

**Verification:**
- `npx tsc --noEmit` — clean, no errors
- `npx tsx src/dashboard-agents.test.ts` — **15/15 passed**