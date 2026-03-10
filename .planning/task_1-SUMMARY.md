# task_1: In `public/dashboard.html`, modify the `render()` function (

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Summary

Fixed dashboard stats aggregation so that when no client is selected and remote clients exist, stats cards (Done, Failed, Total Time, Success Rate, Tokens, Cost) show **aggregated data from all machines** instead of only local data.

### Change

**File modified:** `public/dashboard.html` — `render()` function (lines 1343-1354)

Added an `else if (clients.length > 0)` branch that:
1. Starts with local `hist.entries` via `.slice()`
2. Iterates over all `clients[i].status.history` and `.concat()`s them
3. Does the same for queue tasks (`status.queue`)
4. Assigns aggregated arrays back to `entries` and `qt`
5. `stats(entries)` then naturally computes totals across all machines

### Logic flow
- **`selectedClient` set** → show only that client's data (unchanged)
- **`selectedClient` null, clients exist** → aggregate local + all remotes (NEW)
- **`selectedClient` null, no clients** → show local only (unchanged, fallthrough)

### Test

**File created:** `test/aggregate-stats.test.ts` — 6 tests verifying:
- `clients.length > 0` check exists
- History entries aggregation with `.concat()`
- Queue tasks aggregation
- Assignment back to `entries`/`qt`
- Existing `selectedClient` logic preserved
- Local `hist.entries` included in aggregation

### Test results
- New tests: **6/6 pass**
- All existing tests: **111/111 pass** (zero regressions)