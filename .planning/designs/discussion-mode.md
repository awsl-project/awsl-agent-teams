# Design: Discussion Mode (多Agent讨论模式)

## Problem

AWSL currently only supports "build" tasks — code generation pipelines with plan → execute → verify. Users also need a **discussion mode** where multiple agents collaboratively reason about hard problems (architecture decisions, design trade-offs, algorithm choices) and produce a synthesized answer. This is especially useful for overnight "think about this" tasks.

## Decision: Separate Module (Approach B)

**Why not extend orchestrator.ts?** The discussion pipeline (parallel perspectives → debate → synthesis) is fundamentally different from the build pipeline (plan → wave execution → verify). Mixing them would create conditional complexity in both paths.

**Why not inline in queue.ts?** Discussion logic is non-trivial (~150 lines) and deserves its own module for testability and clarity.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Queue (queue.ts)                               │
│                                                 │
│  if mode === "discuss" → discussTeam()          │
│  if mode === "build"   → executeTeam()          │
└─────────────────────────────────────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌─────────────────────────┐
│  discuss.ts     │    │  orchestrator.ts         │
│                 │    │  (existing build flow)   │
│  Round 1:       │    └─────────────────────────┘
│    Parallel     │
│    perspectives │
│  Round 2..N:    │
│    Debate       │
│  Synthesis:     │
│    Final answer │
└─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│  Persist:                                       │
│  • .planning/DISCUSSION-{queueTaskId}.md        │
│  • HISTORY.json (with answer field)             │
│  • Summary timeline shows answer                │
└─────────────────────────────────────────────────┘
```

## Data Model Changes

### 1. QueueTask — add `mode` field

```typescript
// src/queue.ts
interface QueueTask {
  // ... existing fields unchanged
  mode?: "build" | "discuss";  // default: "build"
}
```

Backward compatible: existing tasks without `mode` default to "build".

### 2. HistoryEntry — add `mode` and `answer` fields

```typescript
// src/history.ts
interface HistoryEntry {
  // ... existing fields unchanged
  mode?: "build" | "discuss";  // default: "build"
  answer?: string;             // only set for discuss mode
}
```

### 3. SessionSummary — add `discussions` array

```typescript
// src/summary.ts
interface SessionSummary {
  // ... existing fields unchanged
  discussions: {
    question: string;
    answer: string;
    agents: string[];
    duration: number;
    costUsd: number;
  }[];
}
```

## New Module: src/discuss.ts

### Interfaces

```typescript
interface DiscussionRound {
  agent: string;
  role: string;
  perspective: string;
}

interface DiscussionResult {
  question: string;
  rounds: DiscussionRound[];
  answer: string;
  duration: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  agents: string[];
}

interface DiscussOptions {
  rounds?: number;      // debate rounds (default: 1)
  engine?: Engine;
  agents?: string[];    // subset of agents to use (default: all)
}
```

### Core Function

```typescript
async function discussTeam(
  question: string,
  agents: TeamAgentDef[],
  cwd: string,
  model: string,
  options?: DiscussOptions,
): Promise<DiscussionResult>
```

### Discussion Flow

**Round 1 — Parallel Perspectives:**
Each agent independently analyzes the question from their role's viewpoint. All agents run in parallel via `runParallel()`.

Prompt template per agent:
```
You are a {role}. Analyze this question deeply from your perspective:

Question: {question}

Think step by step. Consider trade-offs, risks, and alternatives.
Provide your analysis in a structured format with clear reasoning.
Call "report" with your analysis when done.
```

**Round 2..N — Debate (optional):**
Each agent sees all prior perspectives and can respond, challenge, or build upon them. Runs sequentially to allow back-and-forth.

Prompt template:
```
You are a {role}. Other agents have shared their perspectives on this question:

Question: {question}

{formatted_prior_perspectives}

Respond to the other perspectives. Where do you agree? Disagree?
What did others miss? What would you add or change?
Call "report" with your response.
```

**Synthesis — Final Answer:**
A dedicated synthesis prompt combines all perspectives into a coherent, actionable answer.

Prompt template:
```
You are a senior technical advisor synthesizing a multi-agent discussion.

Question: {question}

Agent Perspectives:
{all_perspectives_formatted}

Produce a comprehensive answer that:
1. Synthesizes the key insights from all perspectives
2. Highlights areas of consensus
3. Notes significant disagreements and their implications
4. Provides a clear, actionable recommendation
5. Lists open questions or areas needing further investigation

Format your answer in clear markdown with sections.
Call "report" with the final synthesized answer.
```

### Persistence

After synthesis, write `.planning/DISCUSSION-{queueTaskId}.md`:

```markdown
# Discussion: {question}

**Date:** {ISO timestamp}
**Agents:** {agent list}
**Rounds:** {N}
**Duration:** {Xm}
**Cost:** ${X.XX}

---

## Agent Perspectives

### Architect
{perspective}

### Coder
{perspective}

### Reviewer
{perspective}

### Tester
{perspective}

## Debate (Round 2)
{if applicable}

---

## Final Answer

{synthesized answer}
```

## Queue Integration (queue.ts changes)

In `TaskQueue.start()`, the task execution branch:

```typescript
if (nextTask.mode === "discuss") {
  const discussResult = await discussTeam(
    nextTask.goal,
    agents,
    this.cwd,
    model,
    { engine, rounds: nextTask.options.discussRounds }
  );
  // Map to existing result format
  freshTask.status = "done";
  freshTask.result = { success: true, summary: discussResult.answer.slice(0, 500) };
  // Record history with answer
  appendHistory(this.cwd, {
    ...commonFields,
    mode: "discuss",
    answer: discussResult.answer,
    inputTokens: discussResult.inputTokens,
    outputTokens: discussResult.outputTokens,
    costUsd: discussResult.costUsd,
    agents: discussResult.agents,
  });
} else {
  // existing executeTeam() flow
}
```

## Dashboard Integration

### API Changes

**`POST /api/queue/add`** — accept `mode` field:
```json
{ "goal": "How should we design auth?", "mode": "discuss" }
```

**`GET /api/discussions`** — new endpoint, returns discussion files:
```json
[{
  "id": "q_5",
  "question": "How should we design auth?",
  "answer": "Based on the multi-agent discussion...",
  "agents": ["architect", "coder", "reviewer", "tester"],
  "date": "2026-03-11T03:00:00Z",
  "duration": 900000
}]
```

### Dashboard UI Changes

- **Queue Add Form:** Toggle switch — "Discussion Mode" (讨论模式)
  - When enabled, the "Goal" label changes to "Question" (问题)
  - Optional: rounds selector (1-3)
- **Timeline entries:** Discussion entries get a distinct icon/color
  - Shows question text + first ~100 chars of answer as preview
  - Click to expand → full answer in a modal/panel

## Summary Integration (summary.ts changes)

### generateSummary() changes

Filter history entries where `mode === "discuss"` into a separate `discussions` array:

```typescript
const discussions = filtered
  .filter(e => e.mode === "discuss" && e.answer)
  .map(e => ({
    question: e.goal,
    answer: e.answer!,
    agents: e.agents ?? [],
    duration: e.duration,
    costUsd: e.costUsd ?? 0,
  }));
```

### formatSummary() changes

Add a "Discussions" section after Timeline:

```
  Discussions:
    02:30  Q: How should we design the auth system?
           A: Based on analysis from 4 agents, we recommend OAuth2 with
              JWT tokens. The architect highlighted scalability concerns
              with session-based auth, while the reviewer identified...
              [truncated — see .planning/DISCUSSION-q_5.md]
           (4 agents, 15m, $0.42)
```

## CLI Integration

### `queue add --discuss`

```bash
awsl queue add --discuss "How should we design the authentication system?"
awsl queue add --discuss --rounds 2 "What's the best database schema for this use case?"
awsl queue add --discuss --at 03:00 "Analyze the trade-offs of microservices vs monolith for our project"
```

### New: `awsl discuss` (convenience alias)

```bash
awsl discuss "question here"
# equivalent to: awsl queue add --discuss "question here"
```

### CLI usage() additions

```
Queue Commands (sleep mode):
  queue add <goal> [opts]    Add a task to the queue
    --discuss                Enable discussion mode (multi-agent reasoning)
    --rounds <N>             Number of debate rounds (default: 1, max: 3)
```

## QueueTask.options extension

```typescript
interface QueueTask {
  // existing...
  options: {
    // existing...
    discussRounds?: number;  // only for discuss mode, default: 1
  };
}
```

## Export Changes (index.ts)

```typescript
export { discussTeam, type DiscussionResult, type DiscussionRound, type DiscussOptions } from "./discuss.js";
```

## File Inventory

| File | Change Type | Description |
|------|-------------|-------------|
| `src/discuss.ts` | **NEW** | Discussion orchestration module (~150 lines) |
| `src/queue.ts` | MODIFY | Add mode branch in start(), accept mode in add() |
| `src/history.ts` | MODIFY | Add `mode` and `answer` fields to HistoryEntry |
| `src/summary.ts` | MODIFY | Add discussions to SessionSummary, render in formatSummary() |
| `src/dashboard.ts` | MODIFY | Accept `mode` in /api/queue/add, new /api/discussions endpoint |
| `src/cli.ts` | MODIFY | Add --discuss flag to queue add, add `discuss` command alias |
| `src/index.ts` | MODIFY | Export discuss module types |
| `public/dashboard.html` | MODIFY | Discussion toggle UI, answer display in timeline |
| `README.md` | MODIFY | Document discussion mode |
| `README.zh-CN.md` | MODIFY | Document discussion mode (Chinese) |
| `BEST_PRACTICES.md` | MODIFY | Add discussion mode usage guide |

## Edge Cases

1. **Empty question:** Reject questions under 10 characters with error message.
2. **Agent subset:** If `--agents` specified, only those agents participate. Minimum 2 agents required.
3. **Rate limits:** Reuse existing rate limit retry logic from runner.ts.
4. **Checkpoint:** Discussion state not checkpointed (discussions are faster than builds; restart from scratch on failure).
5. **Cost control:** Log estimated cost before starting. Default 1 round ≈ 5 agent calls (4 perspectives + 1 synthesis).

## Migration

No migration needed. New fields are all optional with backward-compatible defaults:
- `QueueTask.mode` defaults to `"build"` when absent
- `HistoryEntry.mode` defaults to `"build"` when absent
- `HistoryEntry.answer` is `undefined` for build tasks
- `SessionSummary.discussions` is `[]` for sessions with no discussions
