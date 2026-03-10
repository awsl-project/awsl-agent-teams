# Execution Plan

## task_1: Add collapse state tracking to renderTimeline
- **Assignee:** coder
- **Files:** public/dashboard.html

### Action
In public/dashboard.html, implement these changes exactly as specified in .planning/designs/timeline-remote-collapse.md:

1. Near line 841 (with other globals like `var hist = null, queue = null...`), add: `var collapsedDates = {};`

2. In `renderTimeline(entries)` (starts ~line 1125), BEFORE `el.innerHTML = ''`, add state-saving logic:
   - Add `var viewKey = selectedClient || '_local';`
   - Query `.date-group.collapsed` elements, save their `data-date` to `collapsedDates[viewKey + '|' + dateKey] = true`
   - Query `.date-group:not(.collapsed)` elements, delete their keys from collapsedDates

3. When creating date groups (~line 1152), add `group.setAttribute('data-date', ds);` and restore state: `if (collapsedDates[viewKey + '|' + ds]) group.classList.add('collapsed');`

4. Update the `hd.onclick` handler to track state in collapsedDates (pass `ds` as second closure param, update collapsedDates on toggle)

5. Update `toggleAllDays(collapse)` (~line 1118) to also update collapsedDates using viewKey and data-date attribute

6. Fix `clearHistory()` (~line 1576): add check at top — if `selectedClient` is truthy, show `alert('Cannot clear history for remote clients')` and return early before calling fetch.

### Verify
npm run build

### Done
collapsedDates state variable exists, renderTimeline saves/restores collapse state across re-renders, toggleAllDays tracks state, clearHistory shows alert for remote clients

## task_2: Review collapse state changes
- **Assignee:** reviewer
- **Dependencies:** task_1
- **Files:** public/dashboard.html

### Action
Review the changes made to public/dashboard.html for the collapse state tracking fix. Check:
1. collapsedDates variable is properly scoped as a global
2. State save logic in renderTimeline correctly captures both collapsed and expanded states before innerHTML clear
3. data-date attribute is set on all date-group elements
4. State restore correctly applies collapsed class after DOM rebuild
5. onclick handler properly closes over both group and dateStr
6. toggleAllDays correctly reads data-date and updates collapsedDates
7. clearHistory properly guards against remote client usage
8. No XSS or injection risks in the new code
9. viewKey construction is safe (selectedClient is already validated elsewhere)

### Verify
Read public/dashboard.html and verify the implementation matches the design in .planning/designs/timeline-remote-collapse.md

### Done
All 6 changes verified correct, no security issues found
