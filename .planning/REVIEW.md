## AWSL_RESULT

### Guardian Two-Stage Verification Report

---

## Stage 1: Spec Compliance

### [task_1] Aggregate all-machines stats in render()

**1. [FAIL] Spec: Deduplication not implemented**
- **Severity:** critical
- **Location:** `public/dashboard.html:1343-1354`
- **Description:** The architect's design (`.planning/design-stats-machines.md:48-66`) explicitly specifies deduplication using `id + startedAt` composite key to prevent double-counting when the dashboard machine is also a remote client. The coder's implementation uses a simple `.concat()` with no dedup logic at all.
- **Spec reference:** Design doc line 73-76: "Use `id + startedAt` as composite key. This handles the edge case where the dashboard machine also connects as a remote client."
- **Suggestion:** Replace `.concat(cs.history)` with the `seen{}` hash-based dedup from the design doc.

**2. [FAIL] Spec: Queue should NOT be aggregated**
- **Severity:** critical
- **Location:** `public/dashboard.html:1346,1350,1353`
- **Description:** The architect's design explicitly states: "Queue is action-oriented. When no machine is selected, show local queue." (design doc lines 79-81, 95). The implementation aggregates queue tasks from all machines (`allQt.concat(cs.queue)`), directly contradicting the spec.
- **Spec reference:** Design doc line 80: "**No change**. Queue is action-oriented (add/remove/start tasks). When no machine is selected, show local queue."
- **Suggestion:** Remove lines 1346, 1350, 1353 — leave `qt` as the local queue only in the aggregated view.

**3. [PASS] Spec: Stats cards show aggregated data when no client selected**
- Done criteria met for history entries — the `else if` branch correctly aggregates `hist.entries` + all remote `status.history`.

**4. [PASS] Spec: Selected client shows only that client's data**
- The `if (selectedClient)` branch at line 1339 is unchanged and correct.

### [task_2] Review the render() function change

**5. [PASS] Spec: All issues flagged**
- The reviewer correctly identified both the duplicate entries problem (#1) and the queue action mismatch (#4). Done criteria met: "all issues flagged for fix."

---

## Stage 2: Code Quality

**6. [WARN] Duplicate entries cause incorrect stats — confirmed by reviewer finding #1**
- **Severity:** major
- **Location:** `public/dashboard.html:1345-1349`
- **Description:** When the dashboard host also registers as a remote client, all its history entries are counted twice. Stats (Done, Failed, Total Time, Cost) will be inflated by 2x for that machine's contributions.

**7. [WARN] Queue actions operate on wrong target — confirmed by reviewer finding #4**
- **Severity:** major
- **Location:** `public/dashboard.html:1295-1331` + `1595-1636`
- **Description:** In the aggregated view, `removeTask()`, `clearQueue()`, and `startQueue()` all operate on local queue only, while the rendered table shows tasks from all machines. The delete button could fail silently for remote tasks or accidentally delete a local task with the same ID.

**8. [PASS] Null safety**
- `clients[i].status` guard with `cs && cs.history` / `cs && cs.queue` is correct.

**9. [PASS] Array immutability**
- `.slice()` copies + `.concat()` returns new arrays. Original `hist.entries` not mutated.

**10. [PASS] No security issues**
- No XSS (`esc()` used on all user-facing strings), no injection vectors, no secrets in code, no auth bypass.

**11. [WARN] Tests are source-pattern-based only**
- **Severity:** minor
- **Location:** `test/aggregate-stats.test.ts`
- **Description:** Tests verify code patterns (regex matching on source text) rather than runtime behavior. They confirm the code structure exists but cannot catch logic bugs like missing dedup or incorrect queue aggregation.

---

## Quality Gate

| # | Finding | Severity | Verdict |
|---|---------|----------|---------|
| 1 | Dedup not implemented (spec violation) | **critical** | FAIL |
| 2 | Queue aggregated against spec | **critical** | FAIL |
| 3 | Stats aggregation logic present | — | PASS |
| 4 | Selected client logic preserved | — | PASS |
| 5 | Reviewer flagged all issues | — | PASS |
| 6 | Duplicate entries inflate stats | major | WARN |
| 7 | Queue actions target wrong machine | major | WARN |
| 8 | Null safety | — | PASS |
| 9 | Array immutability | — | PASS |
| 10 | Security (XSS/injection/auth) | — | PASS |
| 11 | Tests are pattern-based only | minor | WARN |

### Verdict: **FAIL** — 2 critical findings must be fixed

**Required fixes before passing:**
1. **Add dedup logic** using `id + startedAt` composite key as specified in the design doc
2. **Remove queue aggregation** — leave `qt` as local-only when no client is selected (per design spec)