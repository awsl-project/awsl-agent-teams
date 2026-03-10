# task_1: Add read tool path validation

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task: Add read tool path validation

**What changed** — `src/sandbox.ts` (single file, `tools.ts` required no changes):

1. **`SandboxPolicy` interface** — Added two optional fields:
   - `readPaths?: string[]` — Separate read-allowed directories (falls back to `writePaths` if omitted, backward compatible)
   - `blockedReadPatterns?: string[]` — Sensitive file basename patterns blocked from reading

2. **`SENSITIVE_FILE_PATTERNS` constant** — 17 patterns covering `.env*`, `credentials.json`, `secrets.json`, SSH keys (`id_rsa`, `id_ed25519`, etc.), `.npmrc`, `.pypirc`, `token.json`, `service-account.json`, `.htpasswd`

3. **`checkReadPath()` updated** — Now performs two checks:
   - **Sensitive file blocking**: case-insensitive basename match against `blockedReadPatterns` (defaults to `SENSITIVE_FILE_PATTERNS`)
   - **Directory allowlist**: validates against `readPaths` (falls back to `writePaths` for backward compat)

4. **`defaultPolicy()` updated** — All roles now get explicit `readPaths`, `writePaths`, and `blockedReadPatterns`

**Backward compatibility**: Both new fields are optional with sensible defaults. Existing code that constructs `SandboxPolicy` with only `writePaths` + `bash` continues to work — `checkReadPath` falls back to `writePaths` and uses the default sensitive patterns.

**Files modified**: `src/sandbox.ts`
**Build**: `tsc --noEmit` passes clean