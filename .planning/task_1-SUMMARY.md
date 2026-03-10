# task_1: Add collapse state tracking to renderTimeline

Assignee: coder
Status: done

## Result
All good — JavaScript parses without errors.

## AWSL_RESULT

Added collapse state tracking to `renderTimeline` in `public/dashboard.html`:

**Changes:**
1. **Line 843** — Added `timelineWrapCollapsed = {}` state object to track per-viewKey (per-client) timeline section collapse state
2. **Lines 1113-1122** — Updated `toggleTimeline()` to persist collapse state into `timelineWrapCollapsed` keyed by current viewKey
3. **Lines 1142-1151** — Added restore logic at the top of `renderTimeline()` that reads `timelineWrapCollapsed[viewKey]` and applies/removes the `collapsed` class + updates button text accordingly

**What this fixes:** Previously, the timeline-wrap collapsed/expanded state was only stored as a DOM class, so it was lost when switching between remote clients. Now each client's timeline collapse preference is tracked independently and restored on every render.

**Files modified:** `public/dashboard.html`