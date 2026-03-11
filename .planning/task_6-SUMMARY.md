# task_6: Create tests/agents.test.ts using node:test and node:assert/

Assignee: tester
Status: done

## Result
All 25 tests pass across 6 test suites.

## AWSL_RESULT

### Task 6 Complete: Agent CRUD Tests (`tests/agents.test.ts`)

**Framework:** `node:test` + `node:assert/strict`

**6 test suites, 25 tests — all passing:**

| Suite | Tests | Coverage |
|-------|-------|----------|
| `serializeAgent` | 4 | Basic serialization, optional fields, omits undefined, round-trip |
| `saveAgent` | 4 | New agent, merge update, atomic write, nested dirs |
| `deleteAgent` | 2 | Delete existing (returns true), non-existent (returns false) |
| `getAgent` | 4 | Builtin lookup, custom lookup, not-found, builtin override |
| `saveAgent name validation` | 7 | Uppercase, leading digit, underscore, empty, too long, boundary (50), special chars |
| `BUILTINS` | 4 | Non-empty, all 5 agents present, source=builtin, frozen |

**File created:**
- `tests/agents.test.ts`

**Verification:**
- `npx tsx tests/agents.test.ts` — 25/25 passed, 0 failed