## AWSL_RESULT

### Design: Night Session Summary Module (`awsl summary`)

**Approach:** History + Git Hybrid (Approach B)

**Why:** Uses existing data (HISTORY.json + git log) without new state files. Captures both automated queue tasks and manual commits. Simple, extensible.

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Cross-midnight auto-detection | If now < 06:00 → last night; if now >= 22:00 → tonight; else → last night |
| Multi-project via `--all-projects` | Reuses `ProjectManager.list()` to aggregate across registered projects |
| `--json` flag for scripting | Enables dashboard API integration later |
| Git log for completeness | Captures manual work not tracked by queue |
| No new persistence files | Pure read-only aggregation over existing data |

### Interfaces

- `SessionSummary` — tasks (total/done/failed/entries), git (commits), metrics (duration/cost/tokens), agent breakdown, projects
- `SummaryOptions` — from, to, date, allProjects, cwd
- `TimeRange`, `CommitInfo` — supporting types

### Execution Plan (4 tasks, 3 waves)

| Wave | Task | Assignee | Description |
|------|------|----------|-------------|
| 1 | task_1 | coder | Core `src/summary.ts` module |
| 2 | task_2 | coder | CLI integration + index exports |
| 2 | task_3 | coder | Documentation (README, README.zh-CN, BEST_PRACTICES) |
| 3 | task_4 | reviewer | Security + correctness review |

### Files Produced

- `.planning/designs/night-summary.md` — Full design document
- `.planning/PLAN.md` — Execution plan ready for `/awsl-go`