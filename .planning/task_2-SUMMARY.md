# task_2: Review the changes made to public/dashboard.html for the col

Assignee: reviewer
Status: done

## Result
## AWSL_RESULT

### Security & Code Review: Timeline Collapse State Persistence

**Verdict: PASS** — All 6 changes verified correct. Implementation matches the design spec exactly. No security issues found.

---

### Checklist Results

1. **[PASS] collapsedDates global** — Line 842: `var collapsedDates = {};` properly declared at script-level scope alongside other globals (`hist`, `queue`, `filterProj`, etc.). Correct.

2. **[PASS] State save in renderTimeline** — Lines 1137-1147: Saves collapsed groups (`collapsedDates[key] = true`) AND cleans expanded groups (`delete collapsedDates[key]`) before `el.innerHTML = ''`. Both directions tracked, preventing stale state.

3. **[PASS] data-date attribute** — Line 1176: `group.setAttribute('data-date', ds)` set on every date-group div via DOM API (not innerHTML). Safe.

4. **[PASS] State restore** — Lines 1178-1181: `if (collapsedDates[viewKey + '|' + ds]) group.classList.add('collapsed')` — correctly restores after DOM rebuild.

5. **[PASS] onclick closure** — Lines 1185-1191: IIFE pattern `function(g, dateStr) { return function(e) { ... }; }(group, ds)` correctly captures both `group` element and `ds` string per iteration. Classic closure pattern, no variable-capture bug.

6. **[PASS] toggleAllDays tracking** — Lines 1119-1131: Reads `data-date` via `getAttribute`, updates `collapsedDates` with consistent `viewKey + '|' + dk` key format. Matches renderTimeline's key format.

7. **[PASS] clearHistory remote guard** — Lines 1611-1621: Checks `if (selectedClient)`, shows `alert()`, returns early before `fetch('/api/history/clear')`. Prevents accidental local-API call when viewing remote data.

8. **[PASS] No XSS/injection risks**:
   - `ds` comes from `localDate()` (line 867) which formats via `Date` object → `YYYY-MM-DD` — no user-controlled characters
   - `setAttribute('data-date', ds)` is DOM API, not innerHTML — safe
   - `hd.innerHTML` uses `esc(ds)` (line 1184) — properly HTML-escaped via `textContent`→`innerHTML` pattern (line 863)
   - `viewKey` used only as JS object key, never injected into DOM
   - No new `innerHTML` assignments with unescaped input

9. **[PASS] viewKey construction** — `selectedClient || '_local'` used consistently in all 4 locations (renderTimeline line 1135, onclick line 1188, toggleAllDays line 1120). `selectedClient` is set from server-provided client list, used only as object property key.

---

### Minor Findings

1. **[WARN] UX ordering in clearHistory** — Severity: minor — Location: `dashboard.html:1612-1616`
   - `confirm()` dialog appears *before* the remote-client check. User confirms, then gets told they can't do it. However, this matches the design spec exactly, so no change required.
   - Suggestion: Future improvement could check `selectedClient` before `confirm()`.

2. **[PASS] No memory leak concern** — Stale entries in `collapsedDates` for dates that disappear from data are harmless (design doc explicitly acknowledges this). Session-only lifetime means no accumulation across page loads.

### Files Reviewed
- `public/dashboard.html` — Lines 842, 1119-1131, 1133-1199, 1611-1621
- `.planning/designs/timeline-remote-collapse.md` — Full design spec

### Quality Gate: **PASS** — 0 critical, 0 major, 1 minor (non-blocking)