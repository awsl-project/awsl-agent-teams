# task_8: Review all new code for security issues:

1. **Path traversa

Assignee: reviewer
Status: done

## Result
Type-check passes. Here is my full security review:

## AWSL_RESULT

### Security Review: Agent CRUD Feature

---

### 1. [CRITICAL] Path Traversal in `deleteAgent()` — No Name Validation
- **Severity:** Critical
- **Location:** `src/agents.ts:249-254`
- **Description:** `deleteAgent(dir, name)` constructs a file path via `path.join(dir, \`${name}.md\`)` but does **not** validate `name` against the `AGENT_NAME_RE` regex. A malicious name like `../../config` would resolve to `{dir}/../../config.md`, allowing deletion of arbitrary `.md` files outside the agents directory.
- **Contrast:** `saveAgent()` (line 214) correctly validates `AGENT_NAME_RE.test(name)` before any file operations.
- **Fix:** Add the same name validation at the top of `deleteAgent()`:
  ```typescript
  if (!AGENT_NAME_RE.test(name) || name.length > AGENT_NAME_MAX) {
      throw new Error(`Invalid agent name "${name}"`);
  }
  ```

### 2. [CRITICAL] Path Traversal in Dashboard DELETE `/api/agents`
- **Severity:** Critical
- **Location:** `src/dashboard.ts:590-613`
- **Description:** The `name` query parameter from `url.searchParams.get("name")` is used directly in `path.join(agentsDir, \`${name}.md\`)` (line 599) and passed to `deleteAgent()` without regex validation. An attacker can send `DELETE /api/agents?name=../../somefile` to delete arbitrary `.md` files.
- **Note:** The `BUILTINS.some()` check on line 598 only compares against known builtin names — it does not prevent traversal.
- **Fix:** Add name regex validation before any file path construction:
  ```typescript
  const nameRe = /^[a-z][a-z0-9-]*$/;
  if (!nameRe.test(name) || name.length > 50) {
      res.writeHead(400, ...); return;
  }
  ```

### 3. [MAJOR] Path Traversal in Remote `agents:delete`
- **Severity:** Major
- **Location:** `src/remote.ts:245-249`
- **Description:** The `payload.name` from WebSocket messages is passed directly to `deleteAgent()` without validation. A compromised or malicious relay server could trigger arbitrary `.md` file deletion on the client machine.
- **Fix:** Validate `payload.name` against the name regex before calling `deleteAgent()`.

### 4. [MAJOR] Path Traversal in CLI `agents delete` and `agents reset`
- **Severity:** Major (mitigated by local-only access)
- **Location:** `src/cli.ts:457-468` (delete), `src/cli.ts:473-488` (reset)
- **Description:** User-supplied `args[2]` is used in `path.join(agentsDir, \`${name}.md\`)` without regex validation. While CLI is local-only (lower attack surface), defense-in-depth requires validation.
- **Fix:** Validate name against `AGENT_NAME_RE` before any file operations.

### 5. [PASS] Input Validation — POST/PUT `/api/agents`
- **Location:** `src/dashboard.ts:524-587`
- **Description:** POST validates name regex (line 538-543) and requires non-empty `systemPrompt`. PUT delegates to `saveAgent()` which validates internally. Both use `collectBody()` with 1MB limit.

### 6. [PASS] XSS — Dashboard HTML Escaping
- **Location:** `public/dashboard.html:1120`
- **Description:** The `esc()` function uses the safe `textContent → innerHTML` pattern. All agent names rendered in badges go through `esc()` (lines 1537, 1649, 1666). No `innerHTML` with unsanitized user input found.

### 7. [PASS] Atomic Writes in `saveAgent()`
- **Location:** `src/agents.ts:242-243`
- **Description:** Uses `.tmp` file + `fs.renameSync()` pattern correctly. This prevents partial writes on crash.

### 8. [PASS] Authorization — Builtin Protection on DELETE
- **Location:** `src/dashboard.ts:598-604`
- **Description:** Correctly checks `BUILTINS.some()` && `!customExists` to prevent deleting builtin-only agents. Logic is sound (though bypassed by path traversal in finding #2).

### 9. [PASS] Body Size Limit
- **Description:** All POST/PUT agent endpoints use `collectBody()` which enforces the 1MB `MAX_BODY` limit. GET/DELETE use query params (inherently bounded by URL length limits).

### 10. [WARN] TOCTOU Race in `saveAgent()`
- **Severity:** Minor
- **Location:** `src/agents.ts:225-243`
- **Description:** Between the `fs.existsSync()` check and `fs.renameSync()`, the file could change if another process writes concurrently. The atomic rename mitigates data corruption but concurrent saves could still lose data. Acceptable for a single-user tool.

---

### Quality Gate: **FAIL**

**2 critical findings** must be fixed before merge:
1. `deleteAgent()` needs name validation (root cause — fixes dashboard, remote, and CLI issues simultaneously)
2. Dashboard DELETE endpoint needs its own validation as defense-in-depth

**Recommended fix:** Add `AGENT_NAME_RE` validation to `deleteAgent()` in `src/agents.ts`, and add name regex check in the dashboard DELETE handler before `fs.existsSync`.