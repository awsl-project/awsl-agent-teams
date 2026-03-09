# Execution Plan

## task_1: Add atomicCommit to queue.ts
- **Assignee:** coder
- **Files:** src/queue.ts

### Action
In src/queue.ts:
1. Add import: `import { atomicCommit } from "./planning.js";` (line 17, after the history import)
2. After the SUCCESS path history recording block (after line 356 `}`), add:
```typescript
// Auto-commit queue state after task completion
try {
	atomicCommit(this.cwd, freshTask.id, `queue: ${freshTask.id} done — ${freshTask.goal}`);
} catch (e) {
	log.warn("queue", `Failed to auto-commit after task: ${e}`);
}
```
3. After the FAILURE path history recording block (after line 391 `}`), add:
```typescript
// Auto-commit queue state after task failure
try {
	atomicCommit(this.cwd, freshTask.id, `queue: ${freshTask.id} failed — ${freshTask.goal}`);
} catch (e) {
	log.warn("queue", `Failed to auto-commit after task: ${e}`);
}
```
Both commits capture QUEUE.json and HISTORY.json changes. The atomicCommit function already handles detecting changed files and staging only .planning/ files.

### Verify
npx tsc --noEmit

### Done
queue.ts imports atomicCommit and calls it in both success and failure paths after each executeTeam completes

## task_2: Update documentation
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files to mention the new auto-commit behavior after queue tasks:
1. README.md — In the Queue section, add a note that each queue task automatically commits its state (QUEUE.json + HISTORY.json) upon completion
2. README.zh-CN.md — Mirror the same change in Chinese
3. BEST_PRACTICES.md — Add a brief note in the queue usage section explaining that queue tasks now auto-commit, so users can track progress via git log

### Verify
grep -l 'auto-commit\|自动.*commit' README.md README.zh-CN.md BEST_PRACTICES.md

### Done
All three docs mention queue auto-commit behavior

## task_3: Review queue commit implementation
- **Assignee:** reviewer
- **Dependencies:** task_1
- **Files:** src/queue.ts

### Action
Review the atomicCommit integration in queue.ts for:
1. Error handling — commit failures must not crash the queue loop (should be wrapped in try/catch)
2. Correct placement — commits happen AFTER save() and appendHistory(), not before
3. No duplicate commits — ensure atomicCommit isn't also called elsewhere in the same code path (check orchestrator.ts autoCommit option)
4. Commit message format — should include task ID and goal for traceability
5. No security issues — commit messages don't leak sensitive data

### Verify
npx tsc --noEmit

### Done
Review confirms: error-safe, correctly placed, no duplicates, good commit messages

## task_4: Build verification
- **Assignee:** tester
- **Dependencies:** task_1
- **Files:** src/queue.ts

### Action
Run full build and type-check to verify the changes compile correctly:
1. Run `npx tsc --noEmit` to type-check
2. Run `npm run build` to compile
3. Verify no new warnings or errors introduced

### Verify
npm run build && npx tsc --noEmit

### Done
Build succeeds with zero errors
