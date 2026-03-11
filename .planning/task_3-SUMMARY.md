# task_3: Review the date filter implementation in public/dashboard.ht

Assignee: reviewer
Status: done

## Result


## AWSL_RESULT

### Security & Code Review: Date Filter Implementation

**Scope:** `public/dashboard.html` — date filter UI, CSS, JS logic, render wiring, and `tests/filterByDate.test.cjs`.

---

### Findings

**1. [FAIL] Correctness — "本月" button shows ALL entries instead of current month**
- **Severity:** critical
- **Location:** `public/dashboard.html:1155-1160` (filterByDate month branch) + line 918 (button onclick)
- Clicking the "本月" (This Month) preset button calls `setDateFilter('month')`, which sets `dateFilterMode = 'month'`. But `filterByDate` then reads `dfMonthInput.value` — which is **empty** if the user never touched the month picker. Line 1157: `if (!mv) return entries;` returns ALL entries unfiltered.
- **Expected:** Clicking "本月" should show only the current month's entries.
- **Fix:** In `setDateFilter`, when `mode === 'month'` and `dfMonthInput.value` is empty, auto-populate it with the current YYYY-MM:
  ```js
  // In setDateFilter, after line 1128:
  if (mode === 'month' && !document.getElementById('dfMonthInput').value) {
    var n = new Date();
    document.getElementById('dfMonthInput').value =
      n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0');
  }
  ```

**2. [WARN] Edge case — Entries without date/startedAt silently dropped**
- **Severity:** minor
- **Location:** `public/dashboard.html:1141,1151,1159,1166`
- `localDate(e.date || e.startedAt)` where both are `undefined` → returns `''`. Empty string never matches any filter, so dateless entries vanish when any filter is active.
- **Fix (optional):** Either treat dateless entries as always-included, or document this as expected behavior. Low risk since production entries should always have `startedAt`.

**3. [WARN] UX — No visual active state for custom date range**
- **Severity:** minor
- **Location:** `public/dashboard.html:1131`
- `idMap` has no entry for `'custom'`, so when custom date inputs trigger `setDateFilter('custom')`, all four preset buttons lose `active` but nothing else is highlighted. Users may be confused that no filter appears selected.
- **Fix (optional):** Add a subtle highlight to the custom date inputs when in custom mode, or add `'custom'` button text.

**4. [PASS] Date comparison correctness**
- `localDate()` is used consistently across all code paths (filterByDate, stats, timeline).
- YYYY-MM-DD zero-padded strings compare correctly via lexicographic `>=`/`<=`.
- Week calculation handles Sunday (`getDay()===0` → `diff=6`) and month-boundary crossing correctly via `setDate()`.

**5. [PASS] XSS — No vectors**
- `dfMonthInput.value`, `dfStartInput.value`, `dfEndInput.value` are from `<input type="month">` and `<input type="date">` (browser-constrained formats).
- Values are only used in string comparison (`===`, `<`, `>`), never injected into `innerHTML`.

**6. [PASS] Code style — Consistent with codebase**
- All `var` declarations, no `let`/`const`.
- `function(){}` callbacks, no arrow functions.
- String concatenation, no template literals.
- Naming conventions match existing code (`localDate`, `filterProj`, `esc`).

**7. [PASS] Auto-refresh compatibility**
- Dirty-check key (line 1878) includes `dateFilterMode` and all three input values.
- `setDateFilter` resets `render._lastKey = null` to force re-render on user interaction.
- Filter applied after dirty check but before `stats()` — correct ordering.

**8. [PASS] Performance**
- `filterByDate` is O(n) single-pass with `Array.filter()`. Acceptable for expected data sizes (hundreds of entries).

**9. [WARN] Test fragility — Timezone edge case**
- **Severity:** minor
- **Location:** `tests/filterByDate.test.cjs:73-77`
- Test constructs dates like `today + 'T10:00:00Z'` — the `Z` suffix makes them UTC. In extreme negative UTC offsets (e.g., UTC-12), `localDate()` could map these to a different local date than `today`, causing test failures. Production code is unaffected since real data uses consistent ISO timestamps.
- **Fix (optional):** Use timezone-neutral date construction, or note the constraint.

---

### Quality Gate

| Category | Result |
|----------|--------|
| Spec compliance | **FAIL** — "本月" button doesn't filter to current month |
| Security (OWASP) | PASS |
| Code style | PASS |
| Performance | PASS |
| Edge cases | WARN (dateless entries) |
| UX | WARN (custom mode no highlight) |
| Tests | WARN (timezone fragility) |

**Verdict:** 1 critical finding → **task requires fix** for the "本月" button before passing. The two WARNs are non-blocking but should be addressed.