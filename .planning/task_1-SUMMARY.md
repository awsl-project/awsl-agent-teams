# task_1: On line 949 of public/dashboard.html, replace the Clear Hist

Assignee: coder
Status: done

## Result
Clean type-check. The fix is applied.

## AWSL_RESULT

**Fixed**: Replaced the Clear History button's inline style with the `.tl-collapse-btn` class in `public/dashboard.html:949`.

**Before**: `<button onclick="clearHistory()" style="float:right;font-size:12px;padding:2px 10px;cursor:pointer;background:var(--ink2);color:var(--ink4);border:1px solid var(--ink3);font-family:inherit">Clear History</button>`

**After**: `<button class="tl-collapse-btn" onclick="clearHistory()" style="float:right">Clear History</button>`

The button now uses the existing `.tl-collapse-btn` class (line 439) which provides `background: none`, proper border styling, and hover effects — matching the sibling Collapse/Expand buttons. Only `float:right` remains as inline style for layout positioning.

**Files modified**: `public/dashboard.html`