# task_1: Add a date filter bar in public/dashboard.html inside the #a

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Deliverable: Date Filter UI Controls & CSS

**File modified:** `public/dashboard.html`

**Changes made:**

1. **`:root` CSS variable** (line 17): Added `--bg2: #edeef2` — used for the filter bar background, consistent with the light theme palette.

2. **`.date-filter` CSS block** (lines 843–891): Full styling for the filter bar and its children:
   - Flex container with wrapping, rounded corners, border matching existing cards
   - Pill-shaped buttons with transparent default state, `var(--blue)` active state
   - Hover transition on buttons
   - Date/month inputs styled to match the existing theme
   - Labels in subdued `var(--ink3)` color

3. **HTML filter bar** (lines 915–922): Inserted inside `#app`, directly before `.stats`:
   - 4 preset buttons: `今日` (`dfToday`), `本周` (`dfWeek`), `本月` (`dfMonth`), `全部` (`dfAll`, default active)
   - Month picker: `<input type="month" id="dfMonthInput">` with label `选择月份`
   - Custom range: two `<input type="date">` (`dfStartInput`, `dfEndInput`) with label `自定义范围`
   - All buttons wire to `onclick="setDateFilter('...')"` handlers (implementation in task_2)