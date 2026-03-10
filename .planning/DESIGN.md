Now I have all the context I need. Let me produce the design document.

## Socratic Brainstorming

### Explore — What is the user actually trying to achieve?

The dashboard (`public/dashboard.html`) has two areas where task details are always visible:

1. **Queue table** (`renderQueue`, line 1149): After each done/failed task row, a `.q-summary-row` shows the summary text — always visible
2. **Timeline section** (`renderTimeline`, line 1070): Each `.entry` card shows `.entry-summary` — always visible

The user wants a **collapse-by-default** pattern: summaries hidden, click to expand.

### Constraints
- Single-file SPA, all CSS/JS inline in `dashboard.html`
- Vanilla JS, no framework
- Must survive 30s auto-refresh without losing expanded state
- ~1489 lines — keep changes minimal

### Alternatives

| # | Approach | Pros | Cons |
|---|----------|------|------|
| A | CSS `display:none` + JS click toggle | Simple, flexible, matches existing code style | Small JS additions |
| B | HTML `<details>/<summary>` | Zero JS | Doesn't work well inside `<table>` for queue; hard to style |
| C | Accordion (one-at-a-time) | Clean look | Annoying when comparing multiple tasks |

### Challenge — What could go wrong?
- **30s re-render**: `render()` calls `renderQueue()` and `renderTimeline()` every 30s, rebuilding innerHTML. Expanded state will be lost unless we track it.
- **Running tasks**: No summary yet — no toggle needed.
- **Tasks with no summary**: No toggle indicator should appear.

### Decision: Approach A — CSS hide + JS toggle + state tracking

**Rationale**: Simplest solution that works. HTML `<details>` breaks table layout. Accordion is too restrictive. A simple Set tracking expanded IDs survives re-renders.

---

## Design Document

### Changes — all in `public/dashboard.html`

#### 1. State tracking (JS)
Add a `Set` to track which items are expanded:
```js
var expandedTasks = new Set();    // queue task IDs
var expandedEntries = new Set();  // timeline entry keys (startedAt or index)
```

#### 2. Queue table — `renderQueue()` (lines 1149-1182)

**Current**: Summary rows are always visible.
**Change**:
- Add a toggle indicator (▸/▾) to the task row's first `<td>` for tasks that have a summary
- Set `display:none` on `.q-summary-row` by default
- If task ID is in `expandedTasks`, set `display:table-row`
- Add `onclick` on the task `<tr>` to toggle `expandedTasks` and re-call `renderQueue()`
- Add `cursor:pointer` to task rows that have summaries

**Key code change** (line 1171-1177):
```js
var hasSummary = summary && (t.status === 'done' || t.status === 'failed');
var expanded = hasSummary && expandedTasks.has(t.id);
var arrow = hasSummary ? (expanded ? '▾ ' : '▸ ') : '';
var clickAttr = hasSummary ? ' style="cursor:pointer" onclick="toggleTask(\'' + esc(t.id) + '\')"' : '';

// Task row: prepend arrow to ID cell
h += '<tr class="..." ' + clickAttr + '><td>' + arrow + esc(t.id) + '</td>...';

// Summary row: hidden by default
if (hasSummary) {
  var vis = expanded ? '' : ' style="display:none"';
  h += '<tr class="q-summary-row"' + vis + '>...</tr>';
}
```

New function:
```js
function toggleTask(id) {
  if (expandedTasks.has(id)) expandedTasks.delete(id);
  else expandedTasks.add(id);
  renderQueue(queue ? queue.tasks : []);
}
```

#### 3. Timeline — `renderTimeline()` (lines 1086-1109)

**Current**: `.entry-summary` is always visible inside each card.
**Change**:
- Hide `.entry-summary` by default via CSS
- Add a small "show details" indicator on entries that have summaries
- Click on the entry card toggles its summary visibility
- Track by entry key (`e.startedAt || index`)

**CSS addition**:
```css
.entry-summary { display: none; }
.entry.expanded .entry-summary { display: block; }
.entry[data-has-summary] { cursor: pointer; }
.entry-expand-hint { font-size: 10px; color: var(--ink4); margin-left: auto; }
```

**JS change** in `renderTimeline()`:
```js
var entryKey = e.startedAt || String(j);
var hasSummary = !!e.summary;
var isExpanded = expandedEntries.has(entryKey);

card.className = 'entry ' + e.status + (isExpanded ? ' expanded' : '');
if (hasSummary) {
  card.setAttribute('data-has-summary', '1');
  card.onclick = function(key) { return function() {
    if (expandedEntries.has(key)) expandedEntries.delete(key);
    else expandedEntries.add(key);
    renderTimeline(entries); // re-render
  }; }(entryKey);
}
```

#### 4. CSS additions (minimal)
```css
.q-summary-row { display: none; }  /* hidden by default */
tr[onclick] { cursor: pointer; }
tr[onclick]:hover td { background: var(--bg); }
.entry-summary { display: none; }
.entry.expanded .entry-summary { display: block; }
.entry[data-has-summary] { cursor: pointer; }
```

### Files to modify
- `public/dashboard.html` — all changes in this single file

### What NOT to change
- No backend changes needed
- No new files
- No API changes
- No changes to relay.ts, remote.ts, dashboard.ts, or logstream.ts

---

## AWSL_RESULT

**Design: Dashboard task logs collapse-by-default**

**Problem**: Queue task summaries and timeline entry summaries are always visible, cluttering the dashboard.

**Solution**: Hide summaries by default, click task row to toggle visibility.

**Key decisions**:
1. **CSS hide + JS toggle** (not `<details>` — doesn't work in tables; not accordion — too restrictive)
2. **Track expanded state in JS Sets** (`expandedTasks`, `expandedEntries`) to survive 30s auto-refresh re-renders
3. **Visual indicators**: ▸/▾ arrows on queue rows, cursor:pointer on expandable items
4. **Single file change**: `public/dashboard.html` only — no backend changes

**Scope**: ~30 lines of CSS + ~20 lines of JS changes in `public/dashboard.html`

**Files to modify**: `public/dashboard.html`