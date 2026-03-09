/**
 * Sandbox policy for builtin engine tools.
 *
 * Provides write-path restriction and bash command filtering
 * with role-based defaults for each agent type.
 */

import path from "node:path"

// ─── Types ───────────────────────────────────────────────────────────

export interface SandboxPolicy {
	/** Directories where write/edit are allowed (absolute paths). */
	writePaths: string[]
	/** Bash command restrictions. */
	bash: BashPolicy
}

export interface BashPolicy {
	/**
	 * - "allowlist": only commands matching a prefix in `patterns` are allowed
	 * - "denylist": commands matching any pattern in `patterns` are blocked
	 * - "unrestricted": no filtering
	 */
	mode: "allowlist" | "denylist" | "unrestricted"
	/** String patterns to match against the command. */
	patterns: string[]
}

// ─── Dangerous patterns (coder denylist) ─────────────────────────────

const CODER_DENY_PATTERNS = [
	"rm -rf /",
	"sudo ",
	"mkfs",
	"dd if=",
	":(){ :|:& };:",
	"chmod 777",
	"> /dev/sd",
]

// ─── Role-based allowlists ──────────────────────────────────────────

const TESTER_ALLOW = [
	"npm test", "npm run test", "npx tsc", "npx vitest", "npx jest",
	"node ", "cat ", "ls", "head ", "tail ", "grep ", "find ", "wc ",
]

const REVIEWER_ALLOW = [
	"cat ", "ls", "head ", "tail ", "grep ", "find ", "wc ",
	"git log", "git diff", "git show",
]

const ARCHITECT_ALLOW = [
	"cat ", "ls", "head ", "tail ", "grep ", "find ", "wc ", "tree ",
]

const PLANNER_ALLOW = [
	"cat ", "ls", "find ", "wc ",
]

// ─── Default policy factory ─────────────────────────────────────────

/** Returns the default sandbox policy for a given agent role. */
export function defaultPolicy(role: string, cwd: string): SandboxPolicy {
	const writePaths = [path.resolve(cwd)]

	switch (role) {
		case "tester":
			return { writePaths, bash: { mode: "allowlist", patterns: TESTER_ALLOW } }
		case "reviewer":
			return { writePaths, bash: { mode: "allowlist", patterns: REVIEWER_ALLOW } }
		case "architect":
			return { writePaths, bash: { mode: "allowlist", patterns: ARCHITECT_ALLOW } }
		case "planner":
			return { writePaths, bash: { mode: "allowlist", patterns: PLANNER_ALLOW } }
		case "coder":
		default:
			return { writePaths, bash: { mode: "denylist", patterns: CODER_DENY_PATTERNS } }
	}
}

// ─── Validators ─────────────────────────────────────────────────────

/**
 * Validate a file path against the sandbox write policy.
 * Returns null if allowed, or an error message if blocked.
 */
export function checkWritePath(resolvedPath: string, policy: SandboxPolicy): string | null {
	const normalized = path.resolve(resolvedPath)
	for (const dir of policy.writePaths) {
		const normalizedDir = path.resolve(dir)
		const a = process.platform === "win32" ? normalized.toLowerCase() : normalized
		const b = process.platform === "win32" ? normalizedDir.toLowerCase() : normalizedDir
		if (a === b || a.startsWith(b + path.sep)) {
			return null
		}
	}
	return `Sandbox: write blocked — path "${resolvedPath}" is outside allowed directories`
}

/**
 * Validate a bash command against the sandbox bash policy.
 * Returns null if allowed, or an error message if blocked.
 */
export function checkBashCommand(command: string, policy: SandboxPolicy): string | null {
	const { mode, patterns } = policy.bash
	if (mode === "unrestricted") return null

	const trimmed = command.trim()

	if (mode === "allowlist") {
		const allowed = patterns.some(p => trimmed.startsWith(p))
		if (!allowed) {
			return `Sandbox: bash blocked — command not in allowlist. Allowed prefixes: ${patterns.join(", ")}`
		}
		return null
	}

	if (mode === "denylist") {
		const blocked = patterns.find(p => trimmed.includes(p))
		if (blocked) {
			return `Sandbox: bash blocked — command matches denied pattern "${blocked}"`
		}
		return null
	}

	return null
}
