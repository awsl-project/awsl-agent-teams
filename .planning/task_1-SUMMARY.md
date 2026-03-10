# task_1: In public/dashboard.html, implement these changes exactly as

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task: Timeline collapse state persistence

All 6 changes implemented in `public/dashboard.html`:

1. **`collapsedDates` global** (line 842) — `var collapsedDates = {};` added after other globals
2. **State saving in `renderTimeline()`** (before `el.innerHTML = ''`) — saves collapsed/expanded date groups to `collapsedDates[viewKey + '|' + dateKey]` before DOM clear
3. **`data-date` attribute + state restore** — `group.setAttribute('data-date', ds)` and `if (collapsedDates[viewKey + '|' + ds]) group.classList.add('collapsed')`
4. **`hd.onclick` state tracking** — closure captures `(group, ds)`, toggles `collapsedDates[vk]` on click
5. **`toggleAllDays()` state tracking** — uses `viewKey` and updates `collapsedDates` for each date group
6. **`clearHistory()` remote guard** — checks `selectedClient`, shows `alert('Cannot clear history for remote clients')` and returns early

### Files modified
- `public/dashboard.html` — ~25 lines of JS changes

### Tests
- `test/timeline-collapse.test.ts` — 7/7 tests pass
- `npm run build` — passes