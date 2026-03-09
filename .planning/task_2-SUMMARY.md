# task_2: 1. Add a 'Clear History' button in the Timeline card header 

Assignee: coder
Status: done

## Result
Both changes are in place.

## AWSL_RESULT

### Task 2 Complete — Clear History button added to Dashboard

**File modified:** `public/dashboard.html`

**Changes:**
1. **Line 625** — Added "Clear History" button in the Timeline card header, styled consistently with the existing queue "Clear All" button (inline style using `var(--ink2/3/4)` theme variables, float-right positioning)
2. **Lines 1076-1082** — Added `clearHistory()` JS function following the same pattern as `clearQueue()`, with an added `confirm()` dialog since history deletion is destructive (deletes HISTORY.json)

**Behavior:**
- Button appears right-aligned in the Timeline `<h2>` header
- Click triggers `confirm('Clear all history entries?')` — cancellable
- On confirm, POSTs to `/api/history/clear`, then reloads and re-renders the dashboard