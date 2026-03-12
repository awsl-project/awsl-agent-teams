# Execution Waves

## Wave 1

### task_1: Atomic write utility function
- **Role:** coder
- **Files:** src/fs-utils.ts, src/index.ts

### task_8: Cleanup pending commands on client disconnect
- **Role:** coder
- **Files:** src/relay.ts

## Wave 2

### task_2: Atomic writes in queue.ts
- **Role:** coder
- **After:** task_1
- **Files:** src/queue.ts

### task_3: Atomic writes in planning.ts and history.ts
- **Role:** coder
- **After:** task_1
- **Files:** src/planning.ts, src/history.ts

### task_4: Atomic writes in verify.ts and projects.ts refactor
- **Role:** coder
- **After:** task_1
- **Files:** src/verify.ts, src/projects.ts

## Wave 3

### task_5: Queue file locking
- **Role:** coder
- **After:** task_2, task_1
- **Files:** src/queue.ts, src/fs-utils.ts

## Wave 4

### task_6: Event-driven status push on task completion
- **Role:** coder
- **After:** task_5
- **Files:** src/queue.ts, src/remote.ts

## Wave 5

### task_7: Full state sync on reconnect
- **Role:** coder
- **After:** task_6
- **Files:** src/remote.ts

## Wave 6

### task_9: Delta sync for status messages
- **Role:** coder
- **After:** task_7
- **Files:** src/remote.ts

## Wave 7

### task_10: Documentation update
- **Role:** coder
- **After:** task_5, task_6, task_8, task_9
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

## File Conflict Resolutions

- **task_1** and **task_5** serialized due to shared files: src/fs-utils.ts
- **task_5** and **task_6** serialized due to shared files: src/queue.ts

---
Total: 10 tasks in 7 waves
Parallel tasks per wave: 2, 3, 1, 1, 1, 1, 1