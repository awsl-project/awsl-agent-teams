## AWSL_RESULT

### Design: Wave Detail Visibility in Remote Dashboard

**Problem:** 远程面板的 WaveInfo 只有 `{ wave, taskIds, agents, parallel }` — 看不到每个 wave 具体解决了什么。

**Solution:** Enrich `WaveInfo` with per-task details (description, status, files, result/error).

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| **Enrich WaveInfo (Approach A)** over live events | User's ask is post-hoc ("解决了啥"), simplest approach that rides existing data pipeline |
| **Add `WaveTaskDetail` interface** | Structured per-task data: id, description, assignee, status, files, result, error |
| **Add wave-level `status`** field | Quick summary: `success` / `partial` / `failed` |
| **Truncate result/error to 200 chars** | Prevent payload bloat in history sync |
| **Keep `taskIds` alongside `tasks`** | Backward compatibility with old data |
| **Remove WaveInfo duplication** | Currently in both orchestrator.ts and history.ts — consolidate to history.ts |
| **No relay/remote changes needed** | Enriched data flows through existing history → status sync pipeline |

### Files to Modify (4 files)

1. **`src/history.ts`** — Add `WaveTaskDetail` interface, enrich `WaveInfo`
2. **`src/orchestrator.ts`** — Populate enriched WaveInfo at wave completion, remove duplicate interface
3. **`src/dashboard.ts`** — Add `/api/history/:id/waves` convenience endpoint
4. **`src/index.ts`** — Re-export `WaveTaskDetail`

### Design Document

Stored at: `.planning/designs/wave-detail-visibility.md`