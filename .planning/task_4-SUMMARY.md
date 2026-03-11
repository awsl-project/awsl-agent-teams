# task_4: Add documentation for the awsl summary command to all three 

Assignee: coder
Status: done

## Result
Sections 0-19, all sequential with no gaps or duplicates.

## AWSL_RESULT

### Deliverable: Documentation for `awsl summary` in all three doc files

**Status:** Complete — all three files updated, 37 mentions of "summary" across docs, type-check clean.

### Files Modified

| File | Changes |
|------|---------|
| `README.md` | Added `awsl summary` to Auxiliary Commands, new "Night Session Summary" section with options table + example output, added to CLI Reference |
| `README.zh-CN.md` | Mirrored all changes in Chinese: 辅助命令 section, new "夜间工作总结" section, CLI 参考 section |
| `BEST_PRACTICES.md` | Added `awsl summary` to command cheatsheet (§1), new §16 "夜间工作总结" with usage, data sources, time detection table, recommended workflow, tips. Renumbered §17-19 |

### Verification

```
grep -c summary README.md README.zh-CN.md BEST_PRACTICES.md → 37 matches
npx tsc --noEmit → zero errors
```