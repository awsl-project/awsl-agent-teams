**English** | [中文](./README.zh-CN.md)

# AWSL Agent Core

Multi-agent orchestration engine for Claude Code.
Two modes, one goal: **ship quality code fast**.

> **[Installation Guide](./INSTALL.md)** — setup, `npm link`, FAQ
>
> **[Best Practices](./BEST_PRACTICES.md)** — concurrency tuning, goal writing, engine selection, queue patterns, troubleshooting

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
  │ Fresh context     │  ─────>  │ Per-task review  │
  │ State persistence │  <─────  │ Quality gates    │
  │ Atomic commits    │          │ Socratic design  │
  │ Dynamic re-plan   │          │ Micro-task sizing│
  └──────────────────┘          └──────────────────┘
```

- **Conductor** handles the **what** and **when** — decompose the goal, schedule waves, manage dependencies, checkpoint progress, recover from failures.
- **Guardian** handles the **how** — enforce TDD for coders, run per-task code review (on actual git diff) for reviewers, guide Socratic exploration for architects. Guardian skills are injected per-role automatically.

This separation means orchestration logic and quality enforcement evolve independently. You can customize agents without touching the scheduler, or change the execution strategy without affecting quality gates.

**File-as-State: Crash-Proof by Design**

All critical state lives in the `.planning/` directory as plain files — task plans, execution progress, completion summaries, verification results. Nothing important exists only in memory. If the process dies, the next run reads the files and picks up where it left off. No conversation replay, no re-prompting.

**Zero API Key Required**

Both modes can run on existing local CLI sessions. CC Mode uses Claude Code's built-in Agent tool; Terminal Mode can spawn `claude -p` or `codex exec` subprocesses. No separate provider API key is required for these CLI engines.

### What You Get

| Advantage | How |
|-----------|-----|
| **4-10x faster for large projects** | Wave parallelism — independent tasks run concurrently via parallel agents |
| **Higher code quality** | Writer ≠ Reviewer. After each coder task, a reviewer reads the actual `git diff` line-by-line against an anti-pattern checklist (busy-waits, race conditions, missing cleanup, etc.). Critical findings block the commit before it happens |
| **Fresh context per task** | Every agent gets a clean 200K token window. No context rot, no attention degradation |
| **Crash recovery** | `.planning/` persists all state. Process dies → restart → resume from last checkpoint |
| **Bisectable git history** | One atomic commit per completed task. `git bisect` works. Partial reverts work |
| **Self-healing** | Test failure → auto-fix agent → re-verify (up to 3 rounds). Task failure → retry with error context (up to 2x) → replan with different approach. Multi-language verification auto-detects your stack (TypeScript, Python, Go, Rust) |
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
| **How** | `/awsl` in Claude Code | `awsl run --engine claude-code` or `--engine codex` in terminal |
| **API Key** | Not needed (CC subscription) | Not needed (uses `claude -p` or `codex exec`) |
| **Control** | Skill prompts guide CC | Code controls everything |
| **Autonomy** | Human in the loop | Fully autonomous |
| **Self-healing** | Manual fix cycle | Auto-fix loop (3 attempts) |
| **Best for** | Interactive development | Unattended batch builds |

## Quick Start

> **One-click install:** Clone this repo, then let Claude Code or Codex read the install guide and do it for you:
>
> ```
> Read INSTALL.md and follow the steps to install AWSL
> ```
>
> Or follow the manual steps below.

### Mode 1: CC Skills (Interactive)

```bash
# Clone and build from source (npm package not yet published)
git clone https://github.com/awsl-project/awsl-agent-teams.git
cd awsl-agent-teams && npm install && npm run build

# (Optional) Enable global `awsl` command
npm link

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
# or
awsl run "Build a REST API with auth" --engine codex
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
awsl run "goal" --engine <claude-code|codex|builtin> [options]
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--engine <type>` | auto | Execution engine: `claude-code`, `codex`, or `builtin` (auto-detects: claude-code → codex → builtin) |
| `--quick` | false | Skip brainstorm & research phases |
| `--concurrency <n>` | 2 | Max parallel agents per wave (recommended: 3-4 for medium/large projects; see BEST_PRACTICES.md for tuning guide) |
| `--no-verify` | false | Skip ALL verification: per-task code review, provider verification (tsc, npm test, eslint), and auto-fix loop. Task auto-retry still runs (handles execution failures, not verification) |
| `--no-commit` | false | Skip git commits |
| `--plan-only` | false | Generate plan only, don't execute |
| `--execute-plan` | false | Execute existing `.planning/PLAN.md` |
| `--force` | false | Override existing lock |
| `--cwd <path>` | `.` | Working directory |

### Codex Engine Features

When using `--engine codex` (or auto-detected when Codex CLI is installed):

| Feature | Details |
|---------|---------|
| **Auto-detection** | `detectEngine()` checks `codex --version` automatically (priority: claude-code → codex → builtin) |
| **Per-agent API key** | Set `apiKey: env:CODEX_API_KEY` in agent frontmatter for per-agent routing |
| **Per-agent base URL** | Set `baseUrl: https://your-api.com/v1` for custom OpenAI-compatible endpoints |
| **Dynamic sandbox** | Sandbox mode maps by role: reviewer/tester → `read-only`, coder/architect → `workspace-write` |
| **Session resume** | Failed tasks can resume from Codex session ID (stored in shared memory) instead of restarting |
| **Structured results** | Agents output `## AWSL_RESULT` section; AWSL extracts it as the clean task result |
| **Rich progress events** | JSONL events (file edits, command executions, agent messages) stream to dashboard |
| **Per-agent engine** | Set `engine: codex` in agent frontmatter — different agents can use different engines in the same run |

```yaml
# Example: coder uses Codex, reviewer uses Claude Code (agents/my-coder.md)
---
name: my-coder
role: coder
engine: codex
apiKey: env:CODEX_API_KEY
baseUrl: https://api.openai.com/v1
model: o3
tools: read,write,edit,bash
---
```

```yaml
# agents/my-reviewer.md — uses Claude for code review
---
name: my-reviewer
role: reviewer
engine: claude-code
tools: read,grep,glob,bash
---
```

### Pipeline Phases

```
Phase 0a: Brainstorm    architect agent explores requirements (Socratic method)
Phase 0b: Research      parallel agents analyze existing codebase
Phase 1:  Plan          planner agent creates structured task DAG
Phase 2:  Execute       coder/tester agents run in topological waves
  └─ Per-task review    after each coder task, reviewer reads actual git diff → blocks on critical findings
Phase 3:  Verify        multi-language checks (build/test/lint/audit) → VERIFICATION.md  [skipped by --no-verify]
Phase 3b: Auto-Fix      on failure → coder reads VERIFICATION.md → fixes → re-verify (max 3 rounds)  [skipped by --no-verify]
Phase 4:  Re-plan       on task failure → retry 2x → replan with different approach
```

### Self-Healing Features

| Feature | Description |
|---------|-------------|
| **Per-task code review** | After each coder task, reviewer reads the actual `git diff` line-by-line with a checklist (design flaws, race conditions, busy-waits, missing cleanup, delta/merge confusion, etc.). Critical findings block the commit — the task is marked failed before code is committed |
| **Auto-fix loop** | Verify fails → coder reads VERIFICATION.md → fixes → re-verify → up to 3 attempts |
| **Task auto-retry** | Failed tasks retry 2x with error context before re-planning |
| **Reviewer hard-block** | Critical severity findings = task failed, must fix |
| **File conflict detection** | Same-wave tasks sharing files → auto-split to different waves |
| **Git checkpoints** | Atomic commit after each successful wave (bisectable) |
| **Cross-wave context** | Wave N+1 agents see actual file contents from Wave N |
| **Rate limit recovery** | Token limit hit → save checkpoint → exponential backoff (1m→2m→5m→10m→15m) → auto-retry (max 20) |
| **Task queue (sleep mode)** | Queue multiple goals → `awsl queue start` → unattended sequential execution with auto rate-limit recovery |
| **Flexible plan parsing** | Planner output parsed as JSON, XML, or markdown — robust against format variations from different models |
| **Verify providers** | Auto-detected per-language: **TypeScript** (tsc), **Node.js** (npm test, eslint, prettier, npm audit), **Python** (pytest, mypy, ruff), **Go** (go vet, go test, go build), **Rust** (cargo clippy, cargo test, cargo build). Parallel execution with per-provider timeouts (30s–180s) and 5-minute result caching |
| **Custom verify providers** | Define project-specific checks in `.planning/verify.json` or `.awsl.json` — any command, custom timeout, custom name |
| **Timed verification reports** | Per-check timing (durationMs), pass rate percentage, total verification time, and stage summaries in VERIFICATION.md |
| **Static review rules** | Built-in detections: unused imports, function-too-long (>50 lines), nesting-too-deep (>4 levels), duplicate code (6+ identical consecutive lines) |
| **Atomic file writes** | All state files (QUEUE.json, CHECKPOINT.json, HISTORY.json, VERIFICATION.md) written via temp-file + rename pattern, preventing corruption on crash |
| **Queue file locking** | File-based mutex prevents concurrent read/write conflicts between dashboard API and queue executor |
| **Real-time status push** | Task completion triggers immediate WebSocket status push instead of waiting for 30s polling interval |
| **Reconnect state sync** | Full state snapshot pushed to dashboard immediately after WebSocket reconnection |
| **Delta status sync** | After initial full sync, only changed queue data and new history entries are transmitted, reducing bandwidth |

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
awsl verify            # Multi-language verification (auto-detects stack) + custom providers
awsl review            # Static code review (no LLM) — unused imports, function-too-long, nesting-too-deep, duplicate code, secrets
awsl lock              # Show current lock status
awsl unlock [--force]  # Release lock
awsl agents            # List available agents
awsl agents show <name>           # Show full agent details
awsl agents create <name> [flags] # Create custom agent
awsl agents edit <name> [flags]   # Edit existing agent
awsl agents delete <name>         # Delete custom agent
awsl agents reset <name>          # Restore built-in default
awsl agents templates             # List built-in prompt templates
awsl agents prompt <name>         # Edit prompt ($EDITOR / --show / --set / --file)
awsl agents preview <name>        # Preview composed prompt

# Invocation tracking
awsl track <type> [goal]          # Record an invocation (team, plan, go, quick, queue, cli, discuss)
awsl invocations                  # Show invocation counts per type

# Night session summary
awsl summary                        # Summarize last night's session (22:00→06:00)
awsl summary --date 2026-03-10      # Summarize a specific night
awsl summary --from 20:00 --to 08:00  # Custom time range
awsl summary --all-projects         # Aggregate across all registered projects

# Project management
awsl projects                       # List all registered projects with status
awsl projects add [path] [--name N] # Register a project (default: cwd)
awsl projects remove <path|name>    # Unregister a project
awsl projects scan [dir]            # Auto-discover projects in a directory
```

## Task Queue (Sleep Mode)

Queue multiple goals and let AWSL execute them overnight — fully unattended with automatic rate-limit recovery.

### Usage

```bash
# Add tasks to the queue
awsl queue add "Build user auth module" --engine claude-code
# or
awsl queue add "Build user auth module" --engine codex
awsl queue add "Add payment integration" --depends-on q_1
awsl queue add "Write E2E tests" --depends-on all  # waits for ALL prior tasks

# Schedule tasks for later
awsl queue add "Run full test suite" --at "03:00"          # today (or tomorrow if past)
awsl queue add "Deploy to staging" --at "2026-03-10 03:00" # specific datetime
awsl queue add "Cleanup temp files" --at "+30m"            # 30 minutes from now
awsl queue add "Heavy refactor" --at "+2h"                 # 2 hours from now

# Or: describe everything in natural language — preview before committing (recommended)
awsl queue split "Build auth, then payments, finally integration tests" --engine claude-code

# Or: auto-split without preview (backward-compatible)
awsl queue plan "First build user auth with JWT, then add payment with Stripe, finally write E2E tests" --engine claude-code

# Review the queue
awsl queue list

# Show detailed info for a single task
awsl queue show q_1

# Start execution (foreground daemon)
awsl queue start
```

### Natural Language Queue Planning

Describe multiple tasks in one sentence — AWSL uses Claude to parse them into structured queue tasks with inferred dependencies. Two commands are available:

**`queue split` (recommended)** — Preview before committing. Shows a table of planned tasks and asks for confirmation before adding to the queue. Use `--yes` to skip the confirmation prompt.

```bash
awsl queue split "Build auth, then payments, finally integration tests" --engine claude-code
```

Output:
```
Planned tasks:

  #   Deps       Goal
  ─────────────────────────────────────────────────
  1   (none)     Build auth module
  2   1          Add payment integration
  3   all        Write integration tests

Confirm? Add 3 task(s) to queue? (y/N) y

Added 3 task(s):

  ID       Deps       Goal
  ------------------------------------------------------------
  q_1      (none)     Build auth module
  q_2      q_1        Add payment integration
  q_3      all        Write integration tests
```

**`queue plan`** — Adds tasks directly without preview (backward-compatible).

```bash
awsl queue plan "先构建用户认证，然后加支付模块，最后写集成测试" --engine codex
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
| `--engine <type>` | Execution engine (`claude-code`, `codex`, or `builtin`) |
| `--concurrency <n>` | Max parallel agents |
| `--model <model>` | Override default model |
| `--depends-on <ids>` | Comma-separated task IDs, or `all` |
| `--at <time>` | Schedule task for later: `"03:00"`, `"2026-03-10 03:00"`, `"+30m"`, `"+2h"` |

### Scheduled Execution

When you add a task with `--at`, AWSL automatically registers a **system-level scheduled job** (Windows Task Scheduler / Unix `at`) that triggers `queue start --once` at the specified time. No need to keep `queue start` running — the OS handles the timing.

```bash
awsl queue add "Nightly build" --at "03:00"   # → system job created for 03:00
awsl queue start --once                       # one-shot: process runnable tasks and exit
```

If you prefer manual daemon mode, plain `queue start` (without `--once`) still polls every 30 seconds for future tasks. Removing a task (`queue remove`) or changing its time (`set-time`) automatically cleans up the system scheduled job.

### Auto-Commit & Auto-Push

Each queue task automatically commits QUEUE.json and HISTORY.json to git upon completion (whether success or failure). This lets you track queue progress via `git log` even when running unattended overnight.

Add `--auto-push` to automatically push to remote after each task completes:

```bash
awsl queue add "Build feature" --auto-push      # per-task
awsl queue start --auto-push                     # all tasks in this run
```

The push runs after each successful commit. If push fails (network, auth), execution continues — the commit is preserved locally.

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
- **Projects management** — Register, remove, scan, and view all projects with live status (queue counts, lock state, last run). Select a project to view its queue or add tasks to it directly from the dashboard
- **Queue monitor** — Live view of current queue status with auto-refresh (30s)
- **Queue operations** — Add, remove, and clear tasks directly from the dashboard UI
- **Queue scheduling** — Datetime picker on the add-task form to set `runAt`; queue table shows a "Run At" column with effective time (own time shown directly, inherited from dependency chain shown with arrow indicator); click a pending task's time cell to edit/clear the scheduled time
- **Clear History** — One-click button to clear all execution history (deletes HISTORY.json)
- **Live log stream** — Real-time SSE-based log panel showing agent stdout/stderr as it happens
- **Browser notifications** — Alerts on task failure and queue completion (requires permission)
- **Agent roles management** — Visual CRUD editor for agent definitions. Create custom agents, override built-in prompts, or reset to defaults — all from the dashboard UI
- **Prompt templates** — 7 built-in templates (coder, reviewer, architect, tester, planner, devops, documenter) loadable from a dropdown in the editor
- **Fullscreen prompt editor** — Full-viewport overlay for editing long prompts with live character count
- **Prompt preview** — Preview the full composed prompt (base + skills + team context) with tabbed section view
- **Agent analysis** — Shows unique agent roles, average/peak parallelism, total waves, and per-run wave breakdown with agent badges
- **Wave detail visibility** — Each wave now shows per-task breakdown including description, assignee, status (done/failed/verified), modified files, and result/error messages. Quickly see exactly what each wave accomplished or why it failed
- **Invocation tracking** — "Invocations" card showing how many times each command type (/awsl, /awsl-plan, /awsl-go, /awsl-quick, queue, cli, discuss) has been invoked. Counts are persisted in `.planning/STATS.json`
- **Date filter** — Filter statistics by day, week, month, or custom date range. All dashboard widgets update in real-time based on the selected time period
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
- `GET /api/history/:id/waves` — wave details with per-task breakdown for a specific run
- `GET /api/projects` — list all registered projects with live status
- `POST /api/projects/add` — register a project `{path, name?, tags?}`
- `POST /api/projects/remove` — unregister a project `{path}`
- `POST /api/projects/scan` — auto-discover projects `{dir, depth?}`
- `GET /api/projects/queue?path=` — get queue for a specific project
- `POST /api/projects/queue/add` — add task to a project's queue `{path, goal, ...}`
- `POST /api/projects/queue/start` — start queue execution for a project `{path, engine?, once?}`
- `POST /api/projects/queue/clear` — clear a project's queue `{path}`
- `GET /api/projects/history?path=` — get history for a specific project
- `GET /api/projects/stats?path=` — get stats for a specific project
- `GET /api/agents` — list all agents (built-in + custom). `?name=X` for single agent
- `POST /api/agents` — create custom agent `{name, role, systemPrompt, ...}`
- `PUT /api/agents` — update agent `{name, ...fields}`
- `DELETE /api/agents?name=X` — delete custom agent file
- `GET /api/agents/templates` — list all 7 built-in prompt templates
- `POST /api/agents/preview` — compose full prompt preview `{name}` → `{composed, sections}`
- `GET /api/invocations` — invocation counts per command type
- `GET /api/discussions` — discussion entries from history
- `GET /api/clients` — list connected remote clients
- `POST /api/clients/command` — send command to a client `{clientId, action, payload?}`
- `WebSocket /ws/relay` — relay endpoint for remote client connections

### Remote Control

Deploy the dashboard on a server, then connect local machines via WebSocket relay:

```
┌─────────────────────────┐
│  Server (Dashboard)     │
│  awsl dashboard         │
│  http://server:3120     │
│                         │
│  ┌───────────────────┐  │
│  │  WebSocket Relay  │  │
│  │  /ws/relay        │  │
│  └─────┬───────┬─────┘  │
└────────┼───────┼────────┘
         │       │
    ┌────┘       └────┐
    ▼                 ▼
┌──────────┐   ┌──────────┐
│ Machine A│   │ Machine B│
│ remote   │   │ remote   │
│ connect  │   │ connect  │
└──────────┘   └──────────┘
```

```bash
# On the server (Docker)
docker compose up -d

# On local machines (one-time setup)
awsl remote init http://server:3120 --id my-laptop
awsl remote connect --bg
```

Commands you can send via the dashboard API:

```bash
# List connected clients
curl http://server:3120/api/clients

# Add a task to a remote machine's queue
curl -X POST http://server:3120/api/clients/command \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-laptop","action":"queue:add","payload":{"goal":"Build REST API"}}'

# Start queue execution on a remote machine
curl -X POST http://server:3120/api/clients/command \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-laptop","action":"queue:start","payload":{"once":true}}'

# Get system info from a remote machine
curl -X POST http://server:3120/api/clients/command \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-laptop","action":"system:info"}'
```

Supported relay actions: `queue:add`, `queue:remove`, `queue:clear`, `queue:list`, `queue:get`, `queue:set-time`, `queue:start`, `agents:list`, `agents:get`, `agents:save`, `agents:delete`, `agents:templates`, `agents:preview`, `invocations:get`, `system:info`.

> For full deployment guide (systemd, PM2, Docker, Nginx reverse proxy, NAT traversal), see [DEPLOY.md](DEPLOY.md).

## Discussion Mode

Not every question needs code. Sometimes you need your agent team to **think together** — debate architecture decisions, evaluate trade-offs, or analyze design choices.

Discussion mode runs all agents in parallel to analyze a question from their specialized perspective, then optionally runs debate rounds where agents respond to each other, and finally synthesizes everything into a coherent answer.

### Usage

```bash
# Direct discussion
awsl discuss "How should we design the authentication system?"

# Via queue (with debate rounds)
awsl queue add --discuss "What database schema fits our use case?" --rounds 2

# Schedule an overnight discussion
awsl queue add --discuss --at 03:00 "Analyze microservices vs monolith trade-offs for our scale"
```

### Discussion Flow

```
Round 1: Parallel Perspectives    All agents independently analyze the question
Round 2..N: Debate (optional)     Agents respond to each other's points
Synthesis:                        Combined into a final coherent answer
Persist:                          Saved to .planning/DISCUSSION-{timestamp}.md
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--rounds <n>` | 1 | Number of discussion rounds (1-3). More rounds = deeper debate |
| `--at <time>` | — | Schedule for later (same syntax as queue tasks) |
| `--cwd <path>` | `.` | Working directory |

### Output

- Discussion transcripts are saved to `.planning/DISCUSSION-{timestamp}.md`
- Each file contains: all agent perspectives, debate rounds, and the final synthesized answer
- Discussions appear in `awsl summary` output alongside build results
- Dashboard API: `GET /api/discussions` returns discussion entries from history

## Night Session Summary

Review what happened during a night coding session. Pulls data from HISTORY.json (task queue results) and `git log` (commits) within the time range.

```bash
awsl summary
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `--from <HH:MM>` | `22:00` | Session start time |
| `--to <HH:MM>` | `06:00` | Session end time |
| `--date <YYYY-MM-DD>` | auto | Anchor date (auto-detects based on current time) |
| `--all-projects` | false | Aggregate across all registered projects |
| `--cwd <path>` | `.` | Working directory |

**Time range auto-detection:** If now < 06:00 → last night. If now >= 22:00 → tonight. Otherwise → last night.

**Example output:**

```
┌─────────────────────────────────────┐
│     Night Session Summary           │
│     2026-03-10 22:00 → 03-11 06:00 │
├─────────────────────────────────────┤
│  Tasks: 5 total, 4 done, 1 failed  │
│  Git:   12 commits                  │
│  Time:  2h 34m                      │
│  Cost:  $0.42                       │
├─────────────────────────────────────┤
│  Agents: coder ×8, reviewer ×2     │
└─────────────────────────────────────┘
```

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
║  │    per-task review (git diff) → block on critical │    ║
║  │    verify fail → auto-fix (3x)                    │    ║
║  │    task fail → retry (2x) → replan                │    ║
║  │    file conflict → auto-split waves               │    ║
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

## Streaming Execution

All three engines (claude-code, codex, builtin) support **real-time streaming events** during agent execution. Instead of waiting for a final result, consumers receive fine-grained events as agents work:

| Event | Description |
|-------|-------------|
| `start` | Agent process spawned (includes engine type) |
| `text` | Incremental text output from the model |
| `tool_start` | Agent began invoking a tool (name + args) |
| `tool_end` | Tool execution completed |
| `turn_end` | One model turn completed (with token counts) |
| `progress` | Informational progress message |
| `error` | Non-fatal error or warning |
| `done` | Agent finished — carries the final `RunResult` |

**Usage via `ExecuteOptions`:**

```typescript
import { executeTeam, type AgentStreamEvent } from "awsl-agent-core";

const result = await executeTeam(goal, agents, cwd, model, 3, {
  onStream: (event: AgentStreamEvent) => {
    if (event.type === "tool_start") {
      console.log(`[${event.agent}] using ${event.tool}`);
    }
  },
});
```

**Usage via `runAgent`:**

```typescript
import { runAgent, type StreamCallback } from "awsl-agent-core";

const onStream: StreamCallback = (event) => {
  if (event.type === "text") process.stdout.write(event.text);
};

const result = await runAgent(agentDef, task, cwd, memory, roster, model, 30, undefined, undefined, undefined, undefined, onStream);
```

For the **claude-code** engine, streaming uses `--output-format stream-json` (NDJSON) instead of `--output-format json`, providing real-time assistant messages, tool invocations, and token usage. Events are automatically forwarded to the **LogStream** for dashboard/SSE subscribers via the `"agent-event"` channel.

**CLI usage — `--stream` flag:**

```bash
awsl run "Build a REST API" --stream
```

Shows real-time progress inline in the terminal:
```
[12:34:56] [coder]    >>> started (claude-code)
[12:34:58] [coder]    -> Read src/index.ts
[12:35:01] [coder]    <- Read
[12:35:03] [coder]    -> Edit src/index.ts
[12:35:05] [coder]    <- Edit
[12:35:06] [coder]    #1 (in=2340 out=890)
[12:35:10] [coder]    <<< done (turns=2 $0.0124)
```

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
| `reviewer` | Per-Task Code Review (git diff + checklist), Quality Gate |
| `tester` | Systematic Debug |

**TDD** — Enforces RED-GREEN-REFACTOR. Write failing test first. Minimal code to pass. Refactor.

**Per-Task Code Review** — After each coder task completes, the reviewer immediately receives the actual `git diff` and reads it line-by-line against a specific checklist: design flaws, race conditions, busy-waits, stale locks, delta/merge confusion, missing `finally` blocks, and more. Critical findings block the commit — the task is marked failed before any code is committed. Phase 3 now focuses solely on automated verification (tsc, npm test, eslint).

**Socratic Brainstorm** — Explore requirements through targeted questions. Challenge assumptions. Document decisions.

## Sandbox (Builtin Engine)

The builtin engine enforces a sandbox policy on every agent. Write operations are restricted to the project directory, and bash commands are filtered per role.

**Configuration via `ExecuteOptions.sandbox`:**

| Value | Behavior |
|-------|----------|
| `true` (default) | Use role-based defaults |
| `false` | Disable sandbox entirely |
| `SandboxPolicy` object | Custom rules |

**Default policies by role:**

| Role | Write Paths | Bash Mode | Patterns |
|------|------------|-----------|----------|
| `coder` | `[cwd]` | denylist | `rm -rf /`, `sudo `, `mkfs`, `dd if=`, `chmod 777`, `> /dev/sd` |
| `tester` | `[cwd]` | allowlist | `npm test`, `npx tsc`, `npx vitest`, `npx jest`, `node `, `cat `, `ls`, `grep `, `find ` |
| `reviewer` | `[cwd]` | allowlist | `cat `, `ls`, `grep `, `find `, `git log`, `git diff`, `git show` |
| `architect` | `[cwd]` | allowlist | `cat `, `ls`, `grep `, `find `, `tree ` |
| `planner` | `[cwd]` | allowlist | `cat `, `ls`, `find `, `wc ` |

- **Allowlist**: command must start with an allowed prefix — anything else is blocked
- **Denylist**: command must not contain any denied pattern — everything else is allowed
- Path validation is case-insensitive on Windows
- Per-agent override via `sandbox` field in `TeamAgentDef` or agent frontmatter

## Built-in Agents

| Name | Role | Description |
|------|------|-------------|
| planner | planner | Decomposes goals into structured micro-tasks |
| architect | architect | Designs system architecture and interfaces |
| coder | coder | Full-stack developer with sub-agent parallelism (Agent tool enabled) |
| reviewer | reviewer | Per-task code review with git diff checklist + quality gate |
| tester | tester | Designs and runs tests, debugs failures |

### Two-Level Parallelism

AWSL achieves parallelism at two levels simultaneously:

```
┌─────────────────────────────────────────────────────────┐
│  Level 1: AWSL Orchestration (planner controls)         │
│                                                         │
│  Wave 1: [architect]         ← design first             │
│  Wave 2: [coder, coder]     ← feature A + feature B    │
│  Wave 3: [tester, reviewer] ← test + review             │
│                                                         │
│  Each coder is a separate claude -p process             │
│  Planner ensures file-disjoint tasks per wave           │
├─────────────────────────────────────────────────────────┤
│  Level 2: Claude Code Agent Tool (coder controls)       │
│                                                         │
│  coder (feature A) internally spawns:                   │
│    ├─ sub-agent 1 → API endpoint (server.ts)            │
│    └─ sub-agent 2 → UI component (dashboard.html)       │
│                                                         │
│  coder (feature B) internally spawns:                   │
│    ├─ sub-agent 1 → data model (types.ts)               │
│    └─ sub-agent 2 → test suite (feature-b.test.ts)      │
└─────────────────────────────────────────────────────────┘
```

- **Level 1** splits by **feature module** — planner creates independent tasks, each assigned to a coder
- **Level 2** splits by **file layer** — coder uses the Agent tool to work on multiple files within its task concurrently
- Parallel tasks at Level 1 MUST NOT share files (enforced by planner)
- Sub-agents at Level 2 are coordinated by the parent coder (no file conflicts within a task)

To enable the Agent tool on custom agents, add `agent` to the tools list:

```yaml
tools: read,write,edit,bash,grep,glob,agent
```

## Custom Agents

Create `agents/<name>.md` in your project — manually, via CLI, or through the Dashboard UI:

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
| `name` | Agent identifier (required). Must match `/^[a-z][a-z0-9-]*$/`, max 50 chars |
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

### Managing Agents via CLI

```bash
awsl agents                    # List all agents (built-in + custom)
awsl agents show <name>        # Show full details including system prompt
awsl agents create <name>      # Create a new custom agent
  --role <role>                #   Role (default: custom)
  --description <desc>         #   Short description
  --prompt <text>              #   System prompt (inline)
  --prompt-file <path>         #   System prompt from file
  --template <name>            #   Pre-populate from a built-in template
  --tools <t1,t2>             #   Tools list
  --model <model>              #   Model override
  --skills <s1,s2>            #   Guardian skills
  --thinking <level>           #   Thinking level (low/medium/high)
awsl agents edit <name>        # Edit an existing agent (same flags as create)
awsl agents delete <name>      # Delete a custom agent file
awsl agents reset <name>       # Delete override, restore built-in default
awsl agents templates          # List all 7 built-in prompt templates
awsl agents prompt <name>      # Open prompt in $EDITOR for focused editing
awsl agents prompt <name> --show   # Print current prompt to stdout
awsl agents prompt <name> --set "..."  # Set prompt inline
awsl agents prompt <name> --file <path>  # Set prompt from file
awsl agents preview <name>     # Show full composed prompt (base + skills + team)
```

**How overrides work:** Editing a built-in agent (e.g. `coder`) creates `agents/coder.md` which overrides the default. Use `agents reset coder` to delete the override and restore the original.

### Prompt Templates

AWSL ships with 7 built-in prompt templates for common roles: **coder**, **reviewer**, **architect**, **tester**, **planner**, **devops**, and **documenter**. Templates provide a starting point for writing effective agent prompts.

```bash
# List all templates
awsl agents templates

# Create an agent using a template as starting point
awsl agents create my-devops --role coder --template devops

# Preview the full composed prompt (base + skills + team context)
awsl agents preview coder
```

The `--template` flag on `create`/`edit` pre-populates the system prompt and role from the template. Explicit `--prompt`/`--prompt-file` overrides the template.

### Managing Agents via Dashboard

The Dashboard includes an **Agent Roles** (角色管理) card with a visual editor:

- **Agent cards** — Each agent displayed as a card with name, role badge (color-coded), and source badge (`built-in` grey / `custom` green / `override` yellow)
- **Editor modal** — Click any card or `[+New]` to open the full editor with fields for Name, Role, Description, Model, Tools, Skills, Thinking Level, and System Prompt (monospace textarea)
- **Template selector** — Dropdown above the prompt textarea loads built-in templates. "Apply" fills the prompt and auto-sets role/description
- **Fullscreen editor** — "Expand" button opens a full-viewport overlay with a monospace textarea for editing long prompts comfortably
- **Character count** — Live character count displayed below the textarea in both normal and fullscreen modes
- **Preview panel** — "Preview" button (edit mode) opens a fullscreen view of the composed prompt with tabbed sections: Composed / Base / Skills / Team
- **Actions** — `[Save]` to create/update, `[Reset to Default]` for overridden built-ins, `[Delete]` for custom agents

### Agent CRUD API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/agents` | List all agents. `?name=X` returns a single agent |
| `POST` | `/api/agents` | Create new custom agent `{name, role, systemPrompt, ...}` |
| `PUT` | `/api/agents` | Update existing agent `{name, ...fields}` |
| `DELETE` | `/api/agents?name=X` | Delete custom agent file |
| `GET` | `/api/agents/templates` | List all 7 built-in prompt templates `[{name, description, prompt}]` |
| `POST` | `/api/agents/preview` | Compose full prompt preview `{name}` → `{composed, sections: {base, skills, team}}` |

Remote clients also support agent management via relay commands: `agents:list`, `agents:get`, `agents:save`, `agents:delete`, `agents:templates`, `agents:preview`.

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
├── REVIEW.md             # Per-task reviewer findings (git diff review with anti-pattern checklist)
├── CHECKPOINT.json       # Rate-limit recovery checkpoint (auto-managed)
├── QUEUE.json            # Task queue for sleep mode (auto-managed)
├── HISTORY.json          # Sleep mode execution history (auto-managed)
├── STATS.json            # Invocation tracking counts (auto-managed)
├── .dashboard.pid        # Background dashboard process PID (auto-managed)
├── DISCUSSION-*.md       # Discussion mode transcripts (auto-managed)
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
| Overnight build, no human | Terminal Mode (`--engine claude-code` or `--engine codex`) |
| CI/CD integration | Terminal Mode |
| Highest code quality | Terminal Mode (reviewer loop) |
| Fastest delivery | CC Mode |
| Bug fix | CC Mode (`/awsl-quick`) |
| Overnight multi-project build | Task Queue (`awsl queue start`) |
| Architecture decisions, design trade-offs | Discussion Mode (`awsl discuss`) |

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
    verify: true,          // Per-task code review + verification
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
awsl run "goal" --engine codex
awsl run "goal" --engine codex --quick

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

# Invocation tracking
awsl track <type> [goal]         # Record an invocation (team/plan/go/quick/queue/cli/discuss)
awsl invocations                 # Show invocation counts per command type

# Agents
awsl agents                  # List all agents
awsl agents show <name>      # Show full agent details including system prompt
awsl agents create <name>    # Create custom agent (--role, --prompt, --template, --tools, etc.)
awsl agents edit <name>      # Edit existing agent (same flags as create)
awsl agents delete <name>    # Delete custom agent file
awsl agents reset <name>     # Delete override, restore built-in default
awsl agents templates        # List all 7 built-in prompt templates
awsl agents prompt <name>    # Edit prompt in $EDITOR (--show, --set, --file)
awsl agents preview <name>   # Show composed prompt (base + skills + team)

# Task queue (sleep mode)
awsl queue add "Build REST API" --quick      # Add task to queue
awsl queue add "Add auth" --depends-on q_1   # Add with dependency
awsl queue add "Write tests" --depends-on all # Wait for all prior tasks
awsl queue add "Nightly build" --at "03:00"  # Schedule for 3:00 AM
awsl queue add "Later task" --at "+2h"       # Schedule 2 hours from now
awsl queue split "First auth, then payments, finally tests" # Natural language → preview → confirm → add
awsl queue split "..." --yes                             # Skip confirmation prompt
awsl queue plan "First auth, then payments, finally tests"  # Natural language → auto-split (no preview)
awsl queue list                               # Show queue status
awsl queue show q_1                           # Show detailed info for a single task
awsl queue remove q_1                         # Remove a task
awsl queue start --engine claude-code         # Start queue execution
awsl queue start --engine codex               # Start queue execution with Codex
awsl queue clear                              # Clear all tasks

# Discussion mode
awsl discuss "How should we design the auth system?"              # Direct discussion
awsl queue add --discuss "Evaluate database options" --rounds 2   # Via queue with debate
awsl queue add --discuss --at 03:00 "Microservices vs monolith"   # Schedule overnight

# Quick start — one command boots everything
awsl start                                   # Start dashboard + remote (if configured)
awsl start --server http://server:3120       # Start + configure remote in one shot
awsl stop                                    # Stop all services (also releases lock + resets running tasks)
awsl status                                  # Check what's running

# Dashboard (manual control)
awsl dashboard [--port N]                     # Open the sleep mode pixel dashboard (default: 3120)
awsl dashboard --bg                          # Start dashboard as background process
awsl dashboard stop                          # Stop background dashboard process

# Project management
awsl projects                                # List all registered projects with status
awsl projects add [path] [--name N]          # Register a project (default: cwd)
awsl projects remove <path|name>             # Unregister a project
awsl projects scan [dir]                     # Auto-discover projects in a directory

# Night session summary
awsl summary                                 # Last night's session (22:00→06:00)
awsl summary --date 2026-03-10               # Specific night
awsl summary --all-projects                  # All registered projects

# Remote control (connect local machine to remote dashboard)
awsl remote init http://server:3120          # Save config + start connection
awsl remote status                           # Show connection status
awsl remote stop                             # Stop background client
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Only for `--engine builtin` | Anthropic API key |
| `OPENAI_API_KEY` | Only for OpenAI models | OpenAI API key |
| `DEBUG=1` | No | Enable debug logging |

> **Note:** `--engine claude-code` and `--engine codex` do NOT need a separate API key in AWSL. They use your local CLI session (`claude -p` or `codex exec`).

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
| **Code review** | Per-task git diff review + static | Reviewer agent | None |
| **Git history** | Per-task atomic commits | Single commit | Single commit |
| **Spec compliance** | High (reviewer loop) | Medium | Variable |
| **Speed** | ~20 min | ~6 min | ~5 min |
| **Autonomy** | Full | Partial | None |

## License

MIT
