**English** | [中文](./README.zh-CN.md)

# AWSL Agent Core

Multi-agent orchestration engine for Claude Code.
Two modes, one goal: **ship quality code fast**.

> **[Installation Guide](./INSTALL.md)** | **[Best Practices](./BEST_PRACTICES.md)**

## Why AWSL?

### The Problem

When you use Claude Code to build a project, you're working within a single conversation — one context window, one agent, one shot. This works fine for small tasks, but as projects grow larger, problems emerge:

- **Context window exhaustion** — Long sessions accumulate noise. The LLM's attention degrades as conversation grows, leading to forgotten requirements, repeated mistakes, and hallucinated state.
- **No parallelism** — Tasks that could run concurrently are executed sequentially. A 10-task project takes 10x the time of one task.
- **No built-in quality gate** — The same agent that writes the code also "reviews" it. There's no adversarial check, no independent verification. Bugs slip through because the writer is the checker.
- **No recovery from failure** — If Claude Code crashes, you lose the entire conversation context. You restart from scratch, re-explaining everything.
- **Monolithic commits** — An entire feature lands in one giant commit. If something breaks, you can't bisect. If you want to revert part of it, you can't.

### The Idea

AWSL treats software development the way a real engineering team works — **specialized roles, parallel execution, independent review, and persistent state**.

Instead of one agent doing everything in a single conversation, AWSL decomposes your goal into a **Directed Acyclic Graph (DAG)** of micro-tasks, assigns each to a specialized agent (coder, reviewer, tester, architect), and executes them in **topologically-sorted waves** where independent tasks run concurrently.

Every agent starts with a **fresh 200K token context** — no accumulated noise, no degraded attention. Cross-task knowledge flows through file artifacts and structured memory, not through an ever-growing chat history.

### Design Philosophy

**Conductor + Guardian: Separation of Concerns**

AWSL's architecture splits orchestration into two independent layers:

```
  Conductor (macro)              Guardian (micro)
  ┌──────────────────┐          ┌──────────────────┐
  │ Task decomposition│          │ TDD enforcement  │
  │ Wave parallelism  │          │ Systematic debug │
  │ Fresh context     │  ─────>  │ Two-stage review │
  │ State persistence │  <─────  │ Quality gates    │
  │ Atomic commits    │          │ Socratic design  │
  │ Dynamic re-plan   │          │ Micro-task sizing│
  └──────────────────┘          └──────────────────┘
```

- **Conductor** handles the **what** and **when** — decompose the goal, schedule waves, manage dependencies, checkpoint progress, recover from failures.
- **Guardian** handles the **how** — enforce TDD for coders, run two-stage review for reviewers, guide Socratic exploration for architects. Guardian skills are injected per-role automatically.

This separation means orchestration logic and quality enforcement evolve independently. You can customize agents without touching the scheduler, or change the execution strategy without affecting quality gates.

**File-as-State: Crash-Proof by Design**

All critical state lives in the `.planning/` directory as plain files — task plans, execution progress, completion summaries, verification results. Nothing important exists only in memory. If the process dies, the next run reads the files and picks up where it left off. No conversation replay, no re-prompting.

**Zero API Key Required**

Both modes piggyback on your existing Claude Code subscription. CC Mode uses Claude Code's built-in Agent tool; Terminal Mode spawns `claude -p` subprocesses. No separate Anthropic API key, no token billing surprises.

### What You Get

| Advantage | How |
|-----------|-----|
| **4-10x faster for large projects** | Wave parallelism — independent tasks run concurrently via parallel agents |
| **Higher code quality** | Writer ≠ Reviewer. Dedicated reviewer agent catches spec deviations, security issues, and code smells that the coder misses |
| **Fresh context per task** | Every agent gets a clean 200K token window. No context rot, no attention degradation |
| **Crash recovery** | `.planning/` persists all state. Process dies → restart → resume from last checkpoint |
| **Bisectable git history** | One atomic commit per completed task. `git bisect` works. Partial reverts work |
| **Self-healing** | Test failure → auto-fix agent → re-verify (up to 3 rounds). Task failure → retry with error context (up to 2x) → replan with different approach |
| **Spec compliance** | Reviewer→Fixer loop catches requirements that single-pass sessions miss. Benchmarks show terminal mode produces more spec-compliant code |
| **No vendor lock-in** | Built-in engine supports any LLM provider (Anthropic, OpenAI, etc.). Claude Code engine uses your existing subscription |
| **Customizable teams** | Drop a markdown file in `agents/` to create a domain expert. Frontend specialist, security reviewer, API expert — your team, your rules |

### Benchmarks: Single Agent vs Agent Team

Real benchmark on the same task — **User Auth + TODO REST API** (Express + TypeScript + Zod + JWT + bcrypt + Vitest):

```
                        Single CC Session       AWSL Terminal Mode
                        ─────────────────       ──────────────────
Time                    ~6 min                  ~23 min
Tests                   58 tests                47 tests
Source code             526 lines (9 files)     378 lines (10 files)
Git history             1 commit                17 commits (per-task)
Spec compliance         Partial                 High (reviewer loop)
Config management       JWT secret hardcoded    Extracted to config.ts
Store efficiency        Linear scan O(n)        Indexed Map O(1)
Code duplication        5+ repeated patterns    Minimal
Self-healing            None                    3 auto-fix rounds
```

Terminal mode is slower but produces **leaner, cleaner, more spec-compliant code** — that's the value of the reviewer→fixer feedback loop.

CC mode is **4x faster** and writes more tests — ideal when a human is in the loop to catch what the single pass misses.

## Two Modes

AWSL supports two modes of operation:

| | CC Mode (Claude Code Skills) | Terminal Mode (Agent Teams) |
|---|---|---|
| **How** | `/awsl` in Claude Code | `awsl run --engine claude-code` in terminal |
| **API Key** | Not needed (CC subscription) | Not needed (uses `claude -p`) |
| **Control** | Skill prompts guide CC | Code controls everything |
| **Autonomy** | Human in the loop | Fully autonomous |
| **Self-healing** | Manual fix cycle | Auto-fix loop (3 attempts) |
| **Best for** | Interactive development | Unattended batch builds |

## Quick Start

### Mode 1: CC Skills (Interactive)

```bash
# Clone and build from source (npm package not yet published)
git clone https://github.com/awsl-project/awsl-agent-teams.git
cd awsl-agent-teams && npm install && npm run build

# Install skills into Claude Code
node dist/cli.js init --global

# In Claude Code:
/awsl Build a REST API with auth and rate limiting
```

### Mode 2: Terminal Agent Teams (Autonomous)

```bash
# No API key needed — uses your Claude Code subscription
cd my-project && git init
awsl run "Build a REST API with auth" --engine claude-code
```

The full pipeline runs automatically:

```
Brainstorm → Research → Plan → Execute (waves) → Verify → Auto-Fix → Commit
```

## CC Mode Commands

| Command | What it does |
|---------|-------------|
| `/awsl <goal>` | Full pipeline — brainstorm, plan, execute in parallel, verify, commit |
| `/awsl-quick <goal>` | Fast mode — skip brainstorm & research, straight to plan + execute |
| `/awsl-plan <goal>` | Plan only — review before executing |
| `/awsl-go` | Execute an approved plan from `/awsl-plan` |
| `/awsl-status` | Show progress, blockers, decisions |
| `/awsl-agents` | List or create custom agent definitions |

## Terminal Mode

Terminal mode is the **real agent teams** experience. Code controls the entire orchestration — no human needed after launch.

### Usage

```bash
awsl run "goal" --engine claude-code [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--engine claude-code` | auto | Use Claude Code CLI as execution engine |
| `--quick` | false | Skip brainstorm & research phases |
| `--concurrency <n>` | 2 | Max parallel agents per wave |
| `--no-verify` | false | Skip ALL verification: reviewer agent, provider verification (tsc, npm test, eslint), and auto-fix loop. Task auto-retry still runs (handles execution failures, not verification) |
| `--no-commit` | false | Skip git commits |
| `--plan-only` | false | Generate plan only, don't execute |
| `--execute-plan` | false | Execute existing `.planning/PLAN.md` |
| `--force` | false | Override existing lock |
| `--cwd <path>` | `.` | Working directory |

### Pipeline Phases

```
Phase 0a: Brainstorm    architect agent explores requirements (Socratic method)
Phase 0b: Research      parallel agents analyze existing codebase
Phase 1:  Plan          planner agent creates structured task DAG
Phase 2:  Execute       coder/tester/reviewer agents run in topological waves
Phase 3:  Review+Verify LLM reviewer → REVIEW.md; tsc/test/eslint → VERIFICATION.md  [skipped by --no-verify]
Phase 3b: Auto-Fix      on failure → coder reads both files → fixes → re-verify (max 3 rounds)  [skipped by --no-verify]
Phase 4:  Re-plan       on task failure → retry 2x → replan with different approach
```

### Self-Healing Features

| Feature | Description |
|---------|-------------|
| **Auto-fix loop** | Review/verify fails → coder reads both REVIEW.md + VERIFICATION.md → fixes → re-verify → up to 3 attempts |
| **Task auto-retry** | Failed tasks retry 2x with error context before re-planning |
| **Reviewer hard-block** | Critical severity findings = task failed, must fix |
| **File conflict detection** | Same-wave tasks sharing files → auto-split to different waves |
| **Git checkpoints** | Atomic commit after each successful wave (bisectable) |
| **Cross-wave context** | Wave N+1 agents see actual file contents from Wave N |
| **Rate limit recovery** | Token limit hit → save checkpoint → exponential backoff (1m→2m→5m→10m→15m) → auto-retry (max 20) |
| **Task queue (sleep mode)** | Queue multiple goals → `awsl queue start` → unattended sequential execution with auto rate-limit recovery |
| **Flexible plan parsing** | Planner output parsed as JSON, XML, or markdown — robust against format variations from different models |
| **Verify providers** | Parallel execution with per-provider timeouts (tsc 120s, tests 180s, eslint 60s) and 5-minute result caching |

### Example Output

```
━━━ Phase 2: Execution (7 waves) ━━━

  Wave 1/7: coder              ← project setup
  Wave 2/7: coder              ← types & schemas
  Wave 3/7: coder, coder       ← store + middleware (parallel!)
  Wave 4/7: coder              ← app assembly
  Wave 5/7: coder, coder       ← auth routes + todo routes (parallel!)
  Wave 6/7: tester, reviewer   ← tests + review (parallel!)
  Wave 7/7: coder              ← fix reviewer findings

━━━ Results ━━━
  [✓] task_1 (coder): verified
  [✓] task_2 (coder): verified
  ...
  [✓] task_10 (coder): verified
  Result: SUCCESS — All 10 tasks completed.
```

### Auxiliary Commands

```bash
awsl validate          # Validate .planning/PLAN.md → compute waves
awsl verify            # Run tests, lint, typecheck from PLAN.md
awsl review            # Static code review (no LLM) — detect any, secrets, missing tests
awsl lock              # Show current lock status
awsl unlock [--force]  # Release lock
awsl agents            # List available agents
```

## Task Queue (Sleep Mode)

Queue multiple goals and let AWSL execute them overnight — fully unattended with automatic rate-limit recovery.

### Usage

```bash
# Add tasks to the queue
awsl queue add "Build user auth module" --engine claude-code
awsl queue add "Add payment integration" --depends-on q_1
awsl queue add "Write E2E tests" --depends-on all  # waits for ALL prior tasks

# Schedule tasks for later
awsl queue add "Run full test suite" --at "03:00"          # today (or tomorrow if past)
awsl queue add "Deploy to staging" --at "2026-03-10 03:00" # specific datetime
awsl queue add "Cleanup temp files" --at "+30m"            # 30 minutes from now
awsl queue add "Heavy refactor" --at "+2h"                 # 2 hours from now

# Or: describe everything in natural language — auto-split into tasks with dependencies
awsl queue plan "First build user auth with JWT, then add payment with Stripe, finally write E2E tests" --engine claude-code

# Review the queue
awsl queue list

# Show detailed info for a single task
awsl queue show q_1

# Start execution (foreground daemon)
awsl queue start
```

### Natural Language Queue Planning

Describe multiple tasks in one sentence — AWSL uses Claude to parse them into structured queue tasks with inferred dependencies.

```bash
awsl queue plan "先构建用户认证，然后加支付模块，最后写集成测试" --engine claude-code
```

Output:
```
Planned 3 task(s):

  ID       Deps       Goal
  ------------------------------------------------------------
  q_1      (none)     构建用户认证模块
  q_2      q_1        添加支付模块
  q_3      all        写集成测试
```

Ordering keywords are automatically detected:
- Sequential: "先/first ... 然后/then ... 最后/finally"
- Dependent: "在...基础上/based on", "after"
- Independent: tasks without ordering words get no dependencies

### Queue Options

| Option | Description |
|--------|-------------|
| `--quick` | Skip brainstorm & research for this task |
| `--engine <type>` | Execution engine (claude-code or builtin) |
| `--concurrency <n>` | Max parallel agents |
| `--model <model>` | Override default model |
| `--depends-on <ids>` | Comma-separated task IDs, or `all` |
| `--at <time>` | Schedule task for later: `"03:00"`, `"2026-03-10 03:00"`, `"+30m"`, `"+2h"` |

### Scheduled Execution

When `queue start` runs, tasks with a `runAt` timestamp in the future are skipped until their scheduled time arrives (polling every 30 seconds). `queue list` and `queue show` display the scheduled time.

### Auto-Commit

Each queue task automatically commits QUEUE.json and HISTORY.json to git upon completion (whether success or failure). This lets you track queue progress via `git log` even when running unattended overnight.

### Rate Limit Recovery

When a token rate limit is hit during execution:

1. **Detect** — Pattern matching on stderr/stdout (429, "rate limit", "overloaded", etc.)
2. **Checkpoint** — Save progress to `.planning/CHECKPOINT.json` (completed tasks, results, wave position)
3. **Backoff** — Wait with exponential delay: 1min → 2min → 5min → 10min → 15min (cap)
4. **Retry** — Resume the current wave, skip already-completed tasks
5. **Limit** — Max 20 rate-limit retries (configurable via `maxRateLimitRetries`)

Checkpoints are human-readable JSON. On next run, AWSL auto-detects and resumes from the checkpoint.

## Sleep Mode Dashboard

Pixel-art retro dashboard to visualize your overnight build history.

```bash
awsl dashboard              # Open at http://localhost:3120
awsl dashboard --port 8080  # Custom port
awsl dashboard --bg         # Start as background process, print URL and exit
awsl dashboard stop         # Stop background dashboard process
```

Background mode (`--bg`) detaches the dashboard server, saves the PID to `.planning/.dashboard.pid`, and prints the URL and stop command. Use `awsl dashboard stop` to read the PID file, kill the process, and clean up.

Features:
- **RPG-style stats** — completed/failed counts, total time, success rate with pixel progress bars
- **Calendar heatmap** — GitHub-style contribution graph showing daily activity (last 90 days)
- **Duration trend chart** — SVG line chart showing build time trends over the last 30 days
- **Timeline** — Vertical timeline of all runs, grouped by date, filterable by project
- **Project sidebar** — All projects with color-coded badges and task counts
- **Queue monitor** — Live view of current queue status with auto-refresh (30s)
- **Queue operations** — Add, remove, and clear tasks directly from the dashboard UI
- **Queue scheduling** — Datetime picker on the add-task form to set `runAt`; queue table shows a "Run At" column with effective time (own time shown directly, inherited from dependency chain shown with arrow indicator); click a pending task's time cell to edit/clear the scheduled time
- **Clear History** — One-click button to clear all execution history (deletes HISTORY.json)
- **Live log stream** — Real-time SSE-based log panel showing agent stdout/stderr as it happens
- **Browser notifications** — Alerts on task failure and queue completion (requires permission)
- **Pixel art aesthetic** — Press Start 2P font, retro animations

API endpoints:
- `GET /api/history` — execution history
- `GET /api/stats` — aggregate statistics
- `GET /api/queue` — current queue state
- `GET /api/logs` — SSE stream of real-time agent logs
- `POST /api/queue/add` — add task `{goal, engine?, quick?, dependsOn?}`
- `DELETE /api/queue/remove?id=q_1` — remove a task
- `POST /api/queue/clear` — clear all tasks
- `POST /api/queue/set-time` — set/change/clear scheduled time `{id, runAt}`
- `POST /api/history/clear` — clear execution history

## Enable AWSL in Any Project

Want to use AWSL in your own projects? Two steps:

### Step 1: Install Skills Globally

```bash
cd /path/to/awsl-agent-teams
npm run build
node dist/cli.js init --global    # installs to ~/.claude/skills/
```

This makes `/awsl`, `/awsl-plan`, `/awsl-go`, etc. available in Claude Code for **all** projects.

### Step 2: Add CLAUDE.md to Your Project

Create a `CLAUDE.md` in your project root with AWSL rules. Recommended starter:

```markdown
# CLAUDE.md

## AWSL Auto-Queue

When the user's message contains multiple actionable requirements (numbered list, bullet points, or separate tasks):

Step 1 — Analyze and extract each requirement, then show:
  检测到 N 条需求：
  1. <summary>
  2. <summary>
  要使用 /awsl-plan 生成执行计划吗？

Step 2 — On confirmation, use /awsl-plan with all requirements as the goal.
Step 3 — Show the plan summary, ask: "要立刻开始执行吗？"
Step 4 — On confirmation, execute with /awsl-go.

Do NOT trigger for: follow-up questions, discussion, or single tasks with sub-points.
```

### Usage

Now in Claude Code, just list your requirements:

```
1. Add user authentication with JWT
2. Build payment module with Stripe
3. Write integration tests
```

Claude Code will automatically detect the batch requirements, generate a plan via `/awsl-plan`, and ask for confirmation before executing.

### Optional: Custom Agents

For domain-specific teams, create `agents/*.md` files in your project (see [Custom Agents](#custom-agents)).

## Architecture

```
awsl run "Build a REST API"
 │
 ▼
╔══════════════════════════════════════════════════════════╗
║                   AWSL Orchestrator                      ║
║                                                          ║
║  ┌─ Conductor ──────────────────────────────────────┐    ║
║  │                                                  │    ║
║  │  Brainstorm → Research → Plan → Execute → Verify │    ║
║  │       │          │         │        │        │    │    ║
║  │       ▼          ▼         ▼        ▼        ▼    │    ║
║  │   architect   architect  planner  coder   reviewer│    ║
║  │   (claude -p) (claude -p)         (claude -p)     │    ║
║  │                                                   │    ║
║  │  Self-Healing:                                    │    ║
║  │    verify fail → auto-fix (3x)                    │    ║
║  │    task fail → retry (2x) → replan                │    ║
║  │    file conflict → auto-split waves               │    ║
║  │    critical review → hard-block                   │    ║
║  └───────────────────────────────────────────────────┘    ║
║                                                          ║
║  Engine: claude-code (claude -p per task)                 ║
║          builtin (pi-agent-core + any LLM provider)      ║
╚══════════════════════════════════════════════════════════╝
 │
 ▼
Output: .planning/ artifacts + code + per-task git commits
```

**Key module:** `context.ts` — `RunContext` provides lifecycle-aware lock management. It replaces scattered manual `acquireLock`/`releaseLock` calls with a single object that auto-registers signal handlers using the correct `cwd` and guarantees cleanup on exit.

## Conductor

Conductor is the orchestration engine. It handles **what** to do and **when**.

- **Task decomposition** — Break goals into micro-tasks (2-5 min each)
- **Wave parallelism** — Topological sort, independent tasks run concurrently
- **Fresh context** — Every task gets a new 200k token context (no rot)
- **State persistence** — `.planning/` directory survives across sessions
- **Atomic commits** — One git commit per completed task (bisectable)
- **Dynamic re-planning** — Failures trigger recovery with different approaches

## Guardian

Guardian is the quality enforcement layer. It handles **how** to do it well.

Guardian skills auto-activate based on agent role:

| Agent Role | Guardian Skills |
|------------|----------------|
| `coder` | TDD (red/green/refactor), Systematic Debug |
| `architect` | Socratic Brainstorm |
| `planner` | Micro-Task Planning |
| `reviewer` | Two-Stage Code Review, Quality Gate |
| `tester` | Systematic Debug |

**TDD** — Enforces RED-GREEN-REFACTOR. Write failing test first. Minimal code to pass. Refactor.

**Two-Stage Review** — Stage 1: Does it match the spec? Stage 2: Is the code quality acceptable? Critical findings block the task.

**Socratic Brainstorm** — Explore requirements through targeted questions. Challenge assumptions. Document decisions.

## Built-in Agents

| Name | Role | Description |
|------|------|-------------|
| planner | planner | Decomposes goals into structured micro-tasks |
| architect | architect | Designs system architecture and interfaces |
| coder | coder | Implements code with TDD enforcement |
| reviewer | reviewer | Two-stage review with quality gate |
| tester | tester | Designs and runs tests, debugs failures |

## Custom Agents

Create `agents/<name>.md` in your project:

```markdown
---
name: api-expert
role: coder
description: REST API specialist with OpenAPI expertise
tools: read,write,edit,bash
skills: tdd,debug
thinking: high
model: anthropic:claude-sonnet-4-20250514
---

You are a REST API expert. Follow OpenAPI 3.0 conventions.
Always generate OpenAPI specs alongside implementation.
Use proper HTTP status codes and error formats.
```

### Frontmatter Fields

| Field | Description |
|-------|-------------|
| `name` | Agent identifier (required) |
| `role` | `planner`, `architect`, `coder`, `reviewer`, `tester`, or `custom` |
| `description` | What this agent does |
| `tools` | Comma-separated string (`read,write,edit,bash`) or YAML array |
| `skills` | Guardian skills to activate: comma-separated string or YAML array |
| `thinking` | LLM thinking level: `low`, `medium`, `high` |
| `model` | Override model: `anthropic:claude-sonnet-4-20250514`, `openai:gpt-4o` |

**YAML array syntax** is also supported for `tools` and `skills`:

```yaml
---
name: api-expert
role: coder
tools:
  - read
  - write
  - bash
skills:
  - tdd
  - debug
---
```

> Invalid frontmatter triggers a friendly error message with the file name and specific validation issue — the agent is skipped, not silently broken.

## .planning/ Directory

State persists across sessions:

```
.planning/
├── .lock                 # Concurrency lock (auto-managed)
├── STATE.md              # Progress, decisions, blockers
├── DESIGN.md             # Brainstorm output
├── PLAN.md               # Structured task breakdown
├── WAVES.md              # Computed wave schedule
├── VERIFICATION.md       # Deterministic check results (tsc, eslint, tests)
├── REVIEW.md             # LLM reviewer findings (spec compliance + code quality)
├── CHECKPOINT.json       # Rate-limit recovery checkpoint (auto-managed)
├── QUEUE.json            # Task queue for sleep mode (auto-managed)
├── HISTORY.json          # Sleep mode execution history (auto-managed)
├── .dashboard.pid        # Background dashboard process PID (auto-managed)
├── research/
│   ├── architecture.md   # Codebase analysis
│   └── conventions.md    # Code style analysis
└── task_*-SUMMARY.md     # Per-task results
```

## Benchmark Results

Real benchmark comparing CC Mode vs Terminal Mode on an identical complex task:
**User Auth + TODO REST API** (Express + TypeScript + Zod + JWT + bcrypt + Vitest).

### Quality Comparison

| Metric | CC Mode | Terminal Mode |
|--------|---------|---------------|
| **Result** | SUCCESS | SUCCESS |
| **Tests** | 58 tests, 5 files | 47 tests, 4 files |
| **TypeScript** | 0 errors | 0 errors |
| **Source code** | 526 lines (9 files) | 378 lines (10 files) |
| **Test code** | 937 lines | 680 lines |
| **Git history** | 1 commit | 17 commits (per-task + wave checkpoints) |
| **Total time** | ~6 min | ~23 min |
| **Self-healing** | N/A | 3 auto-fix rounds (6/8 → 7/8 passed) |
| **API running** | All endpoints work | All endpoints work |

### Code Quality

| Dimension | CC Mode | Terminal Mode |
|-----------|---------|---------------|
| **Architecture** | `routes/` (traditional) | `features/` (feature-based, more scalable) |
| **Spec compliance** | Stats returns `{total, pending, in_progress, completed}` | Stats returns `{total, done, pending}` (matches spec exactly) |
| **Register response** | Returns `{user, token}` | Returns `{id, email}` (matches spec) |
| **Config management** | JWT secret hardcoded | Extracted to `config.ts` (reviewer fix) |
| **Store efficiency** | Linear scan for email lookup | Indexed `usersByEmail` Map (O(1)) |
| **Code duplication** | Repeated safeParse pattern 5+ times | Minimal duplication |

### Key Findings

1. **Terminal mode is more spec-compliant** — The reviewer→fixer loop catches spec deviations that a single-pass CC session misses
2. **Terminal mode produces cleaner code** — reviewer agent identifies and fixes config issues, indexing, and duplication
3. **CC mode is 4x faster** — Single context window, no subprocess overhead
4. **CC mode writes more tests** — Larger context window enables more comprehensive test planning
5. **Terminal mode has better git history** — 17 atomic commits vs 1 monolithic commit; fully bisectable

### When to Use Which

| Scenario | Recommended Mode |
|----------|-----------------|
| Quick feature, human available | CC Mode (`/awsl`) |
| Large project, want to review plan | CC Mode (`/awsl-plan` → `/awsl-go`) |
| Overnight build, no human | Terminal Mode (`--engine claude-code`) |
| CI/CD integration | Terminal Mode |
| Highest code quality | Terminal Mode (reviewer loop) |
| Fastest delivery | CC Mode |
| Bug fix | CC Mode (`/awsl-quick`) |
| Overnight multi-project build | Task Queue (`awsl queue start`) |

## Library API

```typescript
import { executeTeam, loadAgents, SkillRegistry } from "awsl-agent-core";

const agents = loadAgents(["./agents"]);
const result = await executeTeam(
  "Build a TODO app",
  agents,
  ".",                                    // cwd
  "anthropic:claude-sonnet-4-20250514",   // model
  2,                                      // concurrency
  {
    brainstorm: true,      // Socratic exploration
    research: true,        // Codebase analysis
    verify: true,          // Two-stage review
    autoCommit: true,      // Atomic commits per task
    replan: true,          // Failure recovery
    qualityGate: true,     // Block on critical findings
    engine: "claude-code", // or "builtin"
    maxFixAttempts: 3,     // Auto-fix retry limit
    maxRetries: 2,         // Task retry limit
    maxRateLimitRetries: 20, // Rate limit retry cap
    rateLimitBackoff: [60000, 120000, 300000, 600000, 900000],
    resumeFromCheckpoint: true, // Resume from .planning/CHECKPOINT.json
    hooks: [(event) => {
      console.log(event.type, event.task?.id);
    }],
  }
);
```

### Event Types

```typescript
type TeamEventType =
  | "plan_start" | "plan_done"
  | "wave_start" | "wave_done"
  | "task_start" | "task_done"
  | "verify_start" | "verify_done"
  | "fix_start" | "fix_done"
  | "retry_start" | "checkpoint"
  | "rate_limit";
```

## CLI Reference

```bash
# Install Claude Code skills (from source)
node dist/cli.js init                    # Project-local (.claude/skills/)
node dist/cli.js init --global           # Global (~/.claude/skills/)

# Terminal mode (recommended for autonomous builds)
awsl run "goal" --engine claude-code
awsl run "goal" --engine claude-code --quick
awsl run "goal" --engine claude-code --concurrency 4

# Plan-only workflow
awsl run --plan-only "goal"
awsl run --execute-plan

# Builtin engine (needs API key)
awsl run "goal" --engine builtin --model anthropic:claude-sonnet-4-20250514

# Quality tools
awsl validate                # Parse + validate PLAN.md → WAVES.md
awsl verify                  # Run tests, lint, typecheck
awsl review                  # Static analysis (no LLM)

# Lock management
awsl lock                    # Show lock status
awsl unlock                  # Release own lock
awsl unlock --force          # Force release any lock

# Agents
awsl agents                  # List all agents

# Task queue (sleep mode)
awsl queue add "Build REST API" --quick      # Add task to queue
awsl queue add "Add auth" --depends-on q_1   # Add with dependency
awsl queue add "Write tests" --depends-on all # Wait for all prior tasks
awsl queue add "Nightly build" --at "03:00"  # Schedule for 3:00 AM
awsl queue add "Later task" --at "+2h"       # Schedule 2 hours from now
awsl queue plan "First auth, then payments, finally tests"  # Natural language → auto-split
awsl queue list                               # Show queue status
awsl queue show q_1                           # Show detailed info for a single task
awsl queue remove q_1                         # Remove a task
awsl queue start --engine claude-code         # Start queue execution
awsl queue clear                              # Clear all tasks
awsl dashboard [--port N]                     # Open the sleep mode pixel dashboard (default: 3120)
awsl dashboard --bg                          # Start dashboard as background process
awsl dashboard stop                          # Stop background dashboard process
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Only for `--engine builtin` | Anthropic API key |
| `OPENAI_API_KEY` | Only for OpenAI models | OpenAI API key |
| `DEBUG=1` | No | Enable debug logging |

> **Note:** `--engine claude-code` does NOT need an API key. It uses your Claude Code subscription via `claude -p`.

## Static Code Review

`awsl review` runs deterministic checks without any LLM:

| Rule | Severity | What it detects |
|------|----------|-----------------|
| `no-any` | warning | Explicit `any` type usage |
| `no-console-log` | warning | `console.log` in production code |
| `no-empty-catch` | warning | Empty catch blocks |
| `todo-comment` | info | TODO/FIXME/HACK comments |
| `no-hardcoded-secrets` | critical | Hardcoded passwords/API keys |
| `file-too-long` | warning | Files over 500 lines |
| `no-tests` | critical | No test files in project |

## How It Compares

| | AWSL Terminal | AWSL CC | Single CC Session |
|---|---|---|---|
| **Planning** | Code-enforced DAG | Skill-guided | Manual |
| **Parallelism** | Real (concurrent `claude -p`) | CC Agent tool | None |
| **Self-healing** | Auto-fix + retry + replan | Manual | Manual |
| **Code review** | Reviewer agent + static | Reviewer agent | None |
| **Git history** | Per-task atomic commits | Single commit | Single commit |
| **Spec compliance** | High (reviewer loop) | Medium | Variable |
| **Speed** | ~20 min | ~6 min | ~5 min |
| **Autonomy** | Full | Partial | None |

## License

MIT
