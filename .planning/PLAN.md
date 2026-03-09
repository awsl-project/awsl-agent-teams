# Execution Plan

## task_1: Add POST /api/history/clear endpoint
- **Assignee:** coder
- **Files:** src/dashboard.ts

### Action
1. Add `clearHistory` to the import from `./history.js` on line 12: change `{ loadHistory, getHistoryStats }` to `{ loadHistory, getHistoryStats, clearHistory }`.
2. Add a new route handler BEFORE the 404 block (before line 174). Follow the exact pattern of `POST /api/queue/clear` (lines 166-172):
```typescript
if (req.method === "POST" && url.pathname === "/api/history/clear") {
	clearHistory(cwd);
	res.writeHead(200, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ cleared: true }));
	return;
}
```
3. Update the log.info on line 182 to include the new endpoint in the API list.

### Verify
npx tsc --noEmit

### Done
POST /api/history/clear endpoint exists in dashboard.ts, calls clearHistory(cwd), returns { cleared: true }

## task_2: Add Clear History button to dashboard UI
- **Assignee:** coder
- **Files:** public/dashboard.html

### Action
1. Add a 'Clear History' button in the Timeline card header area (near line 625). Add it next to the h2, styled like the existing queue 'Clear All' button. Example:
```html
<div class="card">
  <h2>📋 Timeline <button onclick="clearHistory()" style="float:right;font-size:12px;padding:2px 10px;cursor:pointer;background:var(--ink2);color:var(--ink4);border:1px solid var(--ink3);font-family:inherit">Clear History</button></h2>
```
2. Add a `clearHistory()` JS function near the existing `clearQueue()` function (around line 1069). Follow the same pattern:
```javascript
async function clearHistory() {
  if (!confirm('Clear all history entries?')) return;
  try {
    await fetch('/api/history/clear', { method: 'POST' });
  } catch(e) {}
  if (await load()) render();
}
```
IMPORTANT: Include a `confirm()` dialog since this is destructive (deletes HISTORY.json). The queue clear does not have confirm but history is more valuable data.

### Verify
Open dashboard in browser, verify button appears in Timeline card header

### Done
Clear History button visible in Timeline card, clicking it prompts confirm dialog, then calls POST /api/history/clear and refreshes the view

## task_3: Review clear history implementation
- **Assignee:** reviewer
- **Dependencies:** task_1, task_2
- **Files:** src/dashboard.ts, public/dashboard.html, src/history.ts

### Action
Review the two changed files for:
1. Security: ensure the endpoint doesn't accept arbitrary paths or have injection risks
2. Correctness: verify clearHistory(cwd) is called with the correct cwd, and the response format matches other endpoints
3. UI: verify the confirm dialog prevents accidental data loss
4. Consistency: ensure the new code follows existing patterns (compare with queue/clear)
5. Check that the import is correct and no unused imports were added

### Verify
npx tsc --noEmit

### Done
No security or correctness issues found, code follows existing patterns

## task_4: Update documentation for Clear History
- **Assignee:** coder
- **Dependencies:** task_1, task_2
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Add Clear History feature to documentation:
1. README.md — In the Dashboard section, mention the Clear History button and POST /api/history/clear API endpoint
2. README.zh-CN.md — Mirror the same changes in Chinese
3. BEST_PRACTICES.md — Add a note about the Clear History feature under the dashboard section
Keep changes minimal — just add a line or two mentioning the new capability. Do NOT rewrite existing content.

### Verify
Read the three files to verify the new content is present and accurate

### Done
All three docs mention Clear History feature
