# Execution Waves

## Wave 1

### task_1: LogStream event emitter module
- **Role:** coder
- **Files:** src/logstream.ts

## Wave 2

### task_2: Pipe runner output to LogStream
- **Role:** coder
- **After:** task_1
- **Files:** src/runner.ts

### task_3: Dashboard server — SSE logs + queue mutation APIs
- **Role:** coder
- **After:** task_1
- **Files:** src/dashboard.ts

### task_5: Export LogStream API
- **Role:** coder
- **After:** task_1
- **Files:** src/index.ts

## Wave 3

### task_4: Dashboard HTML — log panel, notifications, trend chart, queue operations
- **Role:** coder
- **After:** task_3
- **Files:** public/dashboard.html

## Wave 4

### task_6: Update documentation
- **Role:** coder
- **After:** task_2, task_3, task_4
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

## Wave 5

### task_7: Build and verify
- **Role:** reviewer
- **After:** task_2, task_4, task_5, task_6
- **Files:** src/logstream.ts, src/runner.ts, src/dashboard.ts, src/index.ts, public/dashboard.html, README.md, README.zh-CN.md, BEST_PRACTICES.md

---
Total: 7 tasks in 5 waves
Parallel tasks per wave: 1, 3, 1, 1, 1