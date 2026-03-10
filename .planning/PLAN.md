# Execution Plan

## task_1: Add read tool path validation
- **Assignee:** coder
- **Files:** src/sandbox.ts, src/tools.ts

### Action
Add read tool path validation

## task_2: Dashboard: localhost bind + CORS + body limit
- **Assignee:** coder
- **Files:** src/dashboard.ts

### Action
Dashboard: localhost bind + CORS + body limit

## task_3: Fix shell injection in git commands
- **Assignee:** coder
- **Files:** src/planning.ts

### Action
Fix shell injection in git commands

## task_4: Expand coder bash denylist
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/sandbox.ts

### Action
Expand coder bash denylist

## task_5: Verify all fixes build correctly
- **Assignee:** tester
- **Dependencies:** task_1, task_2, task_3, task_4
- **Files:** src/tools.ts, src/dashboard.ts, src/planning.ts, src/sandbox.ts

### Action
Verify all fixes build correctly
