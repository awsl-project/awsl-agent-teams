# task_6: Write tests for ProjectManager using node:test and node:asse

Assignee: tester
Status: done

## Result
All 24 tests (covering 15+ test cases) pass — 10 suites, 0 failures.

## AWSL_RESULT

### Task Complete: ProjectManager Tests

**File created:** `test/projects.test.ts`

**Test coverage (24 tests across 10 suites):**

| # | Test Case | Status |
|---|-----------|--------|
| 1 | `registryPath()` returns `~/.awsl/projects.json` | PASS |
| 2 | `load()` returns empty registry when file doesn't exist | PASS |
| 3 | `add()` creates entry with correct fields, name defaults to basename | PASS |
| 4 | `add()` is idempotent (same path returns existing) | PASS |
| 5 | `add()` normalizes paths to absolute | PASS |
| 6 | `remove()` removes existing entry, returns true | PASS |
| 7 | `remove()` returns false for non-existent path | PASS |
| 8 | `list()` returns all entries | PASS |
| 9 | `get()` finds by exact path | PASS |
| 10 | `find()` finds by name (case-insensitive) | PASS |
| 11 | `find()` finds by path | PASS |
| 12 | `getStatus()` reads queue counts from QUEUE.json | PASS |
| 13 | `getStatus()` handles missing .planning/ gracefully | PASS |
| 14 | `scan()` finds directories with .planning/ or .git | PASS |
| 15 | `touch()` updates lastActiveAt | PASS |

**Bonus tests:** tags, HISTORY.json lastRun, .lock detection, non-existent project dir, depth limit, node_modules/.dot skipping, touch no-op for unregistered path.

**Verification:** `npx tsx --test test/projects.test.ts` — 24/24 pass, 0 fail.