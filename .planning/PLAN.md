# Execution Plan

## task_1: Core summary module
- **Assignee:** coder
- **Files:** src/summary.ts

### Action
Create src/summary.ts implementing the night session summary module per the design at .planning/designs/night-summary.md.

Types to define:
- TimeRange { from: Date; to: Date }
- CommitInfo { hash, message, date, author }
- SessionSummary { timeRange, tasks: { total, done, failed, entries }, git: { commitCount, commits }, totalDuration, totalCostUsd, totalInputTokens, totalOutputTokens, agentBreakdown, projects }
- SummaryOptions { from?, to?, date?, allProjects?, cwd? }

Functions to implement:
1. computeTimeRange(options): TimeRange — Cross-midnight logic:
   - Default from='22:00', to='06:00'
   - If --date given: from = dateT22:00 local, to = date+1T06:00 local
   - If no date and now < 06:00: from = yesterday 22:00, to = today 06:00
   - If no date and now >= 22:00: from = today 22:00, to = tomorrow 06:00
   - Otherwise (06:00-22:00): from = last night 22:00, to = today 06:00

2. generateSummary(options): SessionSummary —
   - Call computeTimeRange
   - Load HISTORY.json via loadHistory() from ./history.js. If allProjects, iterate ProjectManager.list() and load each project's history
   - Filter entries where startedAt or completedAt falls within [from, to] (convert ISO strings to Date, compare in local time)
   - Collect git commits via child_process.execSync: git log --after=<from ISO> --before=<to ISO> --format='%H|%s|%aI|%an'
   - Aggregate: sum duration/cost/tokens, count agents from entry.agents arrays, collect unique project names
   - Return SessionSummary

3. formatSummary(summary): string — Pretty CLI output with box-drawing chars:
   - Header: time range
   - Stats: tasks done/failed, duration (format ms→Xh Ym), cost ($X.XX), tokens (XK in / YK out), commit count
   - Agent breakdown table
   - Timeline: sorted entries with [done]/[failed] status, duration, cost
   - Projects list
   - Handle empty case: 'No activity found in this time range.'

Use imports: fs, path, child_process (execSync), log from ./log.js, loadHistory/HistoryEntry from ./history.js, ProjectManager from ./projects.js.
Follow project conventions: strict TS, .js extension imports, log() not console.log, named exports.

### Verify
npx tsc --noEmit

### Done
src/summary.ts compiles with no errors, exports computeTimeRange, generateSummary, formatSummary, and all types

## task_2: CLI integration + exports
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/cli.ts, src/index.ts

### Action
Integrate the summary command into CLI and add public exports.

1. src/cli.ts:
   - Add import: import { generateSummary, formatSummary } from './summary.js'
   - Add 'summary' to the usage() function help text:
     ```
     summary [options]          Summarize night session activity (default: 22:00→06:00)
       --from <HH:MM>           Start time (default: 22:00)
       --to <HH:MM>             End time (default: 06:00)
       --date <YYYY-MM-DD>      Anchor date
       --all-projects            Aggregate across all registered projects
     ```
   - Add a case for 'summary' in the main switch/if chain. Parse args:
     - --from <value>, --to <value>, --date <value>, --all-projects (boolean flag)
     - --cwd <value> (already parsed by parseCwdAndForce or similar)
   - Call generateSummary({ from, to, date, allProjects, cwd })
   - Print formatSummary(result) to console
   - Handle errors with try/catch, log.error

2. src/index.ts:
   - Add export line: export { generateSummary, formatSummary, computeTimeRange, type SessionSummary, type SummaryOptions, type TimeRange, type CommitInfo } from './summary.js'

Follow existing CLI patterns in cli.ts for argument parsing and error handling.

### Verify
npx tsc --noEmit

### Done
awsl summary --help shows in usage, `awsl summary` runs without error, types exported from index.ts

## task_3: Unit tests
- **Assignee:** tester
- **Dependencies:** task_1
- **Files:** src/summary.test.ts

### Action
Create src/summary.test.ts with comprehensive tests using node:test.

Tests to write:

1. computeTimeRange tests:
   - Test with 'now' at 02:00 (before 06:00): should return yesterday 22:00 → today 06:00
   - Test with 'now' at 23:00 (after 22:00): should return today 22:00 → tomorrow 06:00
   - Test with 'now' at 14:00 (between 06:00-22:00): should return last night 22:00 → today 06:00
   - Test with explicit --date '2026-03-10': should return 2026-03-10T22:00 → 2026-03-11T06:00
   - Test with custom --from '21:00' --to '05:00': should use custom times

2. generateSummary filtering tests:
   - Create a temp dir with a mock .planning/HISTORY.json containing entries at various times (some inside 22:00-06:00, some outside)
   - Call generateSummary with explicit date, verify only correct entries are included
   - Verify aggregation: totalDuration, totalCostUsd, totalInputTokens, totalOutputTokens
   - Verify agentBreakdown counts
   - Test empty history: should return zeroed summary
   - Test entries with null/undefined optional fields (costUsd, inputTokens etc): should not crash

3. formatSummary tests:
   - Test with a valid SessionSummary: output should contain key strings like time range, task count, cost
   - Test with empty summary (0 tasks, 0 commits): should contain 'No activity'

Use temp directories (fs.mkdtempSync) for isolation. Clean up in after() hooks.
Note: computeTimeRange may need to accept a 'now' parameter for testability — if not already present, the coder task should add it. If not, mock Date or test with --date flag instead.

Import from './summary.js' using relative path.

### Verify
node --experimental-vm-modules --test src/summary.test.ts

### Done
All tests pass, covering time range computation, history filtering, aggregation, and format output

## task_4: Documentation
- **Assignee:** coder
- **Dependencies:** task_1, task_2
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Add documentation for the awsl summary command to all three doc files.

1. README.md (English):
   - Add a 'Night Session Summary' section (or add to existing CLI commands section)
   - Document: awsl summary, --from, --to, --date, --all-projects flags
   - Show example output (abbreviated version of the box-drawing format)
   - Mention it pulls from HISTORY.json + git log

2. README.zh-CN.md (Chinese):
   - Mirror the same content in Chinese
   - awsl summary = 夜间工作总结
   - Translate flag descriptions and example output

3. BEST_PRACTICES.md:
   - Add a section on using awsl summary for tracking night coding sessions
   - Tips: use --date for reviewing past nights, use --all-projects for multi-project overview
   - Example workflow: run awsl summary before going to sleep or first thing in the morning

Keep additions concise. Match existing doc style and formatting.

### Verify
cat README.md README.zh-CN.md BEST_PRACTICES.md | grep -c summary

### Done
All three doc files mention awsl summary with usage examples

## task_5: Review implementation
- **Assignee:** reviewer
- **Dependencies:** task_1, task_2, task_3
- **Files:** src/summary.ts, src/cli.ts, src/summary.test.ts

### Action
Review the night session summary implementation for:

1. Security:
   - Check that git log command in summary.ts is not vulnerable to command injection (verify time range values are sanitized before passing to execSync)
   - Check that file paths from ProjectManager are validated before use
   - Verify no sensitive data leaks in output

2. Correctness:
   - Verify cross-midnight time range logic handles all edge cases (midnight exactly, DST transitions if applicable)
   - Verify history filtering correctly handles UTC→local time conversion
   - Check that token/cost aggregation handles undefined/null fields safely

3. Code quality:
   - Follows project conventions (strict TS, .js imports, log() usage, named exports)
   - No console.log in production code
   - Error handling follows fail-soft pattern (return defaults, not throw)
   - Types are properly exported

4. Test coverage:
   - Verify tests cover the edge cases listed in .planning/designs/night-summary.md
   - Check that tests use temp dirs for isolation

Report findings via the report tool with specific file:line references.

### Verify
npx tsc --noEmit

### Done
No critical or high-severity issues found, or all issues have been fixed
