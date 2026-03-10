# Execution Plan

## task_1: Aggregate all-machines stats in render()
- **Assignee:** coder
- **Files:** public/dashboard.html

### Action
In `public/dashboard.html`, modify the `render()` function (line 1333-1356). When `selectedClient === null` AND `clients.length > 0`, aggregate history entries from ALL sources: local `hist.entries` PLUS each remote client's `clients[i].status.history` array. Concatenate all entries into a single `entries` array before passing to `stats()`. Similarly aggregate queue tasks from local `queue.tasks` and all clients' `status.queue`. The logic should be:

```js
if (selectedClient) {
  // existing: use selected client's data
} else if (clients.length > 0) {
  // NEW: aggregate all sources
  var allEntries = (hist.entries || []).slice();
  var allQt = qt.slice();
  for (var i = 0; i < clients.length; i++) {
    var cs = clients[i].status;
    if (cs && cs.history) allEntries = allEntries.concat(cs.history);
    if (cs && cs.queue) allQt = allQt.concat(cs.queue);
  }
  entries = allEntries;
  qt = allQt;
}
```

Keep the rest of `render()` unchanged — `stats(entries)` will naturally compute aggregated totals.

### Verify
Open dashboard in browser, verify that with no client selected the stats cards show totals from all machines. Then select a specific client and verify it shows only that client's data.

### Done
Stats cards (Done, Failed, Total Time, Success Rate, Tokens, Cost) show aggregated data from all machines when no client is selected

## task_2: Review the aggregation fix
- **Assignee:** reviewer
- **Dependencies:** task_1
- **Files:** public/dashboard.html

### Action
Review the render() function change. Check: (1) no duplicate entries when local machine is also a remote client, (2) graceful handling of clients with missing/null status, (3) no mutation of original arrays (use .slice() or .concat()), (4) queue aggregation doesn't break queue action buttons (add/remove/clear should still target local or selected client only).

### Verify
Code review — read the modified render() function

### Done
No issues found or all issues flagged for fix
