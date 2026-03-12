# Design: Wave Detail Visibility in Remote Dashboard

## Problem

Remote dashboard shows history entries but wave data is skeletal — only `{ wave, taskIds, agents, parallel }`. Users cannot see what each wave actually accomplished: task descriptions, outcomes, files touched, errors encountered.

## Decision: Enrich WaveInfo (Approach A)

**Why this approach:**
- User's ask is post-hoc ("看不到每个wave具体解决了啥") — they want to see what was solved, not live progress
- Simplest solution: enrich existing data structure, flows through existing pipeline
- Backward compatible: all new fields are optional/additive
- No new protocol or message types needed

**Rejected alternatives:**
- Live relay events: Over-engineered for the ask; can add later if needed
- File sync (WAVES.md): Unstructured, not queryable
- Hybrid: Too much scope for the core problem

---

## Changes

### 1. Enrich `WaveInfo` interface

**File:** `src/history.ts` (canonical location — remove duplicate from `orchestrator.ts`)

```typescript
export interface WaveTaskDetail {
  id: string;
  description: string;
  assignee: string;
  status: "done" | "failed" | "verified";
  files?: string[];
  /** One-line result summary (truncated to 200 chars) */
  result?: string;
  /** Error message if failed */
  error?: string;
}

export interface WaveInfo {
  wave: number;
  taskIds: string[];       // keep for backward compat
  agents: string[];
  parallel: number;
  /** Enriched per-task details — new field */
  tasks?: WaveTaskDetail[];
  /** Wave-level status: all done, some failed, etc. */
  status?: "success" | "partial" | "failed";
}
```

**Key decisions:**
- `tasks` is optional → old data still valid
- `result` truncated to 200 chars → prevent payload bloat
- `status` is wave-level summary: `success` (all done/verified), `partial` (mixed), `failed` (all failed)
- Keep `taskIds` for backward compat, `tasks` is the rich version

### 2. Populate enriched data in orchestrator

**File:** `src/orchestrator.ts` — modify the `waveInfos.push()` block (~line 787)

```typescript
// After wave execution, at line 787:
const waveTaskDetails: WaveTaskDetail[] = wave.map(t => ({
  id: t.id,
  description: t.description,
  assignee: t.assignee,
  status: t.status as "done" | "failed" | "verified",
  files: t.files,
  result: t.result ? t.result.slice(0, 200) : undefined,
  error: t.error ? t.error.slice(0, 200) : undefined,
}));

const allDone = wave.every(t => t.status === "done" || t.status === "verified");
const allFailed = wave.every(t => t.status === "failed");
const waveStatus = allDone ? "success" : allFailed ? "failed" : "partial";

waveInfos.push({
  wave: wi + 1,
  taskIds: wave.map(t => t.id),
  agents: waveAgents,
  parallel: wave.length,
  tasks: waveTaskDetails,
  status: waveStatus,
});
```

### 3. Remove WaveInfo duplication

**Current state:** `WaveInfo` is defined in both `src/orchestrator.ts:74` and `src/history.ts:14`.

**Action:** Remove from `orchestrator.ts`, import from `history.ts`. Also export `WaveTaskDetail` from `history.ts` and re-export from `index.ts`.

### 4. Expose wave details via API

**File:** `src/dashboard.ts` — add endpoint

```typescript
// GET /api/history/:id/waves — detailed wave breakdown for a run
if (url.pathname.startsWith("/api/history/") && url.pathname.endsWith("/waves")) {
  const entryId = url.pathname.split("/")[3]; // e.g. "h_5"
  const data = loadHistory(cwd);
  const entry = data.entries.find(e => e.id === entryId);
  if (!entry) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  } else {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: entry.id, goal: entry.goal, waves: entry.waves ?? [] }));
  }
  return;
}
```

**Note:** The existing `/api/history` endpoint already returns full entries including `waves`, so remote clients already get the enriched data automatically. This new endpoint is a convenience for wave-focused views.

### 5. Update remote status sync

**File:** `src/remote.ts` — no changes needed for post-hoc visibility. The enriched `waves` field flows through:
1. Orchestrator → TeamResult.waves
2. Queue → appendHistory() with waves
3. Remote status sync → history entries (already synced)

The existing delta sync already handles history append correctly.

---

## Data Flow

```
Orchestrator (wave execution)
  → waveInfos[] with WaveTaskDetail[]
    → TeamResult.waves
      → queue.ts appendHistory()
        → HISTORY.json
          → /api/history (dashboard)
            → Remote client delta sync (history entries)
```

No new sync paths needed — enriched data rides existing pipeline.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/history.ts` | Add `WaveTaskDetail` interface, enrich `WaveInfo` |
| `src/orchestrator.ts` | Populate enriched WaveInfo, remove duplicate interface, import from history |
| `src/dashboard.ts` | Add `/api/history/:id/waves` endpoint |
| `src/index.ts` | Re-export `WaveTaskDetail` |

## Files NOT modified (no changes needed)

- `src/relay.ts` — data flows through existing status sync
- `src/remote.ts` — enriched history already synced
- `src/queue.ts` — already passes `teamResult.waves` to history

---

## Edge Cases

1. **Old history entries without `tasks` field** — `tasks` is optional, UI renders "no details" gracefully
2. **Large result strings** — truncated to 200 chars in WaveTaskDetail
3. **Rate-limited/retried waves** — wave index may rewind (line 778), but waveInfos only pushes on completion, so no duplicates
4. **Empty waves** — topologicalSort shouldn't produce these, but handle defensively

## Testing

- Unit test: verify enriched WaveInfo is produced by orchestrator
- Unit test: verify `/api/history/:id/waves` returns correct data
- Integration: run a multi-wave plan, check HISTORY.json contains task details per wave
