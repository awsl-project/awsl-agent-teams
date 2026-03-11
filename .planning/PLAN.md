# Execution Plan

## task_1: Fix Clear History button style
- **Assignee:** coder
- **Files:** public/dashboard.html

### Action
On line 949 of public/dashboard.html, replace the Clear History button's inline style with the tl-collapse-btn class. Change:

<button onclick="clearHistory()" style="float:right;font-size:12px;padding:2px 10px;cursor:pointer;background:var(--ink2);color:var(--ink4);border:1px solid var(--ink3);font-family:inherit">Clear History</button>

To:

<button class="tl-collapse-btn" onclick="clearHistory()" style="float:right">Clear History</button>

This reuses the existing .tl-collapse-btn class (line 439) which has background:none, proper border, and hover styles. Keep only float:right as inline style since that's layout-specific positioning not shared by sibling buttons.

### Verify
Open the dashboard in a browser and visually confirm the Clear History button now has a transparent background matching the Collapse/Expand buttons

### Done
Clear History button uses .tl-collapse-btn class with transparent background, matching sibling button styles
