# Execution Plan

## task_1: Section-level collapse CSS + HTML + JS
- **Assignee:** coder
- **Files:** public/dashboard.html

### Action
In public/dashboard.html, implement section-level collapse for the entire Timeline block:

1. **CSS** (add to the <style> block, near existing .entry collapse styles around line 424):
   - `.timeline-wrap.collapsed #tl, .timeline-wrap.collapsed #filterBar { display: none; }`
   - `.timeline-wrap .tl-collapse-btn { background: none; border: 1px solid var(--border); border-radius: 4px; cursor: pointer; color: var(--ink2); font-size: 0.85em; padding: 2px 8px; margin-left: 8px; }`
   - `.timeline-wrap .tl-collapse-btn:hover { background: var(--bg2); }`
   - `.date-group { margin-bottom: 4px; }`
   - `.date-head { cursor: pointer; user-select: none; }`
   - `.date-head .date-toggle { display: inline-block; transition: transform 0.15s; margin-right: 4px; font-size: 0.85em; }`
   - `.date-head .date-count { color: var(--ink1); font-size: 0.85em; margin-left: 6px; }`
   - `.date-group.collapsed .date-entries { display: none; }`
   - `.date-group.collapsed .date-toggle { transform: rotate(0deg); }`
   - `.date-group:not(.collapsed) .date-toggle { transform: rotate(90deg); }`

2. **HTML** (modify the Timeline h2 around line 781):
   - Change: `<h2>📋 Timeline <button onclick="clearHistory()">Clear History</button></h2>`
   - To: `<h2>📋 Timeline <button class="tl-collapse-btn" onclick="toggleTimeline()">Collapse</button> <button onclick="clearHistory()">Clear History</button></h2>`

3. **JavaScript** (add near other timeline functions, around line 1090):
   ```javascript
   function toggleTimeline() {
     const wrap = document.querySelector('.timeline-wrap');
     const btn = wrap.querySelector('.tl-collapse-btn');
     wrap.classList.toggle('collapsed');
     btn.textContent = wrap.classList.contains('collapsed') ? 'Expand' : 'Collapse';
   }
   ```

### Verify
Open dashboard in browser, click the Collapse button on the Timeline header — the entire timeline and filter bar should hide. Click Expand to show them again. The title bar with buttons remains visible.

### Done
Timeline section has a Collapse/Expand button that toggles visibility of #tl and #filterBar while keeping the h2 title visible

## task_2: Day-level collapse in renderTimeline
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** public/dashboard.html

### Action
In public/dashboard.html, modify the `renderTimeline()` function (around line 1097-1153) to support per-day collapsing:

1. **Modify the date loop** in renderTimeline(). Currently it creates a `.date-head` div and then appends entries directly to `#tl`. Change it to:
   - For each date group, create a wrapper: `const group = document.createElement('div'); group.className = 'date-group';`
   - Modify the date header (`hd`) to include a toggle arrow and entry count:
     ```javascript
     hd.innerHTML = '<span class="date-toggle">▸</span>' + ds + ' ' + dn(dt) + ' <span class="date-count">(' + ents.length + ')</span>';
     ```
   - Add click handler on the date header: `hd.onclick = function(e) { e.stopPropagation(); group.classList.toggle('collapsed'); };`
   - Create an entries container: `const entriesDiv = document.createElement('div'); entriesDiv.className = 'date-entries';`
   - Append all entry elements for that date into `entriesDiv` (instead of directly into `f` / `#tl`)
   - Append `hd` and `entriesDiv` into `group`
   - Append `group` into the fragment `f`

2. **Add Expand All / Collapse All buttons** for day groups. Add a small JS helper:
   ```javascript
   function toggleAllDays(collapse) {
     document.querySelectorAll('.date-group').forEach(g => {
       if (collapse) g.classList.add('collapsed');
       else g.classList.remove('collapsed');
     });
   }
   ```
   And add two small links/buttons near the Timeline header or at the top of the timeline for 'Expand All Days' / 'Collapse All Days'.

3. **Default state**: All date groups expanded (no `.collapsed` class by default).

IMPORTANT: Preserve all existing entry rendering logic (the .entry divs, click-to-expand details, project filtering, etc.). Only wrap them in the new date-group structure.

### Verify
Open dashboard with multiple days of history. Click a date header — that day's entries should collapse/expand. The arrow should rotate. Entry count should show correctly. Clicking individual entries (when expanded) should still toggle their details.

### Done
Each day in the timeline has a clickable date header with ▸ arrow and (N) count that collapses/expands that day's entries independently

## task_3: Review collapse implementation
- **Assignee:** reviewer
- **Dependencies:** task_2
- **Files:** public/dashboard.html

### Action
Review the collapsible timeline implementation in public/dashboard.html for:
1. **Event handling**: Ensure click handlers don't interfere with existing entry expand/collapse (e.stopPropagation used correctly)
2. **CSS correctness**: No style conflicts with existing .entry, .date-head, or mobile responsive styles
3. **Accessibility**: Buttons/clickable elements should be keyboard-accessible
4. **Edge cases**: Empty timeline, single day, filtered view — collapse should still work
5. **Code quality**: No duplicate IDs, clean variable names, consistent with existing code style
6. **Mobile compatibility**: Collapse buttons should be usable on mobile viewports (check existing @media queries)

### Verify
Read public/dashboard.html and verify no issues found

### Done
Review complete with no blocking issues, or issues filed for fix
