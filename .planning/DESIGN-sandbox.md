# Design: Builtin Engine Sandbox

## Goal

Add minimum-viable sandboxing to the builtin engine:
1. **Write path restriction** — write/edit tools can only modify files within the project directory
2. **Bash command control** — per-role allowlist/denylist for shell commands

## Key Decisions & Rationale

### Decision 1: SandboxPolicy interface (not hardcoded guards)

**Why:** A typed interface is only ~10 more lines than inline checks, but enables:
- Per-agent override via agent definition
- Explicit documentation of what's allowed
- Future extensibility (network, process limits, etc.)

**Trade-off:** Slightly more code vs. much better maintainability.

### Decision 2: Role-based defaults, not phase-based

**Why:** Roles map cleanly to permission levels:
- `tester` → needs `npm test`, read-only filesystem exploration
- `reviewer` → read-only commands only
- `coder` → broad access, minus obviously dangerous commands
- `architect`/`planner` → read-only commands

Phases would require threading phase info through the tool chain (currently not available in ToolContext). Roles are already on every agent definition.

**Trade-off:** Less granular than phase-based, but simpler and covers the real threat model.

### Decision 3: Bash uses full-string pattern matching (not AST parsing)

**Why:** Shell command parsing is a rabbit hole. For "minimum viable":
- Allowlist mode: command must START with an allowed prefix
- Denylist mode: command must NOT CONTAIN any denied pattern
- Handles `&&`, `|`, `;` chaining in denylist mode by scanning full string

**Trade-off:** Not foolproof (determined agent could bypass), but prevents accidental damage and obvious mistakes. Good enough for v1.

### Decision 4: Sandbox is opt-out, not opt-in

**Why:** Security should be on by default. Existing users get protection automatically.
- `ExecuteOptions.sandbox` defaults to `true` (use role defaults)
- Set to `false` to disable entirely
- Set to a `SandboxPolicy` object for custom rules

---

## Interface Design

### New file: `src/sandbox.ts`

```typescript
/**
 * Sandbox policy for builtin engine tools.
 */
export interface SandboxPolicy {
  /**
   * Directories where write/edit are allowed (absolute paths).
   * Default: [cwd] — project directory only.
   */
  writePaths: string[];

  /**
   * Bash command restrictions.
   */
  bash: BashPolicy;
}

export interface BashPolicy {
  /**
   * - "allowlist": only commands matching a prefix in `patterns` are allowed
   * - "denylist": commands matching any pattern in `patterns` are blocked
   * - "unrestricted": no filtering
   */
  mode: "allowlist" | "denylist" | "unrestricted";

  /**
   * String patterns to match against the command.
   * - allowlist mode: command must start with one of these
   * - denylist mode: command must not contain any of these
   */
  patterns: string[];
}

/**
 * Returns the default sandbox policy for a given agent role.
 */
export function defaultPolicy(role: string, cwd: string): SandboxPolicy;

/**
 * Validate a file path against the sandbox write policy.
 * Returns null if allowed, or an error message if blocked.
 */
export function checkWritePath(resolvedPath: string, policy: SandboxPolicy): string | null;

/**
 * Validate a bash command against the sandbox bash policy.
 * Returns null if allowed, or an error message if blocked.
 */
export function checkBashCommand(command: string, policy: SandboxPolicy): string | null;
```

### Default policies by role

| Role | writePaths | Bash mode | Bash patterns |
|------|-----------|-----------|---------------|
| `coder` | `[cwd]` | denylist | `rm -rf /`, `sudo `, `mkfs`, `dd if=`, `:(){ :\|:& };:`, `chmod 777`, `> /dev/sd` |
| `tester` | `[cwd]` | allowlist | `npm test`, `npm run test`, `npx tsc`, `npx vitest`, `npx jest`, `node `, `cat `, `ls`, `head `, `tail `, `grep `, `find `, `wc ` |
| `reviewer` | `[cwd]` | allowlist | `cat `, `ls`, `head `, `tail `, `grep `, `find `, `wc `, `git log`, `git diff`, `git show` |
| `architect` | `[cwd]` | allowlist | `cat `, `ls`, `head `, `tail `, `grep `, `find `, `wc `, `tree ` |
| `planner` | `[cwd]` | allowlist | `cat `, `ls`, `find `, `wc ` |
| (other) | `[cwd]` | denylist | (same as coder) |

### Path validation logic

```typescript
function checkWritePath(resolvedPath: string, policy: SandboxPolicy): string | null {
  const normalized = path.resolve(resolvedPath);
  for (const dir of policy.writePaths) {
    const normalizedDir = path.resolve(dir);
    // Case-insensitive on Windows
    const a = process.platform === "win32" ? normalized.toLowerCase() : normalized;
    const b = process.platform === "win32" ? normalizedDir.toLowerCase() : normalizedDir;
    if (a === b || a.startsWith(b + path.sep)) {
      return null; // allowed
    }
  }
  return `Sandbox: write blocked — path "${resolvedPath}" is outside allowed directories`;
}
```

### Bash validation logic

```typescript
function checkBashCommand(command: string, policy: SandboxPolicy): string | null {
  const { mode, patterns } = policy.bash;
  if (mode === "unrestricted") return null;

  const trimmed = command.trim();

  if (mode === "allowlist") {
    const allowed = patterns.some(p => trimmed.startsWith(p));
    if (!allowed) {
      return `Sandbox: bash blocked — command not in allowlist. Allowed prefixes: ${patterns.join(", ")}`;
    }
    return null;
  }

  if (mode === "denylist") {
    // Check full command string (catches chained commands)
    const blocked = patterns.find(p => trimmed.includes(p));
    if (blocked) {
      return `Sandbox: bash blocked — command matches denied pattern "${blocked}"`;
    }
    return null;
  }

  return null;
}
```

---

## File Changes

### 1. NEW: `src/sandbox.ts` (~80 lines)
- `SandboxPolicy` and `BashPolicy` interfaces
- `defaultPolicy(role, cwd)` function
- `checkWritePath()` and `checkBashCommand()` validators

### 2. MODIFY: `src/tools.ts`
- Add optional `sandbox?: SandboxPolicy` to `ToolContext`
- `createWriteTool(cwd, sandbox?)` — add path check before `fs.writeFileSync`
- `createEditTool(cwd, sandbox?)` — add path check before `fs.writeFileSync`
- `createBashTool(cwd, sandbox?)` — add command check before `execSync`
- `createAgentTools()` — accept and pass through `sandbox` parameter
- Tool factories receive sandbox via context

### 3. MODIFY: `src/runner.ts`
- `runWithBuiltin()` — compute `defaultPolicy(agentDef.role, cwd)` and pass to `createAgentTools()`
- Import `defaultPolicy` from `./sandbox.js`

### 4. MODIFY: `src/orchestrator.ts`
- Add `sandbox?: boolean | SandboxPolicy` to `ExecuteOptions` (default: `true`)
- Pass sandbox config down to `runAgent()` / `runWithBuiltin()`

### 5. MODIFY: `src/index.ts`
- Export `SandboxPolicy`, `BashPolicy`, `defaultPolicy`, `checkWritePath`, `checkBashCommand` from `./sandbox.js`

### 6. MODIFY: `src/agents.ts`
- Add optional `sandbox?: SandboxPolicy` to `TeamAgentDef` for per-agent override
- Parse from frontmatter (optional)

### 7. UPDATE: Documentation
- `README.md` — add sandbox section
- `README.zh-CN.md` — mirror
- `BEST_PRACTICES.md` — add sandbox configuration guidance

---

## Implementation Order

1. `src/sandbox.ts` — new file with types + defaults + validators
2. `src/tools.ts` — wire sandbox into tool factories
3. `src/runner.ts` — compute and pass sandbox policy
4. `src/orchestrator.ts` — add `sandbox` to ExecuteOptions, thread through
5. `src/agents.ts` — optional per-agent sandbox override in frontmatter
6. `src/index.ts` — export new public API
7. Documentation updates
8. Tests

---

## What This Does NOT Cover (Future Work)

- Network isolation (no curl/wget blocking beyond bash denylist)
- Process isolation (no containerization)
- Symlink attack prevention
- Resource limits (CPU, memory, disk)
- Read path restrictions (currently all reads are allowed)

These can be added later by extending `SandboxPolicy` without breaking changes.
