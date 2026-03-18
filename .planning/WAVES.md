# Execution Waves

## Wave 1

### task_1: codex-auto-detection
- **Role:** coder
- **Files:** `src/runner.ts`

## Wave 2

### task_2: codex-env-override
- **Role:** coder
- **After:** task_1
- **Files:** `src/runner.ts`

## Wave 3

### task_3: codex-sandbox-mapping
- **Role:** coder
- **After:** task_2
- **Files:** `src/runner.ts`

## Wave 4

### task_4: codex-result-parsing
- **Role:** coder
- **After:** task_3
- **Files:** `src/runner.ts`

## Wave 5

### task_5: codex-progress-events
- **Role:** coder
- **After:** task_4
- **Files:** `src/runner.ts`

## Wave 6

### task_6: codex-session-resume
- **Role:** coder
- **After:** task_4, task_5
- **Files:** `src/runner.ts`

## Wave 7

### task_7: docs-update
- **Role:** coder
- **After:** task_1, task_2, task_3, task_4, task_5, task_6
- **Files:** `README.md`, `README.zh-CN.md`, `BEST_PRACTICES.md`

## File Conflict Resolutions

- **task_1** and **task_2** serialized due to shared files: `src/runner.ts`
- **task_2** and **task_3** serialized due to shared files: `src/runner.ts`
- **task_3** and **task_4** serialized due to shared files: `src/runner.ts`
- **task_5** and **task_6** serialized due to shared files: `src/runner.ts`

---
Total: 7 tasks in 7 waves
Parallel tasks per wave: 1, 1, 1, 1, 1, 1, 1