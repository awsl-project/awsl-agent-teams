# Execution Plan

## task_1: Add date filter UI controls and CSS
- **Assignee:** coder
- **Files:** public/dashboard.html

### Action
Add a date filter bar in public/dashboard.html inside the #app div, right BEFORE the .stats div (around line 862). Implementation:

1) HTML: Add a div with class 'date-filter' containing:
   - Quick-select preset buttons: '今日'(Today), '本周'(This Week), '本月'(This Month), '全部'(All, default active)
   - A <input type='month'> for month selection (labeled '选择月份')
   - Two <input type='date'> for custom range start/end (labeled '自定义范围')
   - Each button should have an onclick handler calling setDateFilter('today'), setDateFilter('week'), setDateFilter('month'), setDateFilter('all')
   - Buttons should have id attributes: dfToday, dfWeek, dfMonth, dfAll
   - Date inputs should have ids: dfMonthInput, dfStartInput, dfEndInput

2) CSS: Add styles matching the existing dark theme:
   - .date-filter: display flex, align-items center, gap 8px, flex-wrap wrap, padding 8-12px, margin-bottom 12px, background var(--bg2), border-radius 10px, border 1px solid var(--border)
   - .date-filter button: pill-shaped (border-radius 16px), background transparent, border 1px solid var(--border), color var(--ink3), padding 4px 14px, cursor pointer, font-size 13px
   - .date-filter button.active: background var(--blue), color white, border-color var(--blue)
   - .date-filter input: background var(--bg), border 1px solid var(--border), color var(--ink), border-radius 6px, padding 4px 8px, font-size 13px
   - .date-filter label: font-size 12px, color var(--ink3)

### Verify
Open dashboard.html in browser and confirm filter bar appears above stats with all controls visible

### Done
Date filter bar with 4 preset buttons and date/month inputs renders correctly in the dashboard

## task_2: Add date filter JS logic and wire to render
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** public/dashboard.html

### Action
Add JavaScript logic for date filtering in public/dashboard.html:

1) State variables (add near line ~1008, alongside existing filterProj/selectedClient):
   var dateFilterMode = 'all';  // 'today' | 'week' | 'month' | 'custom' | 'all'

2) setDateFilter(mode) function:
   - Sets dateFilterMode = mode
   - Updates button active states: remove 'active' from all .date-filter buttons, add 'active' to the clicked one
   - If mode is 'month': read value from dfMonthInput
   - If mode is 'custom': read values from dfStartInput and dfEndInput
   - Reset render cache: render._lastKey = null
   - Call render()

3) Event handlers for inputs:
   - dfMonthInput.onchange: call setDateFilter('month')
   - dfStartInput.onchange and dfEndInput.onchange: call setDateFilter('custom')

4) filterByDate(entries) function:
   - If dateFilterMode === 'all': return entries unchanged
   - If 'today': var today = localDate(new Date().toISOString()); return entries where localDate(e.date||e.startedAt) === today
   - If 'week': compute Monday of current week as YYYY-MM-DD string; return entries where localDate(e.date||e.startedAt) >= monday && <= today
   - If 'month': var mv = document.getElementById('dfMonthInput').value (YYYY-MM); return entries where localDate(e.date||e.startedAt) starts with mv
   - If 'custom': var s = dfStartInput.value, end = dfEndInput.value; return entries where localDate(e.date||e.startedAt) >= s && <= end (skip check if s or end is empty)

5) Wire into render() function:
   - At line ~1770, BEFORE 'var s = stats(entries)', insert: entries = filterByDate(entries);
   - Update dirty-check key at line ~1764 to append: + '|' + dateFilterMode + '|' + (document.getElementById('dfMonthInput')?.value||'') + '|' + (document.getElementById('dfStartInput')?.value||'') + '|' + (document.getElementById('dfEndInput')?.value||'')

6) Initialize: set dfAll button to have class 'active' on page load

### Verify
Open dashboard in browser. Click each preset button and verify stats cards, token counts, heatmap, trend chart, timeline, and agent analysis all update to show only data matching the selected date range.

### Done
All dashboard widgets correctly filter by selected date range; preset buttons and custom inputs work; filter persists across 30s auto-refresh

## task_3: Review date filter implementation
- **Assignee:** reviewer
- **Dependencies:** task_2
- **Files:** public/dashboard.html

### Action
Review the date filter implementation in public/dashboard.html focusing on:
1) Date comparison correctness: ensure localDate() is used consistently, timezone handling is correct, YYYY-MM-DD string comparison works (lexicographic comparison of ISO date strings is valid)
2) Edge cases: entries without date/startedAt fields, empty filter inputs, empty entries array after filtering
3) Code style: must use var (not let/const), no ES6+ features (arrow functions, template literals), consistent with existing codebase patterns
4) UX: active button state updates correctly, filter doesn't break auto-refresh, heatmap/trend still show meaningful data when filtered
5) No XSS vectors from input.value usage
6) Performance: filtering runs O(n) per render, acceptable for expected data sizes
Flag issues and suggest fixes.

### Verify
Read the complete dashboard.html and trace all date filter code paths

### Done
Review complete with issues documented or confirmation that implementation is correct

## task_4: Update documentation for date filter
- **Assignee:** coder
- **Dependencies:** task_2
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files:

1) README.md: Find the Dashboard section and add a bullet/paragraph about the new date filter feature: 'Filter statistics by day, week, month, or custom date range. All dashboard widgets update in real-time based on the selected time period.'

2) README.zh-CN.md: Add the equivalent in Chinese: '支持按天、周、月或自定义日期范围筛选统计数据。所有面板组件根据所选时间段实时更新。'

3) BEST_PRACTICES.md: Add guidance about using date filters for productivity analysis, e.g.: '使用日期筛选器分析生产力趋势：按天查看每日完成量，按月对比不同月份的效率，自定义范围聚焦特定项目周期。'

### Verify
Read all three files and confirm the date filter feature is documented in each

### Done
README.md, README.zh-CN.md, and BEST_PRACTICES.md all contain date filter documentation
