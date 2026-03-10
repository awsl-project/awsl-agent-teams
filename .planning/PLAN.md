# Execution Plan

## task_1: Collapsible timeline and queue details
- **Assignee:** coder
- **Files:** public/dashboard.html

### Action
Modify public/dashboard.html to make task details collapsible (hidden by default, shown on click):

1. **CSS changes:**
   - Add `.entry-details { display: none; }` to hide timeline card details (goal, tasks, summary) by default
   - Add `.entry.expanded .entry-details { display: block; }` to show when expanded
   - Add `.entry { cursor: pointer; }` to indicate clickability
   - Add `.q-summary-row { display: none; }` to hide queue summary rows by default
   - Add `.q-summary-row.expanded { display: table-row; }` to show when expanded
   - Add a subtle expand indicator (chevron ▸/▾) to both entry cards and queue rows

2. **Timeline renderTimeline() changes (around line 1096-1106):**
   - Wrap the `.entry-goal`, `.entry-tasks`, and `.entry-summary` divs inside a container `<div class="entry-details">...</div>`
   - Add a click handler on the card: `card.onclick = function() { this.classList.toggle('expanded'); }`
   - Add a small chevron indicator in the `.entry-row1` div (e.g., `<span class="entry-toggle">▸</span>`) that changes to ▾ when expanded via CSS: `.entry.expanded .entry-toggle { transform: rotate(90deg); }` or just swap text

3. **Queue renderQueue() changes (around line 1171-1177):**
   - On the main task row `<tr>`, add an onclick handler: `onclick="toggleQueueDetail('qd_' + i)"` to toggle the next `.q-summary-row`
   - Give each `.q-summary-row` a unique id like `id="qd_0"`, `id="qd_1"`, etc.
   - Add a JS function `toggleQueueDetail(id)` that toggles the `.expanded` class on the summary row
   - Add `cursor: pointer` to `.q-table tr` rows that have summaries
   - Add a small toggle indicator (▸/▾) in the row

4. **Keep it simple:** No animation needed, just show/hide with display toggle. Use CSS classes for state, no extra JS state management.

### Verify
npm run build && open public/dashboard.html in browser — click timeline cards to expand/collapse details, click queue task rows to show/hide summaries

### Done
Timeline entry details (goal, tasks, summary) are hidden by default and shown on click. Queue summary rows are hidden by default and shown on click. Visual chevron indicator shows expand/collapse state.
