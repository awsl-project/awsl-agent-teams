# Execution Plan

## task_1: Add WaveTaskDetail type and enrich WaveInfo
- **Assignee:** coder
- **Files:** src/history.ts, src/orchestrator.ts, src/index.ts

### Action
1. In src/history.ts, add a new interface BEFORE WaveInfo:

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

2. In src/history.ts, add two new optional fields to the existing WaveInfo interface:
  - tasks?: WaveTaskDetail[];   (enriched per-task details)
  - status?: "success" | "partial" | "failed";  (wave-level status)

3. In src/orchestrator.ts, REMOVE the duplicate WaveInfo interface (lines 74-79). Add an import of WaveInfo from './history.js' instead. The Task interface (lines 58-72) and TeamResult (line 81+) stay in orchestrator.ts.

4. In src/index.ts line 8, remove 'type WaveInfo' from the orchestrator.ts export. Add 'type WaveTaskDetail' to the history.ts export on line 31. Make sure WaveInfo is still exported (it already is from history.ts line 31 as HistoryWaveInfo — also add a plain WaveInfo export from history.ts).

Specifically for index.ts line 8: remove ', type WaveInfo' from that export line.
For index.ts line 31: change to export { ..., type WaveInfo, type WaveTaskDetail, type WaveInfo as HistoryWaveInfo } from './history.js';

### Verify
npx tsc --noEmit

### Done
WaveTaskDetail interface exists in history.ts, WaveInfo has tasks? and status? fields, no duplicate WaveInfo in orchestrator.ts, all exports correct, tsc passes

## task_2: Populate enriched WaveInfo in orchestrator
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/orchestrator.ts

### Action
In src/orchestrator.ts, modify the waveInfos.push() block at ~line 787 (after 'Record wave execution info' comment). Replace the existing push with:

1. Import WaveTaskDetail from './history.js' (add to existing WaveInfo import).

2. Build WaveTaskDetail array from the wave tasks:
const waveTaskDetails: WaveTaskDetail[] = wave.map(t => ({
	id: t.id,
	description: t.description,
	assignee: t.assignee,
	status: t.status as "done" | "failed" | "verified",
	files: t.files,
	result: t.result ? t.result.slice(0, 200) : undefined,
	error: t.error ? t.error.slice(0, 200) : undefined,
}));

3. Compute wave-level status:
const allDone = wave.every(t => t.status === "done" || t.status === "verified");
const allFailed = wave.every(t => t.status === "failed");
const waveStatus = allDone ? "success" as const : allFailed ? "failed" as const : "partial" as const;

4. Add tasks and status to the push:
waveInfos.push({
	wave: wi + 1,
	taskIds: wave.map(t => t.id),
	agents: waveAgents,
	parallel: wave.length,
	tasks: waveTaskDetails,
	status: waveStatus,
});

### Verify
npx tsc --noEmit

### Done
waveInfos.push() includes tasks array with WaveTaskDetail[] and status field, tsc passes

## task_3: Add /api/history/:id/waves endpoint
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/dashboard.ts

### Action
In src/dashboard.ts, add a new route handler BEFORE the existing '/api/history' handler (before line 98). The new handler:

if (url.pathname.startsWith("/api/history/") && url.pathname.endsWith("/waves")) {
	const entryId = url.pathname.split("/")[3];
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

Also update the log.info line at ~line 683 that lists API endpoints to include /api/history/:id/waves.

### Verify
npx tsc --noEmit

### Done
GET /api/history/:id/waves returns wave details for a specific history entry, tsc passes

## task_4: Render wave task details in dashboard HTML
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** public/dashboard.html

### Action
1. Add CSS styles after the existing .entry-wave styles (~line 431). Add:

.wave-tasks { margin: 4px 0 4px 56px; font-size: 10px; }
.wave-task { display: flex; align-items: center; gap: 6px; padding: 1px 0; color: var(--ink3); }
.wave-task-status { font-weight: 600; min-width: 14px; text-align: center; }
.wave-task-status.done, .wave-task-status.verified { color: var(--green); }
.wave-task-status.failed { color: var(--red); }
.wave-task-desc { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wave-task-files { color: var(--ink4); font-size: 9px; }
.wave-status-badge { font-size: 9px; padding: 0 4px; border-radius: 4px; font-weight: 600; }
.wave-status-badge.success { background: var(--green); color: #fff; }
.wave-status-badge.partial { background: var(--orange, #f0a030); color: #fff; }
.wave-status-badge.failed { background: var(--red); color: #fff; }

2. Modify the renderEntryWaves() function (~line 2193) to render per-task details when available. After rendering wave label + agent badges + parallel count, if w.tasks exists and has entries, render a .wave-tasks div containing each task:
  - Status icon: checkmark for done/verified, X for failed
  - Task description (truncated to 60 chars)
  - Assignee badge
  - Files count if available (e.g. '2 files')
  - If failed and has error, show error text in red (truncated)
  - If done and has result, show result text (truncated to 80 chars)

Also add the wave-level status badge next to the wave label if w.status exists.

The expanded card should show the task details — they should be visible by default (no extra click needed) since the user wants to see what each wave solved.

### Verify
Manual: open dashboard.html in browser, verify wave tasks render correctly

### Done
Dashboard shows per-task details under each wave: status icon, description, assignee, files, result/error

## task_5: Write unit tests for enriched WaveInfo
- **Assignee:** tester
- **Dependencies:** task_2, task_3
- **Files:** src/dashboard-agents.test.ts

### Action
Add test cases (can be in a new test file or existing test file) that verify:

1. WaveTaskDetail interface shape: create a WaveTaskDetail object, verify all fields are set correctly.

2. WaveInfo enrichment: create a WaveInfo with tasks[] populated, verify tasks array contains expected WaveTaskDetail entries with correct status, description, result truncation (>200 chars gets sliced).

3. Wave status logic: test that:
   - All done/verified tasks → status 'success'
   - All failed tasks → status 'failed'
   - Mixed → status 'partial'

4. Backward compatibility: WaveInfo without tasks field (old data) should still be valid.

Use node:test and node:assert/strict. Follow existing test conventions (see src/*.test.ts files for patterns).

### Verify
npx tsx --test src/dashboard-agents.test.ts

### Done
All tests pass verifying WaveTaskDetail population, status computation, and backward compatibility

## task_6: Update documentation
- **Assignee:** coder
- **Dependencies:** task_2, task_3, task_4
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files to mention the new wave detail visibility feature:

1. README.md — In the Dashboard section, mention that wave details now show per-task breakdown (description, status, files, result/error). Mention the new /api/history/:id/waves endpoint.

2. README.zh-CN.md — Mirror the same changes in Chinese.

3. BEST_PRACTICES.md — Add a note about how enriched wave data helps with debugging failed runs (you can see exactly which task in which wave failed and why).

Keep additions concise — 2-3 sentences each.

### Verify
Manual: review docs for accuracy

### Done
All three docs updated with wave detail visibility feature description

## task_7: Security and quality review
- **Assignee:** reviewer
- **Dependencies:** task_1, task_2, task_3, task_4
- **Files:** src/history.ts, src/orchestrator.ts, src/dashboard.ts, public/dashboard.html

### Action
Review all changed files for:
1. XSS in dashboard.html — ensure all user-provided strings (task descriptions, results, errors) are escaped with esc() before rendering
2. Path traversal in /api/history/:id/waves — ensure entryId is safely used (it's only used as array.find match, should be safe)
3. Payload size — verify result/error truncation to 200 chars is enforced
4. Backward compatibility — old WaveInfo without tasks field should not break anything
5. Type safety — no unsafe casts, proper optional chaining

### Verify
npx tsc --noEmit

### Done
All changes pass security review, no XSS/injection risks, proper escaping in HTML, types are sound
