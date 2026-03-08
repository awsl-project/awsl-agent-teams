**English** | [中文](./README.zh-CN.md)

# AWSL Agent Core

Multi-agent orchestration engine for Claude Code.
Two modes, one goal: **ship quality code fast**.

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
# Install skills into Claude Code
npx awsl-agent-core init --global

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
| `--no-verify` | false | Skip verification phase |
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
Phase 3:  Verify        code-based verification (tsc, npm test, eslint)
Phase 3b: Auto-Fix      on verify failure → coder fixes → re-verify (max 3 rounds)
Phase 4:  Re-plan       on task failure → retry 2x → replan with different approach
```

### Self-Healing Features

| Feature | Description |
|---------|-------------|
| **Auto-fix loop** | Verify fails → spawn coder agent → re-verify → up to 3 attempts |
| **Task auto-retry** | Failed tasks retry 2x with error context before re-planning |
| **Reviewer hard-block** | Critical severity findings = task failed, must fix |
| **File conflict detection** | Same-wave tasks sharing files → auto-split to different waves |
| **Git checkpoints** | Atomic commit after each successful wave (bisectable) |
| **Cross-wave context** | Wave N+1 agents see actual file contents from Wave N |

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
| `tools` | Comma-separated: `read,write,edit,bash` |
| `skills` | Guardian skills to activate: `tdd,debug,brainstorm,review,planning` |
| `thinking` | LLM thinking level: `low`, `medium`, `high` |
| `model` | Override model: `anthropic:claude-sonnet-4-20250514`, `openai:gpt-4o` |

## .planning/ Directory

State persists across sessions:

```
.planning/
├── .lock                 # Concurrency lock (auto-managed)
├── STATE.md              # Progress, decisions, blockers
├── DESIGN.md             # Brainstorm output
├── PLAN.md               # Structured task breakdown
├── WAVES.md              # Computed wave schedule
├── VERIFICATION.md       # Test/lint/typecheck results
├── REVIEW.md             # Static code review results
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
  | "retry_start" | "checkpoint";
```

## CLI Reference

```bash
# Install Claude Code skills
awsl init                    # Project-local (.claude/skills/)
awsl init --global           # Global (~/.claude/skills/)

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
