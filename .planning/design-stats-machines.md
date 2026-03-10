# Design: Fix Statistics Not Combined with Machines

## Problem

In `public/dashboard.html`, the `render()` function (line 1184) only uses LOCAL history
(`hist.entries`) when no machine is selected. Remote machines' history data (available in
`clients[i].status.history`) is completely ignored in the aggregate view.

If the dashboard runs on a server with no local task execution (e.g., Docker deployment),
stats show **nothing** — even though connected remote machines have rich history data.

## Root Cause

```javascript
// dashboard.html:1184-1194
function render() {
  var entries = hist.entries || [];     // BUG: local only!
  var qt = queue ? queue.tasks || [] : [];

  if (selectedClient) {
    // Only switches to ONE machine — no aggregate
    entries = sc.status.history;
    qt = sc.status.queue;
  }
  // stats/heatmap/trend/timeline all render from `entries`
}
```

## Fix

### File: `public/dashboard.html` — `render()` function

When `selectedClient` is null (default aggregate view), merge local history with ALL
remote clients' history:

```javascript
function render() {
  if (!hist) return;
  var entries = (hist.entries || []).slice(); // copy local
  var qt = queue ? queue.tasks || [] : [];

  if (selectedClient) {
    var sc = clients.find(function(c){return c.id === selectedClient;});
    qt = sc && sc.status && sc.status.queue ? sc.status.queue : [];
    entries = sc && sc.status && sc.status.history ? sc.status.history : [];
  } else {
    // AGGREGATE: merge all remote clients' history into entries
    var seen = {};
    // Index local entries for dedup
    for (var i = 0; i < entries.length; i++) {
      var key = (entries[i].id || '') + '|' + (entries[i].startedAt || '');
      seen[key] = true;
    }
    // Add remote entries, skip duplicates
    for (var ci = 0; ci < clients.length; ci++) {
      var ch = clients[ci].status && clients[ci].status.history;
      if (ch) {
        for (var j = 0; j < ch.length; j++) {
          var rkey = (ch[j].id || '') + '|' + (ch[j].startedAt || '');
          if (!seen[rkey]) {
            entries.push(ch[j]);
            seen[rkey] = true;
          }
        }
      }
    }
  }

  // rest of render unchanged...
}
```

### Deduplication Strategy

Use `id + startedAt` as composite key. This handles the edge case where the dashboard
machine also connects as a remote client (same HISTORY.json → same entries).

### Queue Behavior

**No change**. Queue is action-oriented (add/remove/start tasks). When no machine is
selected, show local queue. When a machine is selected, show that machine's queue.

### Scope

- **Single file change**: `public/dashboard.html`
- **Single function change**: `render()`
- **No backend changes needed** — all data already available client-side

## Decisions & Rationale

| Decision | Rationale |
|---|---|
| Client-side aggregation | Data already in `clients` array; no new API needed |
| Dedup by `id+startedAt` | Prevents duplicates if local = remote; lightweight |
| Keep queue local in aggregate view | Queue is machine-specific; aggregating would confuse actions |
| No "Local" machine option | Minimal fix; can add later if needed |
