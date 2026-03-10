/**
 * Sandbox policy for builtin engine tools.
 *
 * Provides write-path restriction and bash command filtering
 * with role-based defaults for each agent type.
 */

import path from "node:path"

// ─── Types ───────────────────────────────────────────────────────────

export interface SandboxPolicy {
	/** Directories where read is allowed (absolute paths). Defaults to writePaths if omitted. */
	readPaths?: string[]
	/** Directories where write/edit are allowed (absolute paths). */
	writePaths: string[]
	/** File name patterns blocked from reading (e.g. ".env", "id_rsa"). Case-insensitive match against basename. */
	blockedReadPatterns?: string[]
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

// ─── Sensitive file patterns (blocked from reading) ─────────────────

const SENSITIVE_FILE_PATTERNS = [
	".env",
	".env.local",
	".env.production",
	".env.staging",
	".env.development",
	"credentials.json",
	"secrets.json",
	"id_rsa",
	"id_ed25519",
	"id_ecdsa",
	"id_dsa",
	".npmrc",
	".pypirc",
	"token.json",
	"service-account.json",
	".htpasswd",
]

// ─── Dangerous patterns (coder denylist) ─────────────────────────────

const CODER_DENY_PATTERNS = [
	// filesystem destruction
	"rm -rf /", "rm -rf /*",
	// privilege escalation
	"sudo ",
	// disk / device operations
	"mkfs", "dd if=", "> /dev/sd",
	// fork bomb
	":(){ :|:& };:",
	// dangerous permissions / ownership
	"chmod 777", "chmod +s", "chmod u+s", "chown ",
	// download-and-execute
	"| sh", "| bash",
	"curl ", "wget ",
	// interpreter escapes
	"python -c", "python3 -c",
	"node -e", "perl -e", "ruby -e",
	// network exfiltration
	"nc ", "ncat ",
	// remote access / file transfer
	"ssh ", "scp ", "sftp ", "rsync ", "ftp ",
	// eval / encoded execution
	"eval ", "base64 -d",
	// shell escapes (Windows)
	"powershell", "pwsh ",
	// git push (prevent autonomous pushes)
	"git push",
	// package publishing
	"npm publish",
	// system control
	"shutdown", "reboot",
	// process / service control
	"killall ", "systemctl ",
	// scheduled task manipulation
	"crontab",
	// environment variable leaking
	"printenv",
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
	const resolved = path.resolve(cwd)
	const readPaths = [resolved]
	const writePaths = [resolved]
	const blockedReadPatterns = SENSITIVE_FILE_PATTERNS

	switch (role) {
		case "tester":
			return { readPaths, writePaths, blockedReadPatterns, bash: { mode: "allowlist", patterns: TESTER_ALLOW } }
		case "reviewer":
			return { readPaths, writePaths, blockedReadPatterns, bash: { mode: "allowlist", patterns: REVIEWER_ALLOW } }
		case "architect":
			return { readPaths, writePaths, blockedReadPatterns, bash: { mode: "allowlist", patterns: ARCHITECT_ALLOW } }
		case "planner":
			return { readPaths, writePaths, blockedReadPatterns, bash: { mode: "allowlist", patterns: PLANNER_ALLOW } }
		case "coder":
		default:
			return { readPaths, writePaths, blockedReadPatterns, bash: { mode: "denylist", patterns: CODER_DENY_PATTERNS } }
	}
}

// ─── Validators ─────────────────────────────────────────────────────

/**
 * Validate a file path against the sandbox read policy.
 * Checks: (1) path is within allowed readPaths (or writePaths as fallback),
 *          (2) file basename does not match blocked patterns.
 * Returns null if allowed, or an error message if blocked.
 */
export function checkReadPath(resolvedPath: string, policy: SandboxPolicy): string | null {
	const normalized = path.resolve(resolvedPath)

	// Check blocked file patterns (case-insensitive basename match)
	const basename = path.basename(normalized).toLowerCase()
	const blocked = policy.blockedReadPatterns ?? SENSITIVE_FILE_PATTERNS
	for (const pattern of blocked) {
		if (basename === pattern.toLowerCase()) {
			return `Sandbox: read blocked — "${path.basename(resolvedPath)}" matches sensitive file pattern`
		}
	}

	// Check path is within allowed directories
	const allowedDirs = policy.readPaths ?? policy.writePaths
	for (const dir of allowedDirs) {
		const normalizedDir = path.resolve(dir)
		const a = process.platform === "win32" ? normalized.toLowerCase() : normalized
		const b = process.platform === "win32" ? normalizedDir.toLowerCase() : normalizedDir
		if (a === b || a.startsWith(b + path.sep)) {
			return null
		}
	}
	return `Sandbox: read blocked — path "${resolvedPath}" is outside allowed directories`
}

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
