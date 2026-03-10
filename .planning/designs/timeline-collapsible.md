# Design: Collapsible Timeline

## Goal
Make the timeline section collapsible at two levels:
1. **Section-level**: Collapse/expand the entire timeline block
2. **Day-level**: Collapse/expand individual day groups independently

## Approach
**CSS class toggle with JavaScript** — consistent with existing entry-level expand/collapse pattern already used in dashboard.html.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pattern | CSS class toggle | Matches existing `.entry.expanded` pattern |
| Day grouping | Wrap in `<div class="date-group">` | Currently entries are flat siblings; wrapper needed for collapse |
| State persistence | None (session-only, resets on re-render) | Simplest; can add localStorage later if needed |
| Animation | CSS transition on max-height | Smooth collapse/expand without JS animation |
| Default state | All expanded | Matches current behavior; no surprise changes |

## File Changes

### `public/dashboard.html` — CSS additions (~20 lines)

```css
/* Section-level collapse */
.tl-collapse-btn {
  float: right;
  font-size: 12px;
  cursor: pointer;
  background: none;
  border: 1px solid var(--border);
  color: var(--ink3);
  padding: 2px 10px;
  font-family: inherit;
  border-radius: 4px;
  margin-left: 8px;
}
.tl-collapse-btn:hover { background: var(--bg); }

.timeline-wrap.tl-collapsed #tl,
.timeline-wrap.tl-collapsed #filterBar { display: none; }

/* Day-level collapse */
.date-group {}

.date-head {
  cursor: pointer;
  user-select: none;
  /* existing styles preserved */
}

.date-toggle {
  font-size: 10px;
  color: var(--ink4);
  transition: transform 0.15s;
  display: inline-block;
  margin-right: 6px;
}

.date-group.day-collapsed .date-toggle { transform: rotate(0deg); }
.date-group .date-toggle { transform: rotate(90deg); }

.date-group.day-collapsed .entry { display: none; }

/* Entry count badge shown when collapsed */
.date-count {
  font-size: 11px;
  font-weight: 400;
  color: var(--ink4);
  margin-left: 8px;
}
```

### `public/dashboard.html` — HTML changes (section header, line ~781)

Add a collapse/expand button next to the existing "Clear History" button:

```html
<h2>📋 Timeline
  <button class="tl-collapse-btn" onclick="toggleTimeline()">Collapse</button>
  <button onclick="clearHistory()" ...>Clear History</button>
</h2>
```

### `public/dashboard.html` — JS changes in `renderTimeline()` (lines ~1119-1152)

**Before (current structure):**
```
for each date:
  append date-head div
  for each entry:
    append entry div
```

**After (new structure):**
```
for each date:
  create date-group wrapper div
    append date-head div (with chevron + count badge + click handler)
    for each entry:
      append entry div
  append date-group to container
```

Key changes:
1. Create `<div class="date-group">` wrapper per day
2. Add chevron `▸` and entry count to date header
3. Add click handler on date header: `group.classList.toggle('day-collapsed')`
4. Stop propagation so clicking header doesn't bubble

### `public/dashboard.html` — New JS functions (~10 lines)

```javascript
function toggleTimeline() {
  var wrap = document.querySelector('.timeline-wrap');
  var collapsed = wrap.classList.toggle('tl-collapsed');
  var btn = wrap.querySelector('.tl-collapse-btn');
  btn.textContent = collapsed ? 'Expand' : 'Collapse';
}

function toggleAllDays(collapse) {
  var groups = document.querySelectorAll('.date-group');
  for (var i = 0; i < groups.length; i++) {
    if (collapse) groups[i].classList.add('day-collapsed');
    else groups[i].classList.remove('day-collapsed');
  }
}
```

## Interaction Details

### Section-level collapse
- Click "Collapse" button in timeline header → hides `#tl` and `#filterBar`
- Button text toggles between "Collapse" and "Expand"
- The section header (h2) remains visible

### Day-level collapse
- Click on any date header → toggles that day's entries
- Chevron ▸ rotates 90° when expanded (matches entry chevron behavior)
- When collapsed, shows entry count badge: e.g., "2026-03-10 MON (5)"
- Count badge always visible for quick reference

### Edge cases
- Empty timeline: no change (already shows "Nothing here")
- Filtered by project: collapse state works independently of filter
- Re-render (new data arrives): collapse state resets (acceptable trade-off)

## Visual Hierarchy

```
📋 Timeline  [Collapse] [Clear History]
├── ▾ 2026-03-10 MON (3)          ← day header (clickable)
│   ├── ▸ ✓ my-project  2m  14:30  ← entry (clickable, existing)
│   ├── ▸ ✓ my-project  5m  13:00
│   └── ▸ ✗ other-proj  1m  12:00
├── ▸ 2026-03-09 SUN (2)          ← collapsed day
└── ▾ 2026-03-08 SAT (1)
    └── ▸ ✓ my-project  3m  10:00
```

## No changes needed
- `src/history.ts` — no backend changes
- `src/dashboard.ts` — no API changes
- Data model unchanged
