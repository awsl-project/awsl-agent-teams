# task_4: Review implementation

Assignee: reviewer
Status: done

## Result


## AWSL_RESULT

### Security-Focused Code Review: Dashboard Projects Management

---

## Stage 1: Spec Compliance

- [PASS] **Projects card UI** matches Machines pattern (card bar, select → action bar → queue panel)
- [PASS] **CRUD operations**: Add, Remove, Scan all implemented with dialogs
- [PASS] **Queue management**: Add task, start queue, clear queue for selected project
- [PASS] **Context switching**: Project > Machine > Local priority correctly implemented
- [PASS] **Backend API routes**: All 10 project endpoints wired in `dashboard.ts`
- [PASS] **ProjectManager**: Registry CRUD, status, scan all functional with atomic save

---

## Stage 2: Security & Code Quality

### Findings

**1. [WARN] XSS via single-quote breakout in inline onclick handlers**
- Severity: **major**
- Location: `dashboard.html:1149`, `1704`, `1708`
- Description: `esc()` escapes HTML entities (`<>&"`) but NOT single quotes. Inline `onclick` handlers use single-quoted strings: `onclick="selectClient('${esc(c.id)}')"`. A client ID containing `');alert(1);//` could break out.
- Affected values: `c.id` (remote client-controlled), `t.id` (internally generated UUID — low risk), `t.runAt` (user-controlled timestamp — low risk)
- Risk: Low in practice (localhost-only, client IDs are set by trusted remote agents), but the pattern is unsafe.
- Suggestion: Replace inline onclick with event delegation (like `projectsList.onclick` at line 1778), or add single-quote escaping: `function escAttr(s) { return esc(s).replace(/'/g, '&#39;'); }`

**2. [WARN] No CSRF protection on mutation endpoints**
- Severity: **minor**
- Location: `dashboard.ts:125-444` (all POST/DELETE handlers)
- Description: No CSRF tokens. CORS restricts to `localhost` origins (line 66), which provides baseline protection. A malicious page on a non-localhost origin cannot make credentialed requests.
- Risk: Low — server binds to `127.0.0.1` and CORS validation is correct.
- Suggestion: Acceptable for localhost dashboard. Document this as a known limitation if the server is ever exposed beyond localhost.

**3. [WARN] Unbounded scan depth**
- Severity: **minor**
- Location: `projects.ts:295`, `dashboard.ts:320`
- Description: The `/api/projects/scan` endpoint passes `depth` directly to `ProjectManager.scan()` with no upper bound. A request with `depth: 100` could cause excessive filesystem traversal.
- Suggestion: Cap depth to a reasonable maximum (e.g., `Math.min(depth, 10)`) in the API handler.

**4. [PASS] Command injection protection**
- Location: `dashboard.ts:404`
- `child_process.spawn()` is used WITHOUT `shell: true`, so arguments are passed as an array — no shell injection possible. Path validation (`isAbsolute`) is present.

**5. [PASS] Path traversal mitigation**
- Location: `dashboard.ts:265-268`, `338-341`, `364-367`, etc.
- All project path parameters validate `path.isAbsolute()`. File reads are constrained to `.planning/QUEUE.json` under the given path. Acceptable for localhost.

**6. [PASS] Request body size limit**
- Location: `dashboard.ts:23-38`
- `collectBody()` enforces a 1MB limit with proper `413` response and `req.destroy()`.

**7. [PASS] HTML escaping**
- Location: `dashboard.html:1037`
- `esc()` function uses the standard `textContent → innerHTML` pattern. All user-controlled values in `renderProjectCards()`, `renderQueue()`, etc. pass through `esc()`.

**8. [PASS] CORS configuration**
- Location: `dashboard.ts:65-71`
- Origin regex `/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/` correctly restricts to localhost. No wildcard `*`.

**9. [PASS] Atomic file writes**
- Location: `projects.ts:93-110`
- `save()` uses write-to-temp + rename pattern. Temp file includes `process.pid` for uniqueness. Cleanup on failure.

**10. [PASS] No secrets in code**
- No credentials, API keys, or tokens found in any reviewed file.

**11. [PASS] Input validation at boundaries**
- All POST endpoints validate required fields, types, and path formats before processing.

**12. [PASS] Error handling**
- Errors return structured JSON with appropriate HTTP status codes. No stack traces or internal paths leaked in error responses.

---

## Quality Gate

| Category | Result |
|----------|--------|
| Critical findings | **0** |
| Major findings | **1** (single-quote XSS pattern) |
| Minor findings | **2** (no CSRF, unbounded scan depth) |

**Verdict: WARN** — No critical blockers. One major finding (inline onclick XSS pattern) should be addressed but is low-risk given localhost-only deployment. The implementation is solid, well-structured, and follows existing codebase conventions.