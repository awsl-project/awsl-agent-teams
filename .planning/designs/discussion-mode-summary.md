# Discussion Mode — Implementation Guide (Concise)

## What to Build

A "discuss" mode for the queue where multiple agents reason about a question and produce a synthesized answer.

## Files to Change (in order)

### 1. NEW: src/discuss.ts (~150 lines)

Core function: `discussTeam(question, agents, cwd, model, options?) → DiscussionResult`

Flow:
1. Parallel: each agent writes perspective via runParallel()
2. Optional debate rounds (sequential, agents respond to each other)
3. Synthesis: combine all into final answer via single agent call
4. Persist: write .planning/DISCUSSION-{id}.md

Key types:
- `DiscussionResult { question, rounds: DiscussionRound[], answer, duration, inputTokens, outputTokens, costUsd, agents }`
- `DiscussionRound { agent, role, perspective }`
- `DiscussOptions { rounds?: number, engine?: Engine, agents?: string[] }`

### 2. MODIFY: src/history.ts

Add to HistoryEntry:
- `mode?: "build" | "discuss"`
- `answer?: string`

### 3. MODIFY: src/queue.ts

- Add `mode?: "build" | "discuss"` to QueueTask interface
- Add `discussRounds?: number` to QueueTask.options
- In `add()`: accept mode in extra param
- In `start()`: branch on `nextTask.mode === "discuss"` → call discussTeam() instead of executeTeam()
- Skip autoCommit/verify for discuss tasks

### 4. MODIFY: src/summary.ts

- Add `discussions` array to SessionSummary
- In generateSummary(): filter entries with mode==="discuss" into discussions
- In formatSummary(): render "Discussions" section after Timeline

### 5. MODIFY: src/dashboard.ts

- `/api/queue/add`: accept `mode` field in body
- New: `GET /api/discussions` — list discussion results from HISTORY

### 6. MODIFY: src/cli.ts

- `queue add --discuss`: set mode="discuss"
- `queue add --rounds N`: set discussRounds
- `discuss <question>`: convenience alias for `queue add --discuss`
- Update usage() text

### 7. MODIFY: src/index.ts

- Export: `discussTeam, DiscussionResult, DiscussionRound, DiscussOptions`

### 8. MODIFY: docs (README.md, README.zh-CN.md, BEST_PRACTICES.md)

## Key Design Decisions

1. **Separate module** (not in orchestrator.ts) — different pipeline, clean separation
2. **Mode field on QueueTask** — backward compatible, simple branching
3. **Answer in HistoryEntry** — discussions produce text, not code; answer is the primary output
4. **DISCUSSION-{id}.md files** — full transcript persisted for later reference
5. **Default 1 round** — cost-efficient; users can opt into 2-3 rounds for deeper debate
6. **Summary shows answers** — the whole point; truncated preview with link to full file
