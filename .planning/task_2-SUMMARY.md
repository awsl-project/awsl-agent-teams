# task_2: Integrate the summary command into CLI and add public export

Assignee: coder
Status: done

## Result
All 20 original tests pass. All 3 CLI integration tests pass. Type-check clean.

## AWSL_RESULT

### Deliverable: CLI Summary Integration + Public Exports

**Status:** Complete — zero type errors, all tests pass (20 module + 3 CLI integration).

### Files Modified

| File | Changes |
|------|---------|
| `src/cli.ts` | Added `import { generateSummary, formatSummary }`, added `summary` to `usage()`, added `summary` command handler with `--from`, `--to`, `--date`, `--all-projects`, `--cwd` arg parsing |
| `src/index.ts` | Added export line for `generateSummary`, `formatSummary`, `computeTimeRange`, `SessionSummary`, `SummaryOptions`, `TimeRange`, `CommitInfo` |

### Files Created

| File | Description |
|------|-------------|
| `src/summary-cli.test.ts` | 3 integration tests: index exports, CLI usage text, end-to-end `awsl summary` execution |

### CLI Usage
```
summary [options]           Summarize night session activity (default: 22:00→06:00)
  --from <HH:MM>             Start time (default: 22:00)
  --to <HH:MM>               End time (default: 06:00)
  --date <YYYY-MM-DD>        Anchor date
  --all-projects             Aggregate across all registered projects
```

### Test Results
- `src/summary.test.ts`: 20 passed, 0 failed
- `src/summary-cli.test.ts`: 3 passed, 0 failed
- `npx tsc --noEmit`: zero errors