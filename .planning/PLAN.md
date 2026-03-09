# Execution Plan

## task_1: Add read tool path validation
- **Assignee:** coder
- **Files:** src/sandbox.ts, src/tools.ts

### Action
1. In src/sandbox.ts, add a `checkReadPath()` function that validates a resolved file path is within `policy.writePaths` (reuse the same logic as `checkWritePath` but with a 'read blocked' message). Export it.
2. In src/tools.ts, update `createReadTool(cwd: string)` to accept an optional `sandbox?: SandboxPolicy` parameter. Inside `execute()`, after resolving `filePath`, call `checkReadPath(filePath, sandbox)` if sandbox is defined. If blocked, return the error message.
3. Import `checkReadPath` from `./sandbox.js` at the top of tools.ts.
4. In the `TOOL_FACTORIES` map (line 228), change the `read` factory from `(ctx) => createReadTool(ctx.cwd)` to `(ctx) => createReadTool(ctx.cwd, ctx.sandbox)` so sandbox is wired through.

### Verify
npx tsc --noEmit

### Done
createReadTool accepts sandbox policy, checkReadPath exists in sandbox.ts, TOOL_FACTORIES passes sandbox to read tool, tsc passes

## task_2: Dashboard: localhost bind + CORS + body limit
- **Assignee:** coder
- **Files:** src/dashboard.ts

### Action
Three changes in src/dashboard.ts:

1. **Bind to 127.0.0.1**: Change `server.listen(port, () => {` (line 217) to `server.listen(port, '127.0.0.1', () => {` so it only binds to localhost.

2. **Restrict CORS**: Change `res.setHeader('Access-Control-Allow-Origin', '*')` (line 45) to `res.setHeader('Access-Control-Allow-Origin', 'http://localhost:' + port)`. This restricts CORS to only the dashboard's own origin.

3. **Add body size limit**: Create a helper function at the top of the file:
```typescript
const MAX_BODY = 1024 * 1024 // 1MB
function collectBody(req: http.IncomingMessage, res: http.ServerResponse, cb: (body: string) => void) {
    let body = ''
    let size = 0
    req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY) {
            res.writeHead(413, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Request body too large' }))
            req.destroy()
            return
        }
        body += chunk.toString()
    })
    req.on('end', () => { if (!req.destroyed) cb(body) })
}
```
Then replace all three occurrences of the manual `req.on('data')` + `req.on('end')` pattern (in /api/queue/add, /api/queue/set-time) with calls to `collectBody(req, res, (body) => { ... })`.

### Verify
npx tsc --noEmit

### Done
Dashboard binds to 127.0.0.1, CORS restricted to localhost, all POST body reads use collectBody with 1MB limit, tsc passes

## task_3: Fix shell injection in git commands
- **Assignee:** coder
- **Files:** src/planning.ts

### Action
In src/planning.ts around lines 372-384:
1. Change `import { execSync } from 'node:child_process'` to also import `execFileSync`: `import { execSync, execFileSync } from 'node:child_process'`
2. Replace line 373: `execSync(\`git add -- ${JSON.stringify(f)}\`, { cwd, stdio: 'pipe' })` with `execFileSync('git', ['add', '--', f], { cwd, stdio: 'pipe' })`
3. Replace line 381: `execSync(\`git commit -m ${JSON.stringify(commitMsg)}\`, { cwd, stdio: 'pipe' })` with `execFileSync('git', ['commit', '-m', commitMsg], { cwd, stdio: 'pipe' })`

This eliminates shell interpolation entirely. execFileSync bypasses the shell, so no injection is possible regardless of filename or commit message content.

### Verify
npx tsc --noEmit

### Done
Both git add and git commit use execFileSync with array args instead of execSync with string interpolation, tsc passes

## task_4: Expand coder bash denylist
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/sandbox.ts

### Action
In src/sandbox.ts, expand the `CODER_DENY_PATTERNS` array (lines 32-40) to add these additional patterns that block common sandbox escape vectors:

```typescript
const CODER_DENY_PATTERNS = [
    // Existing
    'rm -rf /',
    'sudo ',
    'mkfs',
    'dd if=',
    ':(){ :|:& };:',
    'chmod 777',
    '> /dev/sd',
    // New: glob-based destruction
    'rm -rf /*',
    // New: download-and-execute
    '| sh', '| bash',
    'curl ', 'wget ',
    // New: interpreter escapes
    'python -c', 'python3 -c',
    'node -e', 'perl -e', 'ruby -e',
    // New: network exfiltration
    'nc ', 'ncat ',
    // New: eval / encoded execution
    'eval ', 'base64 -d',
]
```

Keep all existing patterns. Only ADD new ones. Do not change any other code in the file.

### Verify
npx tsc --noEmit

### Done
CODER_DENY_PATTERNS has 20+ patterns covering destruction, download-execute, interpreter escape, network exfil, and eval vectors, tsc passes

## task_5: Verify all fixes build correctly
- **Assignee:** tester
- **Dependencies:** task_1, task_2, task_3, task_4
- **Files:** src/tools.ts, src/dashboard.ts, src/planning.ts, src/sandbox.ts

### Action
1. Run `npx tsc --noEmit` to verify the full project type-checks.
2. Run `npm run build` to verify compilation succeeds.
3. Verify the 5 fixes are correctly applied by reading the source files:
   - src/sandbox.ts: checkReadPath function exists and is exported; CODER_DENY_PATTERNS has 20+ entries
   - src/tools.ts: createReadTool accepts sandbox param; TOOL_FACTORIES.read passes ctx.sandbox
   - src/dashboard.ts: server.listen binds to '127.0.0.1'; CORS uses localhost not '*'; collectBody helper with 1MB limit exists
   - src/planning.ts: git add and git commit use execFileSync with array args
4. Report pass/fail for each fix.

### Verify
npm run build

### Done
tsc --noEmit and npm run build both pass; all 5 security fixes verified present in source
