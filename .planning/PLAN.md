# Execution Plan

## task_1: Refactor queue.ts: planPreview + planCommit
- **Assignee:** coder
- **Files:** src/queue.ts, src/index.ts

### Action
Refactor the existing `plan()` method in `src/queue.ts` into two public methods:

1. `planPreview(description: string): Promise<PlannedTask[]>` — Calls LLM via `callClaude()` with the existing prompt, parses the JSON response, returns the `PlannedTask[]` array WITHOUT modifying the queue. This is lines 557-595 of the current `plan()` method.

2. `planCommit(planned: PlannedTask[], defaults?: { engine?: Engine; quick?: boolean; concurrency?: number; model?: string }): QueueTask[]` — Takes a `PlannedTask[]` array, resolves dependency references (position→q_N IDs), adds each task to the queue via `this.add()`. This is lines 597-637 of the current `plan()` method.

3. Keep `plan()` as a backward-compatible wrapper that calls `planPreview()` then `planCommit()` and returns the result.

4. Update `src/index.ts` to ensure `PlannedTask` type is already exported (it is — just verify no changes needed).

Do NOT change the LLM prompt or any other behavior. Pure refactor — extract into two methods.

### Verify
npx tsc --noEmit

### Done
planPreview() and planCommit() are separate public methods on TaskQueue, plan() still works as backward compat wrapper, TypeScript compiles clean

## task_2: Add queue split CLI command
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/cli.ts

### Action
Add a new `queue split` subcommand in `src/cli.ts` inside the `if (command === 'queue')` block (around line 1142, before the `else` fallback). Implementation:

1. Parse the same options as `queue plan`: `--engine`, `--quick`, `--concurrency`, `--model`, `--yes` (new flag to skip confirmation), plus description text from remaining args.

2. Call `queue.planPreview(description)` to get the parsed `PlannedTask[]`.

3. Print a preview table:
```
拆分预览: N 个任务

  #   Deps       Goal
  ─────────────────────────────────────────
  1   (none)     构建用户认证模块
  2   1          添加支付模块
  3   all        写集成测试
```

4. If `--yes` flag is NOT set, prompt for confirmation using Node.js `readline`:
```
确认添加到队列? (y/N) 
```
Read one line from stdin. If not 'y' or 'Y', print '已取消' and exit.

5. If confirmed (or `--yes`), call `queue.planCommit(planned, { engine, quick, concurrency, model })` and print the result table (same format as existing `queue plan` output with actual q_N IDs).

6. Update the `usage()` function to add the new command:
```
  queue split <text> [opts] Preview task splitting before adding to queue
    --yes                  Skip confirmation, add immediately
```

7. Update the error message on line 1143 to include 'split' in the list of valid commands.

For readline, use: `import { createInterface } from 'node:readline';` — create interface with stdin/stdout, ask question, close after answer. Wrap in a Promise for async/await.

### Verify
npx tsc --noEmit

### Done
`awsl queue split <text>` shows preview table and prompts for confirmation, `--yes` flag skips prompt, usage() updated, types compile clean

## task_3: Add tests for planPreview + planCommit
- **Assignee:** tester
- **Dependencies:** task_1
- **Files:** src/queue.test.ts

### Action
Add tests to `src/queue.test.ts` for the new `planPreview` and `planCommit` methods. Since `planPreview` calls an LLM (can't test in unit tests), focus on `planCommit`:

1. Test `planCommit` with simple independent tasks (no deps):
```typescript
test('planCommit adds tasks with no dependencies', () => {
  const dir = makeTmpDir();
  try {
    const queue = new TaskQueue(dir);
    const planned: PlannedTask[] = [
      { goal: 'Build auth module', quick: false },
      { goal: 'Build payment module', quick: true },
    ];
    const added = queue.planCommit(planned);
    assert.equal(added.length, 2);
    assert.equal(added[0].goal, 'Build auth module');
    assert.equal(added[1].goal, 'Build payment module');
    assert.equal(added[1].options.quick, true);
    // Verify persisted
    const all = queue.list();
    assert.equal(all.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

2. Test `planCommit` with position-based dependencies:
```typescript
test('planCommit resolves position-based dependencies', () => {
  const dir = makeTmpDir();
  try {
    const queue = new TaskQueue(dir);
    const planned: PlannedTask[] = [
      { goal: 'First task', dependsOn: [] },
      { goal: 'Second task', dependsOn: ['1'] },
      { goal: 'Third task', dependsOn: ['all'] },
    ];
    const added = queue.planCommit(planned);
    assert.equal(added.length, 3);
    assert.equal(added[0].dependsOn, undefined);
    assert.deepEqual(added[1].dependsOn, [added[0].id]);
    assert.deepEqual(added[2].dependsOn, ['all']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

3. Test `planCommit` with defaults (engine, model):
```typescript
test('planCommit applies defaults', () => {
  const dir = makeTmpDir();
  try {
    const queue = new TaskQueue(dir);
    const planned: PlannedTask[] = [{ goal: 'A task', quick: false }];
    const added = queue.planCommit(planned, { model: 'test-model', concurrency: 4 });
    assert.equal(added[0].options.model, 'test-model');
    assert.equal(added[0].options.concurrency, 4);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

4. Test `planCommit` with empty array throws or returns empty:
```typescript
test('planCommit with empty array returns empty', () => {
  const dir = makeTmpDir();
  try {
    const queue = new TaskQueue(dir);
    const added = queue.planCommit([]);
    assert.equal(added.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

Import `PlannedTask` from `./queue.js` at the top of the file (it's already imported for QueueTask).

### Verify
npx tsx --test src/queue.test.ts

### Done
All planCommit tests pass: independent tasks, position deps, defaults, empty array

## task_4: Update documentation for queue split
- **Assignee:** coder
- **Dependencies:** task_1, task_2
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files to cover the new `queue split` command:

**README.md** (English):
- In the Queue Commands section, add `queue split` with description: splits a natural language description into independent queue tasks with preview before committing. Mention `--yes` flag.
- Add a brief example: `awsl queue split "Build auth, then payments, finally integration tests"`

**README.zh-CN.md** (Chinese):
- Mirror the same changes in Chinese. `queue split` = 拆分任务。
- Example: `awsl queue split "先构建认证，然后加支付，最后写集成测试"`
- Mention the interactive preview + confirmation flow.

**BEST_PRACTICES.md** (Chinese):
- Add a section or update the queue section explaining when to use `queue split` vs `queue plan` vs `queue add`.
- `queue split` = 推荐方式，先预览再确认
- `queue plan` = 直接添加（向后兼容）
- `queue add` = 手动添加单个任务
- Include a usage example showing the preview output format.

Keep changes minimal and consistent with existing doc style.

### Verify
Check that all three files mention 'queue split' with examples

### Done
README.md, README.zh-CN.md, and BEST_PRACTICES.md all document queue split with examples and usage guidance
