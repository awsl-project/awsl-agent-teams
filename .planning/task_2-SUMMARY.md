# task_2: Update all three documentation files to mention the new auto

Assignee: coder
Status: done

## Result
Build passes. 

## AWSL_RESULT

### Task Complete: Update documentation for queue auto-commit

**Files modified:**

| File | Change |
|---|---|
| `README.md` (line 304) | Added "Auto-Commit" subsection in the Task Queue section explaining that each queue task auto-commits QUEUE.json + HISTORY.json on completion |
| `README.zh-CN.md` (line 304) | Added mirrored "自动提交" subsection in Chinese |
| `BEST_PRACTICES.md` (line 1110) | Added "自动提交" row to the queue 注意事项 table |

**Verification:** `grep -l 'auto-commit\|自动.*commit' README.md README.zh-CN.md BEST_PRACTICES.md` — all three files match.