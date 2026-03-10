# task_1: Modify public/dashboard.html to make task details collapsibl

Assignee: coder
Status: done

## Result
All changes are correct. Here's a summary of what was implemented:

## AWSL_RESULT

### Modified file
- `public/dashboard.html`

### Changes made

**1. CSS (lines 398-409)** — Added collapsible styles:
- `.entry { cursor: pointer }` — pointer cursor on timeline cards
- `.entry-details { display: none }` — hide details by default
- `.entry.expanded .entry-details { display: block }` — show on expand
- `.entry-toggle` with rotate transform for chevron indicator (▸ → rotated 90° when expanded)
- `.q-summary-row { display: none }` — hide queue summaries by default
- `.q-summary-row.expanded { display: table-row }` — show on expand
- `.q-table tr.has-summary { cursor: pointer }` — pointer on clickable rows
- `.q-toggle` with rotate transform for queue chevron

**2. Timeline `renderTimeline()` (lines 1109-1123)**:
- Added `<span class="entry-toggle">▸</span>` chevron in `.entry-row1`
- Wrapped `.entry-goal`, `.entry-tasks`, `.entry-summary` inside `<div class="entry-details">`
- Added `card.onclick` handler to toggle `.expanded` class

**3. Queue `renderQueue()` (lines 1200-1208)**:
- Added `toggleQueueDetail(id)` function (lines 1166-1176) that toggles `.expanded` class on summary row + chevron
- Queue rows with summaries get `has-summary` class + `onclick` handler
- Each summary row gets unique `id="qd_0"`, `id="qd_1"`, etc.
- Chevron `<span class="q-toggle">▸</span>` added to rows with summaries

**Build**: `npm run build` passes clean.