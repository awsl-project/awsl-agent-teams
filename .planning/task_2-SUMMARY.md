# task_2: Add a new `queue split` subcommand in `src/cli.ts` inside th

Assignee: coder
Status: done

## Result
Everything looks correct. 

## AWSL_RESULT

**Added `queue split` subcommand to `src/cli.ts`:**

1. **Option parsing** (lines 1146-1163): Parses `--engine`, `--quick`, `--concurrency`, `--model`, `--yes`/`-y`, plus description text from remaining args
2. **Preview table** (lines 1175-1186): Calls `queue.planPreview(description)`, prints numbered table with `#`, `Deps`, `Goal` columns using `─` separator
3. **Confirmation prompt** (lines 1188-1201): Uses `node:readline` `createInterface` + `rl.question()` wrapped in a Promise. Skipped when `--yes` flag is set. Prints `已取消` on decline
4. **Commit & output** (lines 1203-1214): Calls `queue.planCommit(planned, defaults)`, prints result table with actual `q_N` IDs (same format as `queue plan` output)
5. **Usage updated** (line 78-79): Added `queue split` with `--yes` flag documentation
6. **Error message updated** (line 1217): Added `split` to list of valid queue subcommands

**Files modified:**
- `src/cli.ts` — Added `createInterface` import, `queue split` subcommand, usage entry, updated error message

**Verification:**
- `npx tsc --noEmit` — clean, no errors