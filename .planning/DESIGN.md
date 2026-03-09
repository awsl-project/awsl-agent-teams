## AWSL_RESULT

### Security Audit Design Document

**File produced**: `.planning/SECURITY_AUDIT.md`

**5 verified security issues found, prioritized by impact:**

| # | Severity | File | Issue |
|---|----------|------|-------|
| FIX 1 | **HIGH** | `src/tools.ts` | Read tool has zero path validation — complete sandbox bypass |
| FIX 2 | **HIGH** | `src/dashboard.ts` | Dashboard binds to 0.0.0.0 with `CORS: *` — network-accessible mutation APIs |
| FIX 3 | **MEDIUM** | `src/dashboard.ts` | No HTTP body size limit — memory exhaustion DoS |
| FIX 4 | **MEDIUM** | `src/sandbox.ts` | Coder denylist only has 7 patterns — trivially bypassed |
| FIX 5 | **MEDIUM** | `src/planning.ts` | `execSync` with string interpolation for git commands — shell injection |

**Key decisions:**
1. Read tool reuses `writePaths` for validation (no new config surface)
2. Dashboard defaults to `127.0.0.1` (localhost only)
3. Keep denylist for coder role but expand patterns significantly
4. Switch git commands from `execSync` to `execFileSync` (array args, no shell)
5. 1MB body size cap on dashboard API

**Non-issues confirmed safe:** prototype pollution (Map-based), lock TOCTOU (wx flag), regex DoS (lazy quantifiers), Windows process check.