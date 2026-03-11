Now I have all the information needed. Here is the full Guardian Two-Stage Review:

---

## AWSL_RESULT

### Guardian Two-Stage Verification Report

---

## Stage 1: Spec Compliance

| Task | Verdict | Details |
|------|---------|--------|
| task_1 | **[PASS]** | `serializeAgent`, `saveAgent`, `deleteAgent`, `getAgent` all exported from `src/agents.ts` and re-exported from `src/index.ts`. `npx tsc --noEmit` passes. |
| task_2 | **[PASS]** | GET/POST/PUT/DELETE `/api/agents` endpoints exist in `src/dashboard.ts:502-614`. Type-check passes. |
| task_3 | **[PASS]** | `show`, `create`, `edit`, `delete`, `reset` subcommands implemented in `src/cli.ts:400-508`. All documented in `usage()`. Type-check passes. |
| task_4 | **[PASS]** | Agent Roles card added to `public/dashboard.html` with editor modal and CRUD operations via API. Type-check passes. |
| task_5 | **[PASS]** | `agents:list`, `agents:get`, `agents:save`, `agents:delete` commands handled in `src/remote.ts:226-249`. Type-check passes. |
| task_6 | **[PASS]** | 25 tests across 6 suites — all passing. Covers serialization, save, delete, get, name validation, builtins. |
| task_7 | **[PASS]** | README.md, README.zh-CN.md, BEST_PRACTICES.md all updated per task result. |
| task_8 | **[PASS]** | Review completed, critical findings identified and documented. (Review task — findings below.) |

---

## Stage 2: Code Quality

### 1. [CRITICAL] Path Traversal in `deleteAgent()` — No Name Validation
- **Severity:** Critical
- **Location:** `src/agents.ts:249-254`
- **Description:** `deleteAgent(dir, name)` constructs `path.join(dir, \`${name}.md\`)` but does **not** validate `name` against `AGENT_NAME_RE`. A name like `../../important-file` would resolve outside the agents directory. Unlike `saveAgent()` (line 214) which validates, `deleteAgent()` has no guard.
- **Affected callers:**
  - `src/dashboard.ts:610` — DELETE `/api/agents?name=...` (network-exposed)
  - `src/remote.ts:247` — `agents:delete` relay command (network-exposed)
  - `src/cli.ts:468` — `awsl agents delete <name>` (local)
- **Suggestion:** Add `AGENT_NAME_RE` validation to `deleteAgent()`:
  ```typescript
  export function deleteAgent(dir: string, name: string): boolean {
      if (!name || !AGENT_NAME_RE.test(name) || name.length > AGENT_NAME_MAX) {
          throw new Error(`Invalid agent name "${name}"`);
      }
      const filePath = path.join(dir, `${name}.md`);
      if (!fs.existsSync(filePath)) return false;
      fs.unlinkSync(filePath);
      return true;
  }
  ```

### 2. [MAJOR] Dashboard DELETE `/api/agents` — Unsanitized Path Construction Before `deleteAgent`
- **Severity:** Major
- **Location:** `src/dashboard.ts:599`
- **Description:** Even before calling `deleteAgent()`, the endpoint constructs `path.join(agentsDir, \`${name}.md\`)` for the `customExists` check using the raw query parameter — same traversal vector.
- **Suggestion:** Add name regex validation early in the DELETE handler, returning 400 on mismatch.

### 3. [MAJOR] Remote `agents:delete` — No Input Validation
- **Severity:** Major
- **Location:** `src/remote.ts:245-249`
- **Description:** `(payload as any).name` goes directly to `deleteAgent()` with zero validation. This is network-exposed via WebSocket relay.
- **Suggestion:** Validate `payload.name` against the name regex before calling `deleteAgent()`.

### 4. [WARN] `getAgent` in CLI/Dashboard Accepts Arbitrary `name` for Lookup
- **Severity:** Minor
- **Location:** `src/agents.ts:257-259`, `src/cli.ts:408-409`, `src/dashboard.ts:508`
- **Description:** `getAgent()` passes unvalidated names to `loadAgents().find()`. Not exploitable (no path construction from `name`), but inconsistent with `saveAgent`'s validation.
- **Suggestion:** No action needed — informational only.

### 5. [PASS] Input Validation on Create/Save Paths
- POST `/api/agents` validates name regex at `dashboard.ts:538-543` + `saveAgent()` double-validates.
- PUT `/api/agents` relies on `saveAgent()` internal validation — sufficient.
- `agents:save` remote command relies on `saveAgent()` — sufficient.

### 6. [PASS] Type-Check & Tests
- `npx tsc --noEmit` — clean
- `npx tsx tests/agents.test.ts` — 25/25 pass, 0 fail

### 7. [PASS] Exports & API Surface
- All 4 new functions + `BUILTINS` re-exported from `src/index.ts:7`

### 8. [PASS] Atomic Write Safety
- `saveAgent()` uses `.tmp` → `rename` pattern for crash safety

---

## Quality Gate

| Level | Count | Verdict |
|-------|-------|---------|
| Critical | 1 | **FAIL** — Path traversal in `deleteAgent()` must be fixed |
| Major | 2 | **WARN** — Dashboard & remote callers should validate before calling |
| Minor | 1 | Noted |
| Pass | 4 | Clean |

**Overall: FAIL** — The critical path traversal in `deleteAgent()` (`src/agents.ts:249`) must be fixed before this feature can ship. The fix is a 3-line addition (same pattern as `saveAgent` line 214).