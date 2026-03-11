# Execution Plan

## task_1: Create src/discuss.ts core module
- **Assignee:** coder
- **Files:** src/discuss.ts

### Action
Create a new file `src/discuss.ts` implementing the multi-agent discussion orchestration module.

Interfaces to define:
- `DiscussionRound { agent: string; role: string; perspective: string }`
- `DiscussionResult { question: string; rounds: DiscussionRound[]; answer: string; duration: number; inputTokens: number; outputTokens: number; costUsd: number; agents: string[] }`
- `DiscussOptions { rounds?: number; engine?: Engine; agents?: string[] }`

Main exported function:
```typescript
export async function discussTeam(
  question: string,
  agents: TeamAgentDef[],
  cwd: string,
  model: string,
  options?: DiscussOptions,
): Promise<DiscussionResult>
```

Implementation flow:
1. **Parallel Perspectives (Round 1):** For each agent, call `runAgent()` from `./runner.js` with a prompt asking the agent to analyze the question from their role's perspective. Use `runParallel()` for concurrent execution. Prompt: `You are a {role}. Analyze this question deeply from your perspective:\n\nQuestion: {question}\n\nThink step by step. Consider trade-offs, risks, and alternatives. Provide your analysis in a structured format with clear reasoning. Call "report" with your analysis when done.`

2. **Debate Rounds (optional, 1-N):** If `options.rounds > 1`, run additional rounds where each agent sees all prior perspectives and responds. These run in parallel per round. Prompt includes formatted prior perspectives.

3. **Synthesis:** Run a single agent call (use the first agent, e.g. architect) with a synthesis prompt that combines all perspectives into a final coherent answer. The synthesis prompt asks to: synthesize key insights, highlight consensus, note disagreements, provide actionable recommendation, list open questions.

4. **Persist:** Write `.planning/DISCUSSION-{timestamp}.md` with full transcript: question, agent perspectives, debate rounds (if any), and final answer.

5. **Return:** DiscussionResult with aggregated token counts, cost, duration.

Imports needed: `runAgent, runParallel, detectEngine, type RunResult, type Engine` from `./runner.js`, `type TeamAgentDef` from `./agents.js`, `SharedMemory` from `./memory.js`, `log` from `./log.js`, `fs` and `path` from node.

Create a fresh `SharedMemory` for the discussion session. Use `teamRoster` string listing all participating agents. For each agent call, set `maxTurns` to 15 (discussions are shorter than builds). Accumulate `inputTokens` and `outputTokens` from each `RunResult`. Estimate cost at $3/M input + $15/M output (Sonnet rates).

Edge case: reject questions shorter than 10 characters with an error.
Edge case: minimum 2 agents required.
Edge case: cap rounds at 3 maximum.

### Verify
npx tsc --noEmit

### Done
src/discuss.ts exists, exports discussTeam function, compiles without errors

## task_2: Add mode/answer fields to HistoryEntry
- **Assignee:** coder
- **Files:** src/history.ts

### Action
Modify `src/history.ts` to add two optional fields to the `HistoryEntry` interface:

```typescript
export interface HistoryEntry {
  // ... all existing fields unchanged ...
  /** Task mode: build (default) or discuss */
  mode?: "build" | "discuss";
  /** Final answer text — only set for discuss mode */
  answer?: string;
}
```

These fields are backward-compatible: existing entries without them default to build mode. No other changes needed in this file — the `appendHistory`, `loadHistory`, `getHistoryStats` functions work unchanged since the new fields are optional.

### Verify
npx tsc --noEmit

### Done
HistoryEntry interface has mode and answer optional fields, project compiles

## task_3: Add mode field to QueueTask and branch in start()
- **Assignee:** coder
- **Dependencies:** task_1, task_2
- **Files:** src/queue.ts

### Action
Modify `src/queue.ts` to support discussion mode:

1. **Add import** at top: `import { discussTeam } from "./discuss.js";`

2. **Add `mode` to QueueTask interface:**
```typescript
export interface QueueTask {
  // ... existing fields ...
  mode?: "build" | "discuss";
  options: {
    // ... existing fields ...
    discussRounds?: number;
  };
}
```

3. **Update `add()` method** — accept `mode` in the `extra` parameter:
```typescript
add(goal: string, options?: QueueTask["options"], extra?: { engine?: Engine; dependsOn?: string[]; runAt?: string; mode?: "build" | "discuss" }): QueueTask {
```
And set it: `if (extra?.mode) task.mode = extra.mode;`

4. **Branch in `start()` method** — after the lock is acquired and agents are loaded (around line 342), add a branch before the existing `executeTeam` call:

```typescript
if (nextTask.mode === "discuss") {
  // Discussion mode — multi-agent reasoning
  const discussResult = await Promise.race([
    discussTeam(nextTask.goal, agents, this.cwd, model, {
      rounds: nextTask.options.discussRounds,
      engine,
    }),
    timeoutPromise,
  ]);

  const freshData = this.load();
  const freshTask = freshData.tasks.find(t => t.id === nextTask.id);
  if (freshTask) {
    freshTask.status = "done";
    freshTask.completedAt = new Date().toISOString();
    freshTask.result = {
      success: true,
      summary: discussResult.answer.slice(0, 500),
    };
    this.save(freshData);

    try {
      appendHistory(this.cwd, {
        date: new Date().toISOString(),
        project: path.basename(this.cwd),
        projectPath: this.cwd,
        queueTaskId: freshTask.id,
        goal: freshTask.goal,
        status: "done",
        startedAt: freshTask.startedAt!,
        completedAt: freshTask.completedAt!,
        duration: Date.parse(freshTask.completedAt!) - Date.parse(freshTask.startedAt!),
        tasksCompleted: discussResult.agents.length,
        tasksTotal: discussResult.agents.length,
        summary: discussResult.answer.slice(0, 500),
        engine: detectEngine(freshTask.engine) as string,
        inputTokens: discussResult.inputTokens,
        outputTokens: discussResult.outputTokens,
        costUsd: discussResult.costUsd,
        agents: discussResult.agents,
        mode: "discuss",
        answer: discussResult.answer,
      });
    } catch (e) {
      log.warn("queue", `Failed to record history: ${e}`);
    }
  }
  log.info("queue", `${nextTask.id}: discussion complete`);
} else {
  // existing executeTeam() flow (wrap existing code in this else block)
}
```

Skip autoCommit for discuss tasks (discussions don't produce code changes). Keep the existing error handling in the catch block — it already works for both modes.

5. **Update `plan()` method** — In the LLM prompt for parsing, no changes needed (plan is for build tasks only).

### Verify
npx tsc --noEmit

### Done
QueueTask has mode field, start() branches on discuss mode, discussion results are recorded in history with mode and answer fields

## task_4: Add discussions to SessionSummary and formatSummary
- **Assignee:** coder
- **Dependencies:** task_2
- **Files:** src/summary.ts

### Action
Modify `src/summary.ts` to display discussion results in the night summary:

1. **Add `discussions` array to SessionSummary interface:**
```typescript
export interface SessionSummary {
  // ... all existing fields ...
  discussions: {
    question: string;
    answer: string;
    agents: string[];
    duration: number;
    costUsd: number;
  }[];
}
```

2. **In `generateSummary()` function**, after the filtered entries are computed (around line 178), extract discussions:
```typescript
const discussions = filtered
  .filter((e: any) => e.mode === "discuss" && e.answer)
  .map((e: any) => ({
    question: e.goal,
    answer: e.answer as string,
    agents: e.agents ?? [],
    duration: e.duration,
    costUsd: e.costUsd ?? 0,
  }));
```
Note: Use `as any` cast because HistoryEntry type doesn't have mode/answer at compile time in this file's import — or better, import the updated HistoryEntry which now has those fields.

Add `discussions` to the return object.

3. **In `formatSummary()` function**, add a Discussions section after the Timeline section (before the Projects section). Destructure `discussions` from summary.

If `discussions.length > 0`:
```typescript
lines.push("  Discussions:");
for (const d of discussions) {
  const dur = formatDuration(d.duration);
  const cost = `$${d.costUsd.toFixed(2)}`;
  const agentCount = d.agents.length;
  // Truncate answer to first 150 chars for preview
  const preview = d.answer.length > 150
    ? d.answer.slice(0, 150).replace(/\n/g, " ") + "..."
    : d.answer.replace(/\n/g, " ");
  lines.push(`    Q: ${d.question}`);
  lines.push(`    A: ${preview}`);
  lines.push(`    (${agentCount} agents, ${dur}, ${cost})`);
  lines.push("");
}
```

### Verify
npx tsc --noEmit

### Done
SessionSummary has discussions array, formatSummary renders Discussions section with question/answer preview, project compiles

## task_5: Export discuss module from index.ts
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/index.ts

### Action
Add the following export line to `src/index.ts`:

```typescript
export { discussTeam, type DiscussionResult, type DiscussionRound, type DiscussOptions } from "./discuss.js";
```

Place it after the existing queue export line.

### Verify
npx tsc --noEmit

### Done
discuss module types are exported from index.ts

## task_6: Add --discuss flag and discuss command to CLI
- **Assignee:** coder
- **Dependencies:** task_3
- **Files:** src/cli.ts

### Action
Modify `src/cli.ts` to support discussion mode:

1. **Update `usage()` text** — In the Queue Commands section, update the `queue add` line and add discuss command:
```
Queue Commands (sleep mode):
  queue add <goal> [opts]  Add a task to the queue (--at <time> --auto-push)
    --discuss              Enable discussion mode (multi-agent reasoning)
    --rounds <N>           Number of debate rounds (default: 1, max: 3)
  queue plan <text> [opts] Parse natural language into multiple queue tasks
  ...
  discuss <question>       Convenience alias for queue add --discuss
```

2. **Add `discuss` command** — Before the `queue` command handler block, add:
```typescript
if (command === "discuss") {
  const { cwd } = parseCwdAndForce(args);
  const question = args.slice(1).filter(a => !a.startsWith("--") && a !== args[args.indexOf("--cwd") + 1]).join(" ").trim();
  
  // Parse --rounds
  let rounds = 1;
  const roundsIdx = args.indexOf("--rounds");
  if (roundsIdx !== -1 && roundsIdx + 1 < args.length) {
    rounds = parseInt(args[roundsIdx + 1], 10) || 1;
  }
  
  // Parse --at
  let runAt: string | undefined;
  const atIdx = args.indexOf("--at");
  if (atIdx !== -1 && atIdx + 1 < args.length) {
    const parsed = parseTimeString(args[atIdx + 1]);
    if (!parsed) {
      console.error(`Invalid time format: "${args[atIdx + 1]}".`);
      process.exit(1);
    }
    runAt = parsed;
  }
  
  if (!question || question.length < 10) {
    console.error("Usage: awsl discuss <question> [--rounds N] [--at <time>]");
    console.error("Question must be at least 10 characters.");
    process.exit(1);
  }
  
  const queue = new TaskQueue(cwd);
  const task = queue.add(question, { discussRounds: rounds }, { mode: "discuss", runAt });
  console.log(`Added discussion: ${task.id} — "${question}"`);
  if (rounds > 1) console.log(`  Debate rounds: ${rounds}`);
  if (runAt) console.log(`  Scheduled: ${runAt}`);
  console.log(`  Mode: discuss`);
  process.exit(0);
}
```

3. **Update `queue add` handler** — In the existing queue add section (around line 850-920), add parsing for `--discuss` and `--rounds` flags:

Parse flags (add to the existing flag parsing section):
```typescript
let discuss = false;
let discussRounds = 1;
// In the flag parsing loop:
if (a === "--discuss") { discuss = true; continue; }
if (a === "--rounds" && i + 1 < args.length) { discussRounds = parseInt(args[++i], 10) || 1; continue; }
```

When creating the task, pass mode:
```typescript
const task = queue.add(goal, {
  model, concurrency, quick,
  agentsDirs, autoPush,
  discussRounds: discuss ? discussRounds : undefined,
}, { engine, dependsOn, runAt: resolvedRunAt, mode: discuss ? "discuss" : undefined });
```

After the existing output lines, add:
```typescript
if (discuss) console.log(`  Mode: discuss (${discussRounds} round${discussRounds > 1 ? "s" : ""})`);
```

### Verify
npx tsc --noEmit

### Done
awsl discuss command works, queue add --discuss flag works, usage() text updated

## task_7: Add discussion mode to dashboard API
- **Assignee:** coder
- **Dependencies:** task_3
- **Files:** src/dashboard.ts

### Action
Modify `src/dashboard.ts` to support discussion mode:

1. **Update `/api/queue/add` endpoint** (around line 125-143) — Accept `mode` and `discussRounds` in the POST body:
```typescript
const { goal, engine, quick, dependsOn, runAt, mode, discussRounds } = JSON.parse(body);
```
Pass mode when creating the task:
```typescript
const task = queue.add(goal, { quick: !!quick, discussRounds }, { engine, dependsOn, runAt, mode });
```

2. **Add `GET /api/discussions` endpoint** — After the existing `/api/queue` GET handler, add:
```typescript
if (url.pathname === "/api/discussions" && req.method === "GET") {
  const data = loadHistory(cwd);
  const discussions = data.entries
    .filter((e: any) => e.mode === "discuss" && e.answer)
    .map((e: any) => ({
      id: e.queueTaskId,
      question: e.goal,
      answer: e.answer,
      agents: e.agents ?? [],
      date: e.completedAt,
      duration: e.duration,
      costUsd: e.costUsd ?? 0,
    }));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(discussions));
  return;
}
```

Make sure `loadHistory` is already imported (it is — check existing imports at the top of dashboard.ts).

### Verify
npx tsc --noEmit

### Done
/api/queue/add accepts mode field, /api/discussions endpoint returns discussion results

## task_8: Update documentation for discussion mode
- **Assignee:** coder
- **Dependencies:** task_6, task_7
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files to cover the new discussion mode feature:

**README.md (English):**
- Add a "Discussion Mode" section after the Queue/Sleep Mode section
- Explain the concept: multi-agent collaborative reasoning for hard questions
- Show CLI examples:
  ```bash
  awsl discuss "How should we design the authentication system?"
  awsl queue add --discuss "What database schema fits our use case?" --rounds 2
  awsl queue add --discuss --at 03:00 "Analyze microservices vs monolith trade-offs"
  ```
- Mention the discussion flow: parallel perspectives → debate rounds → synthesis
- Mention output: `.planning/DISCUSSION-{timestamp}.md` files
- Mention summary integration: discussions appear in `awsl summary` output
- Document the `/api/discussions` dashboard endpoint

**README.zh-CN.md (Chinese):**
- Mirror the same content in Chinese
- Section title: 讨论模式
- Same CLI examples (commands stay in English)

**BEST_PRACTICES.md (Chinese):**
- Add a section on when to use discussion mode vs build mode
- Good use cases: architecture decisions, design trade-offs, algorithm choices, technology evaluation
- Bad use cases: straightforward implementation tasks (use build mode instead)
- Tip: use --rounds 2-3 for complex topics where agents need to debate
- Tip: schedule overnight discussions with --at for complex topics
- Tip: check results in the summary or `.planning/DISCUSSION-*.md` files

### Verify
echo 'Documentation updated'

### Done
All three doc files updated with discussion mode documentation

## task_9: Review discussion mode implementation
- **Assignee:** reviewer
- **Dependencies:** task_1, task_2, task_3, task_4, task_5, task_6, task_7
- **Files:** src/discuss.ts, src/queue.ts, src/history.ts, src/summary.ts, src/cli.ts, src/dashboard.ts, src/index.ts

### Action
Review all files changed/created for the discussion mode feature. Check:

1. **Security:** No command injection in discuss.ts agent prompts. No unsanitized user input in file paths.
2. **Type safety:** All new interfaces properly typed. No unsafe `any` casts that could be avoided.
3. **Error handling:** discussTeam() handles agent failures gracefully (fail-soft). Queue start() properly handles discussion errors in catch block.
4. **Backward compatibility:** QueueTask.mode defaults to build. HistoryEntry.mode/answer optional. Summary handles entries without mode field.
5. **Convention compliance:** Uses `log` from `./log.js`, `.js` extensions on imports, follows existing patterns.
6. **Edge cases:** Question length validation (<10 chars). Minimum 2 agents. Rounds capped at 3. Discussion file naming is unique (timestamp-based).
7. **Cost tracking:** Token accumulation across all agent calls is correct. Cost estimation formula is reasonable.
8. **Memory leaks:** SharedMemory created per discussion is properly scoped.

Call report with findings and severity levels.

### Verify
npx tsc --noEmit && npm run build

### Done
All files reviewed, no critical or high-severity issues found (or issues documented for fixing)
