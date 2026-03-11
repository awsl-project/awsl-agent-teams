# task_6: Modify `src/cli.ts` to support discussion mode:

1. **Update

Assignee: coder
Status: done

## Result
All three changes are in place and type-check passes.

## AWSL_RESULT

### Task: Modify `src/cli.ts` to support discussion mode

**Status:** Complete

**Files modified:**
- `src/cli.ts`

**Changes made:**

1. **`usage()` text updated** — Added `--discuss` and `--rounds` flags under `queue add`, plus `discuss <question>` alias at the end of the Queue Commands section.

2. **`discuss` command handler** — New block before the `queue` command (line ~862). Parses `--rounds`, `--at`, and `--cwd` flags. Validates question is at least 10 characters. Calls `queue.add()` with `mode: "discuss"` and `discussRounds`.

3. **`queue add --discuss` flag** — Added `--discuss` and `--rounds` parsing in the flag loop. Passes `discussRounds` and `mode: "discuss"` to `queue.add()` when `--discuss` is set. Outputs mode info after task creation.

**Verification:** `npx tsc --noEmit` passes with zero errors.