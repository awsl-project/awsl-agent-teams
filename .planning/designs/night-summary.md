# Design: Night Session Summary Module

## Goal

A module that summarizes what the user accomplished during a night coding session (default: 22:00 → 06:00), aggregating data from all task dimensions: queue history, git commits, cost, agents used, and projects touched.

## Decision: Approach B — History + Git Hybrid

### Why This Approach

- **History-only (A):** Too narrow — misses manual git work outside queue tasks
- **History + Git (B):** ✅ Chosen — captures both automated (queue) and manual (git) work using existing data. No new state files needed.
- **Full session model (C):** Overkill — requires new tracking infrastructure for minimal gain

### Key Design Decisions

1. **Time range crosses midnight** — "tonight 22:00" means 22:00 of the previous calendar day if current time is before 06:00; otherwise 22:00 of today. Configurable via `--from` / `--to`.

2. **Data sources:** HISTORY.json (primary) + `git log` (secondary). No new persistence.

3. **Multi-project support** — Can aggregate across all registered projects via `ProjectManager.list()`.

4. **Output formats:** Human-readable CLI table (default) + structured JSON (for dashboard API).

5. **Timezone handling:** Compare local time. Convert HISTORY.json UTC timestamps to local before filtering.

---

## Interfaces

```typescript
// src/summary.ts

export interface TimeRange {
  from: Date;   // inclusive (local time)
  to: Date;     // inclusive (local time)
}

export interface CommitInfo {
  hash: string;
  message: string;
  date: string;   // ISO timestamp
  author: string;
}

export interface SessionSummary {
  timeRange: TimeRange;

  // Task dimension (from HISTORY.json)
  tasks: {
    total: number;
    done: number;
    failed: number;
    entries: HistoryEntry[];  // filtered entries within range
  };

  // Git dimension
  git: {
    commitCount: number;
    commits: CommitInfo[];
  };

  // Aggregated metrics
  totalDuration: number;       // ms of active task execution time
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;

  // Agent breakdown: role → count of tasks assigned
  agentBreakdown: Record<string, number>;

  // Projects touched (from history entries)
  projects: string[];
}

export interface SummaryOptions {
  from?: string;          // "HH:MM" or ISO — default "22:00"
  to?: string;            // "HH:MM" or ISO — default "06:00"
  date?: string;          // "YYYY-MM-DD" — anchor date (default: auto-detect)
  allProjects?: boolean;  // aggregate across all registered projects
  cwd?: string;           // project root (default: process.cwd())
}
```

## Core Function

```typescript
export function generateSummary(options: SummaryOptions): SessionSummary
```

### Logic

1. **Compute time range:**
   - Default from=22:00, to=06:00
   - If `--date 2026-03-10` given: from = 2026-03-10T22:00 local, to = 2026-03-11T06:00 local
   - If no date and current time < 06:00: from = yesterday 22:00, to = today 06:00
   - If no date and current time >= 22:00: from = today 22:00, to = tomorrow 06:00
   - Otherwise (between 06:00-22:00): from = last night 22:00, to = today 06:00

2. **Collect history entries:**
   - If `allProjects`: iterate `ProjectManager.list()`, load each project's HISTORY.json
   - Otherwise: load current project's HISTORY.json
   - Filter entries where `startedAt` or `completedAt` falls within [from, to]

3. **Collect git commits:**
   - Run `git log --after=<from> --before=<to> --format="%H|%s|%aI|%an"` in each project dir
   - Parse into `CommitInfo[]`

4. **Aggregate:**
   - Sum duration, cost, tokens from filtered history entries
   - Count agents from `entry.agents` arrays
   - Collect unique project names

5. **Return `SessionSummary`**

## CLI Command

```
awsl summary                          # Auto-detect tonight
awsl summary --from 22:00 --to 06:00  # Explicit range
awsl summary --date 2026-03-10        # Specific night (March 10 evening)
awsl summary --all-projects           # Aggregate across all projects
```

### CLI Output Format

```
╔══════════════════════════════════════════════╗
║  Night Summary: 2026-03-10 22:00 → 03-11 06:00  ║
╠══════════════════════════════════════════════╣

  Tasks:    12 done, 1 failed (92% success)
  Duration: 2h 34m (active execution time)
  Cost:     $18.42
  Tokens:   245K in / 189K out
  Commits:  28

  Agent Breakdown:
    coder     8 tasks
    reviewer  4 tasks
    tester    1 task

  Timeline:
    22:15  [done]  验证链路拆清楚 (8m 32s, $2.71)
    22:45  [done]  锁管理抽成运行上下文 (16m 43s, $5.52)
    23:14  [done]  builtin engine 沙箱 (17m 31s, $5.74)
    ...

  Projects: awsl-agent-teams

╚══════════════════════════════════════════════╝
```

## File Changes

| File | Change |
|------|--------|
| `src/summary.ts` | **NEW** — Core module: `generateSummary()`, `formatSummary()`, types |
| `src/cli.ts` | Add `summary` command handler with flag parsing |
| `src/index.ts` | Re-export `generateSummary`, `SessionSummary`, `SummaryOptions` from `./summary.js` |
| `README.md` | Document `awsl summary` command |
| `README.zh-CN.md` | Mirror documentation in Chinese |
| `BEST_PRACTICES.md` | Add usage examples and tips |

## Edge Cases

1. **No entries in range** → Print "No activity found in this time range."
2. **Entries with null duration** → Skip in duration sum, note in output
3. **Git not available** → Skip git dimension, show history only
4. **Cross-midnight math** → Tested explicitly with dates near midnight boundary
5. **All-projects mode with missing projects** → Skip missing, log warning

## Testing Strategy

- Unit test `computeTimeRange()` with various "now" times
- Unit test filtering logic with mock HISTORY.json data
- Integration test: CLI `awsl summary` produces valid output
- Edge: empty history, single entry, entries exactly at boundary timestamps
