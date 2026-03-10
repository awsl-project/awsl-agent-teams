# task_1: In public/dashboard.html, implement section-level collapse f

Assignee: coder
Status: done

## Result
Build passes cleanly. All three changes are implemented:

## AWSL_RESULT

### Implemented: Section-level collapse for Timeline

**File modified**: `public/dashboard.html`

**Changes**:
1. **CSS** (lines 424–436) — Added section-level collapse styles (`.timeline-wrap.collapsed` hides `#tl` and `#filterBar`) and day-level collapse styles (`.date-group`, `.date-head`, `.date-toggle`, `.date-count`)
2. **HTML** (line 795) — Added `<button class="tl-collapse-btn" onclick="toggleTimeline()">Collapse</button>` to the Timeline h2 header
3. **JavaScript** (lines 1111–1116) — Added `toggleTimeline()` function that toggles `.collapsed` class on `.timeline-wrap` and updates button text between "Collapse" / "Expand"

**Behavior**: Clicking "Collapse" hides the entire timeline list and filter bar while keeping the h2 title with buttons visible. Clicking "Expand" restores them.