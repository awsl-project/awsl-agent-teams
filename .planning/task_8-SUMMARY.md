# task_8: Security review

Assignee: reviewer
Status: done

## Result
## AWSL_RESULT

### Security Review — Complete

**6 findings identified, 3 fixed:**

| # | Severity | Issue | Location | Status |
|---|----------|-------|----------|--------|
| 1 | **CRITICAL** | Path traversal in `deleteAgent()` — no name validation before `path.join` | `src/agents.ts:249` | **FIXED** — Added `AGENT_NAME_RE` + length check |
| 2 | **MAJOR** | Dashboard `DELETE /api/agents` uses raw query param in `path.join` | `src/dashboard.ts:628` | **FIXED** — Added regex validation before path ops |
| 3 | **MAJOR** | Remote `agents:delete` passes unvalidated payload to `deleteAgent` | `src/remote.ts:246` | **FIXED** (by fix #1 — `deleteAgent` now validates) |
| 4 | **MINOR** | Remote `agents:preview` no type check on `payload.name` | `src/remote.ts:258` | **FIXED** — Added string type guard |
| 5 | **MINOR** | Predictable temp file path in CLI editor mode | `src/cli.ts:564` | Noted (low risk for single-user CLI) |
| 6 | **INFO** | `shell: true` in editor spawn | `src/cli.ts:568` | Noted (standard `$EDITOR` pattern) |

### Files Modified
- **`src/agents.ts`** — Added name validation to `deleteAgent()` (matching `saveAgent()`)
- **`src/dashboard.ts`** — Added regex validation in DELETE `/api/agents` handler
- **`src/remote.ts`** — Added type guard for `agents:preview` payload

### Verification
- `npx tsc --noEmit` — clean
- `npm run build` — clean

### Quality Gate
- No remaining critical findings
- No remaining major findings
- **PASS**