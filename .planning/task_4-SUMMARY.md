# task_4: Update all three documentation files to cover the new `queue

Assignee: coder
Status: done

## Result
Clean compile.

## AWSL_RESULT

**Updated all three documentation files to cover `queue split`:**

### README.md (English)
- Added `queue split` as the recommended command in the Task Queue usage section (line 265)
- Expanded "Natural Language Queue Planning" section with `queue split` preview example + `queue plan` as backward-compatible alternative (lines 284-320)
- Added `queue split` and `queue split --yes` to CLI Reference section (lines 938-939)

### README.zh-CN.md (Chinese)
- Mirrored all changes in Chinese: `queue split` with example `"先构建认证，然后加支付，最后写集成测试"` (line 265)
- Expanded natural language section with preview output in Chinese and confirmation prompt `确认添加 3 个任务到队列？(y/N)` (lines 284-325)
- Added `queue split` to CLI Reference section (lines 933-934)

### BEST_PRACTICES.md (Chinese)
- Updated terminal mode command list: `queue split` = 先预览, `queue plan` = 直接添加 (line 55)
- Replaced "自然语言排队（推荐）" section with comparison table of all three commands (`queue split` / `queue plan` / `queue add`) with usage guidance (lines 1185-1231)
- Updated "典型睡前工作流" to recommend `queue split` as the primary method (line 1332)

**Files modified:**
- `README.md`
- `README.zh-CN.md`
- `BEST_PRACTICES.md`

**Verification:**
- `npx tsc --noEmit` — clean, no errors
- All three files contain `queue split` with examples and usage guidance (verified via grep)