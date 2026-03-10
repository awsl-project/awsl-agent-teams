# task_2: In public/dashboard.html, modify the `renderTimeline()` func

Assignee: coder
Status: done

## Result
All changes are in place and the build passes.

## AWSL_RESULT

### Implemented: Per-day collapsible Timeline groups

**File modified**: `public/dashboard.html`

**Changes**:

1. **HTML** (line 795) — Added "Collapse Days" and "Expand Days" buttons to the Timeline header, styled with the existing `.tl-collapse-btn` class

2. **JavaScript — `toggleAllDays()`** (lines 1118–1123) — New function that adds/removes `.collapsed` class on all `.date-group` elements

3. **JavaScript — `renderTimeline()`** (lines 1146–1192) — Restructured the date loop:
   - Each date now wrapped in `<div class="date-group">`
   - Date header includes `▸` toggle arrow and `(N)` entry count via `.date-toggle` and `.date-count` spans
   - Click handler on date header toggles `.collapsed` on the group (with `e.stopPropagation()` to not interfere with entry clicks)
   - Entries appended to `<div class="date-entries">` inside the group
   - Entry rendering logic (`.entry` divs, click-to-expand, project filtering) fully preserved

**Behavior**:
- Click a date header → that day's entries collapse/expand independently
- Arrow rotates (▸ → ▾ via CSS transform) when expanded
- Entry count `(N)` shows next to each date
- "Collapse Days" / "Expand Days" buttons toggle all groups at once
- Individual entry click-to-expand still works as before
- Default state: all expanded