# task_2: Add JavaScript logic for date filtering in public/dashboard.

Assignee: coder
Status: done

## Result
All tests pass, TypeScript compiles clean.

## AWSL_RESULT

### Deliverable: Date Filter JavaScript Logic

**File modified:** `public/dashboard.html`

**Changes made:**

1. **State variable** (line 1074): Added `var dateFilterMode = 'all';` alongside existing `filterProj`/`selectedClient` globals.

2. **`setDateFilter(mode)` function** (lines 1127–1135):
   - Sets `dateFilterMode` to the chosen mode
   - Removes `active` class from all `.date-filter` buttons, adds it to the matching one
   - Resets `render._lastKey = null` to force re-render
   - Calls `render()`

3. **`filterByDate(entries)` function** (lines 1137–1173):
   - `'all'`: returns entries unchanged
   - `'today'`: filters to entries where `localDate(e.date||e.startedAt) === today`
   - `'week'`: computes Monday of current week, filters `monday <= date <= today`
   - `'month'`: reads `dfMonthInput.value` (YYYY-MM), matches `substring(0,7)`; empty value returns all
   - `'custom'`: reads `dfStartInput.value` / `dfEndInput.value`, filters range (skips empty bounds)

4. **Input event handlers** (lines 1175–1177):
   - `dfMonthInput.onchange` → `setDateFilter('month')`
   - `dfStartInput.onchange` / `dfEndInput.onchange` → `setDateFilter('custom')`

5. **Render wiring** (line 1884): `entries = filterByDate(entries);` inserted before `stats(entries)`

6. **Dirty-check key** (line 1878): Appended `dateFilterMode`, `dfMonthInput.value`, `dfStartInput.value`, `dfEndInput.value` to the cache key so filter changes trigger re-render.

**Test file:** `tests/filterByDate.test.cjs` — 8 tests covering all filter modes (all, today, week, month, custom with start/end/both/neither). All pass.