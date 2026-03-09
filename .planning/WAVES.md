# Execution Waves

## Wave 1

### task-1: Replace frontmatter parser with YAML + TypeBox schema
- **Role:** coder
- **Files:** src/agents.ts, package.json

### task-2: Refactor verify.ts to provider-based architecture
- **Role:** coder
- **Files:** src/verify.ts

## Wave 2

### task-3: Update callers for async verify
- **Role:** coder
- **After:** task-2
- **Files:** src/orchestrator.ts, src/cli.ts

### task-4: Update documentation
- **Role:** coder
- **After:** task-1, task-2
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

## Wave 3

### task-5: Review all changes
- **Role:** reviewer
- **After:** task-1, task-2, task-3, task-4
- **Files:** src/agents.ts, src/verify.ts, src/orchestrator.ts, src/cli.ts

---
Total: 5 tasks in 3 waves
Parallel tasks per wave: 2, 2, 1