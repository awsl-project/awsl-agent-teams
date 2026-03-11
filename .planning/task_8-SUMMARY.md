# task_8: Update all three documentation files to cover the new discus

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task: Update documentation for discussion mode

**Status:** Complete

**Files modified:**
- `README.md` — Added "Discussion Mode" section (after Sleep Mode Dashboard, before Night Session Summary), CLI examples in CLI Reference, `/api/discussions` endpoint, `DISCUSSION-*.md` in `.planning/` directory listing, discussion mode in "When to Use Which" table
- `README.zh-CN.md` — Mirrored all changes in Chinese: "讨论模式" section, CLI reference, API endpoint, `.planning/` listing, mode selection table
- `BEST_PRACTICES.md` — Added section 17 "讨论模式 vs 构建模式" with: use case comparison table, usage examples, `--rounds` guidance (1-3), tips (overnight scheduling, discuss+build workflow, dashboard API), added to command selection guide, added to "不要做的事" table, renumbered subsequent sections (18→19, 19→20)

**Documentation covers:**
- Concept: multi-agent collaborative reasoning
- CLI examples: `awsl discuss`, `awsl queue add --discuss`, with `--rounds` and `--at`
- Discussion flow: parallel perspectives → debate rounds → synthesis
- Output: `.planning/DISCUSSION-{timestamp}.md` files
- Summary integration
- Dashboard endpoint: `GET /api/discussions`
- When to use discussion vs build mode
- Rounds guidance (1=simple, 2=most decisions, 3=complex debates)
- Tips: overnight scheduling, discuss→build workflow