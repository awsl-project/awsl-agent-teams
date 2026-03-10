# task_1: Aggregate all-machines stats in render

Assignee: coder
Status: done

## Result
Build passes clean. The implementation is already complete:

**`public/dashboard.html` lines 1343-1354** — When no specific client is selected (`!selectedClient`) and remote clients exist (`clients.length > 0`), the `render()` function:

1. Starts with local data: `allEntries = (hist.entries || []).slice()` and `allQt = qt.slice()`
2. Iterates all remote clients and concatenates their `status.history` and `status.queue`
3. Assigns aggregated arrays back: `entries = allEntries; qt = allQt`

This feeds aggregated data into `stats()`, `renderTimeline()`, `renderQueue()`, etc.

## AWSL_RESULT

**Task: Aggregate all-machines stats in render** — Complete.

The `render()` function in `public/dashboard.html` (lines 1343-1354) already contains the aggregation logic. When no client is selected and remote clients exist, it concatenates history entries and queue tasks from local + all remote sources before passing them to stats/rendering.

**Tests:** 6/6 pass (`npx tsx --test test/aggregate-stats.test.ts`)
**Build:** `tsc --noEmit` passes clean.
**Files:** `public/dashboard.html` (no changes needed — already implemented in commit dc5b623)