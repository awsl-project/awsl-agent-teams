# Design: Remote Timeline Collapse Fix

## Problem

Timeline collapse feature was added (section-level + per-day), but it has issues when viewing remote client data:

1. **Day-level collapse state lost on re-render** — `renderTimeline()` clears `el.innerHTML` every call (line 1126), destroying all `.date-group.collapsed` states. The 30s poll interval triggers `render()` → `renderTimeline()`, resetting all day groups to expanded.
2. **Clear History button broken for remote** — `clearHistory()` (line 1576) always calls local `/api/history/clear`, even when `selectedClient` is set. Should either disable or route to remote client.
3. **No visual context** — Timeline header always says "Timeline" regardless of whether showing local or remote data. User has no indicator of whose history they're viewing.

## Approach

**Minimal JS state tracking** — Store collapsed date keys in a variable, save before re-render, restore after. No localStorage needed (session-only is fine per existing design decision).

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State storage | JS variable (`collapsedDates` Map) | Survives re-render, no persistence needed |
| Key format | `viewKey + '|' + dateString` | Separate state per view (local vs each client) |
| View key | `selectedClient \|\| '_local'` | Simple, unique per view |
| Section collapse | Already persists (on wrapper element) | No change needed |
| Clear History | Add `selectedClient` check | Disable button or skip for remote views |

## File Changes

### `public/dashboard.html` — JS changes only (~15 lines)

#### 1. Add state variable (near line 841, with other globals)

```javascript
var collapsedDates = {};  // key: "viewKey|date" → true
```

#### 2. Modify `renderTimeline()` (line 1125)

Before clearing innerHTML, save collapsed state:
```javascript
function renderTimeline(entries) {
  var el = document.getElementById('tl');
  var viewKey = selectedClient || '_local';

  // Save current collapse state before clearing
  var groups = el.querySelectorAll('.date-group.collapsed');
  for (var i = 0; i < groups.length; i++) {
    var dateKey = groups[i].getAttribute('data-date');
    if (dateKey) collapsedDates[viewKey + '|' + dateKey] = true;
  }
  // Also save UN-collapsed (user explicitly expanded a previously collapsed group)
  var expanded = el.querySelectorAll('.date-group:not(.collapsed)');
  for (var i = 0; i < expanded.length; i++) {
    var dateKey = expanded[i].getAttribute('data-date');
    if (dateKey) delete collapsedDates[viewKey + '|' + dateKey];
  }

  el.innerHTML = '';
  // ... existing code ...
```

When creating date groups, add `data-date` attribute and restore state:
```javascript
  var group = document.createElement('div');
  group.className = 'date-group';
  group.setAttribute('data-date', ds);

  // Restore collapse state
  if (collapsedDates[viewKey + '|' + ds]) {
    group.classList.add('collapsed');
  }
```

#### 3. Update day-level toggle to track state (in the onclick handler)

```javascript
hd.onclick = function(g, dateStr) {
  return function(e) {
    e.stopPropagation();
    g.classList.toggle('collapsed');
    var vk = (selectedClient || '_local') + '|' + dateStr;
    if (g.classList.contains('collapsed')) collapsedDates[vk] = true;
    else delete collapsedDates[vk];
  };
}(group, ds);
```

#### 4. Update `toggleAllDays()` to track state

```javascript
function toggleAllDays(collapse) {
  var viewKey = selectedClient || '_local';
  document.querySelectorAll('.date-group').forEach(function(g) {
    var dk = g.getAttribute('data-date');
    if (collapse) {
      g.classList.add('collapsed');
      if (dk) collapsedDates[viewKey + '|' + dk] = true;
    } else {
      g.classList.remove('collapsed');
      if (dk) delete collapsedDates[viewKey + '|' + dk];
    }
  });
}
```

#### 5. Fix `clearHistory()` for remote clients (line 1576)

```javascript
async function clearHistory() {
  if (!confirm('Clear all history entries?')) return;
  try {
    if (selectedClient) {
      // Remote clients don't support history clear yet — skip
      alert('Cannot clear history for remote clients');
      return;
    }
    await fetch('/api/history/clear', { method: 'POST' });
  } catch(e) {}
  if (await load()) render();
}
```

## What NOT to change

- Section-level collapse (`toggleTimeline()`) — already persists on wrapper element
- CSS — no changes needed
- Backend (`dashboard.ts`, `remote.ts`, `relay.ts`) — no changes needed
- Data model / API — no changes needed

## Edge Cases

- **Switching local → remote → local**: Each view's collapse state preserved independently
- **New date appears in data**: Defaults to expanded (no entry in `collapsedDates`)
- **Date disappears from data**: Stale entry in `collapsedDates` is harmless, never cleaned
- **Clear History while collapsed**: Works fine, re-render shows empty state
