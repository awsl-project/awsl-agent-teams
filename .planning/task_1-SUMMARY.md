# task_1: 1. Add `clearHistory` to the import from `./history.js` on l

Assignee: coder
Status: done

## Result
All three changes are in place and type-check passes.

## AWSL_RESULT

**Task completed: `POST /api/history/clear` endpoint added.**

### Changes made to `src/dashboard.ts`:
1. **Line 12** — Added `clearHistory` to the import from `./history.js`
2. **Lines 174-179** — New `POST /api/history/clear` route handler that calls `clearHistory(cwd)` and returns `{ cleared: true }`
3. **Line 188** — Updated log message to list the new endpoint

### Verification
- `npx tsc --noEmit` — passes with no errors