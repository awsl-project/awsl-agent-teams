/**
 * Code-based verification — runs real commands, not LLM judgment.
 *
 * Reads .planning/PLAN.md, extracts verify commands, runs them,
 * and produces a structured report.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { log } from "./log.js";
import { atomicWriteFileSync } from "./fs-utils.js";

export interface VerifyItem {
	taskId: string;
	command: string;
	passed: boolean;
	output: string;
	durationMs: number;
}

export interface VerifyResult {
	passed: boolean;
	items: VerifyItem[];
	generalChecks: VerifyItem[];
	summary: string;
}

// ─── Provider Architecture ──────────────────────────────────

interface VerifyProvider {
	name: string;
	detect(cwd: string): boolean;
	execute(cwd: string): Promise<VerifyItem[]>;
	timeout: number;
}

// ─── Cache Support ──────────────────────────────────────────

interface VerifyCacheEntry {
	key: string;
	result: VerifyItem[];
	timestamp: string;
}

type VerifyCache = Record<string, VerifyCacheEntry>;

const CACHE_TTL = 300_000; // 5 minutes
const CACHE_FILE = ".verify-cache.json";

function loadVerifyCache(cwd: string): VerifyCache {
	try {
		const cachePath = path.join(cwd, ".planning", CACHE_FILE);
		return JSON.parse(fs.readFileSync(cachePath, "utf-8")) as VerifyCache;
	} catch {
		return {};
	}
}

function saveVerifyCache(cwd: string, cache: VerifyCache): void {
	try {
		const cachePath = path.join(cwd, ".planning", CACHE_FILE);
		atomicWriteFileSync(cachePath, JSON.stringify(cache, null, 2));
	} catch { /* ignore write errors */ }
}

function computeCacheKey(cwd: string, extensions: string[]): string {
	const files = findSourceFiles(cwd);
	const matching = files.filter(f => extensions.some(ext => f.endsWith(ext)));
	let maxMtime = 0;
	for (const file of matching) {
		try {
			const stat = fs.statSync(file);
			if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
		} catch { /* ignore */ }
	}
	return new Date(maxMtime).toISOString();
}

// ─── Helper: Run a command synchronously ────────────────────

function runCommand(taskId: string, command: string, cwd: string, timeoutMs: number): VerifyItem {
	const start = Date.now();
	try {
		const output = execSync(command, {
			cwd,
			encoding: "utf-8",
			timeout: timeoutMs,
			stdio: ["pipe", "pipe", "pipe"],
		});
		const durationMs = Date.now() - start;
		return { taskId, command, passed: true, output: output.slice(0, 2000), durationMs };
	} catch (e: any) {
		const durationMs = Date.now() - start;
		const output = (e.stdout ?? "") + (e.stderr ?? "");
		return { taskId, command, passed: false, output: output.slice(0, 2000), durationMs };
	}
}

// ─── Provider Implementations ───────────────────────────────

const TypeScriptProvider: VerifyProvider = {
	name: "typecheck",
	timeout: 120_000,
	detect(cwd: string): boolean {
		return fs.existsSync(path.join(cwd, "tsconfig.json"));
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		const cache = loadVerifyCache(cwd);
		const cacheKey = computeCacheKey(cwd, [".ts", ".tsx", ".mts"]);
		const entry = cache[this.name];
		if (entry && entry.key === cacheKey && (Date.now() - new Date(entry.timestamp).getTime()) < CACHE_TTL) {
			log.info("verify", `[cached] ${this.name}`);
			return entry.result;
		}

		log.info("verify", "Running: npx tsc --noEmit");
		const result = [runCommand("typecheck", "npx tsc --noEmit", cwd, this.timeout)];

		cache[this.name] = { key: cacheKey, result, timestamp: new Date().toISOString() };
		saveVerifyCache(cwd, cache);
		return result;
	},
};

const TestProvider: VerifyProvider = {
	name: "test",
	timeout: 180_000,
	detect(cwd: string): boolean {
		const pkgPath = path.join(cwd, "package.json");
		if (!fs.existsSync(pkgPath)) return false;
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
			return !!(pkg.scripts?.test && pkg.scripts.test !== "echo \"Error: no test specified\" && exit 1");
		} catch {
			return false;
		}
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		const cache = loadVerifyCache(cwd);
		const cacheKey = computeCacheKey(cwd, [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"]);
		const entry = cache[this.name];
		if (entry && entry.key === cacheKey && (Date.now() - new Date(entry.timestamp).getTime()) < CACHE_TTL) {
			log.info("verify", `[cached] ${this.name}`);
			return entry.result;
		}

		log.info("verify", "Running: npm test");
		const result = [runCommand("test", "npm test", cwd, this.timeout)];

		cache[this.name] = { key: cacheKey, result, timestamp: new Date().toISOString() };
		saveVerifyCache(cwd, cache);
		return result;
	},
};

const ESLintProvider: VerifyProvider = {
	name: "lint",
	timeout: 60_000,
	detect(cwd: string): boolean {
		const configs = [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.js", "eslint.config.mjs"];
		return configs.some(c => fs.existsSync(path.join(cwd, c)));
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		const cache = loadVerifyCache(cwd);
		const cacheKey = computeCacheKey(cwd, [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"]);
		const entry = cache[this.name];
		if (entry && entry.key === cacheKey && (Date.now() - new Date(entry.timestamp).getTime()) < CACHE_TTL) {
			log.info("verify", `[cached] ${this.name}`);
			return entry.result;
		}

		log.info("verify", "Running: npx eslint . --max-warnings 0");
		const result = [runCommand("lint", "npx eslint . --max-warnings 0", cwd, this.timeout)];

		cache[this.name] = { key: cacheKey, result, timestamp: new Date().toISOString() };
		saveVerifyCache(cwd, cache);
		return result;
	},
};

const GitDiffProvider: VerifyProvider = {
	name: "git-diff",
	timeout: 5_000,
	detect(): boolean {
		return true;
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		const start = Date.now();
		try {
			let diffCmd: string;
			try {
				execSync("git rev-parse HEAD~1", { cwd, stdio: "pipe", timeout: 3000 });
				diffCmd = "git diff --stat HEAD~1";
			} catch {
				diffCmd = "git diff --stat";
			}
			const diff = execSync(diffCmd, {
				cwd, encoding: "utf-8", timeout: this.timeout, stdio: ["pipe", "pipe", "pipe"],
			}).trim();
			const durationMs = Date.now() - start;
			if (diff) {
				return [{ taskId: "git-diff", command: "git diff --stat", passed: true, output: diff, durationMs }];
			}
		} catch { /* not a git repo or no commits */ }
		return [];
	},
};

// ─── Build Provider ──────────────────────────────────────────

const BuildProvider: VerifyProvider = {
	name: "build",
	timeout: 180_000,
	detect(cwd: string): boolean {
		// Node.js: package.json with scripts.build
		const pkgPath = path.join(cwd, "package.json");
		if (fs.existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
				if (pkg.scripts?.build) return true;
			} catch { /* ignore */ }
		}
		// Rust, Go, Python
		if (fs.existsSync(path.join(cwd, "Cargo.toml"))) return true;
		if (fs.existsSync(path.join(cwd, "go.mod"))) return true;
		if (fs.existsSync(path.join(cwd, "setup.py"))) return true;
		if (fs.existsSync(path.join(cwd, "pyproject.toml"))) return true;
		return false;
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		// Use first match
		const pkgPath = path.join(cwd, "package.json");
		if (fs.existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
				if (pkg.scripts?.build) {
					log.info("verify", "Running: npm run build");
					return [runCommand("build", "npm run build", cwd, this.timeout)];
				}
			} catch { /* ignore */ }
		}
		if (fs.existsSync(path.join(cwd, "Cargo.toml"))) {
			log.info("verify", "Running: cargo build");
			return [runCommand("build", "cargo build", cwd, this.timeout)];
		}
		if (fs.existsSync(path.join(cwd, "go.mod"))) {
			log.info("verify", "Running: go build ./...");
			return [runCommand("build", "go build ./...", cwd, this.timeout)];
		}
		if (fs.existsSync(path.join(cwd, "setup.py")) || fs.existsSync(path.join(cwd, "pyproject.toml"))) {
			log.info("verify", "Running: python setup.py build");
			return [runCommand("build", "python setup.py build", cwd, this.timeout)];
		}
		return [];
	},
};

// ─── Prettier Provider ──────────────────────────────────────

const PrettierProvider: VerifyProvider = {
	name: "prettier",
	timeout: 60_000,
	detect(cwd: string): boolean {
		const configs = [
			".prettierrc", ".prettierrc.js", ".prettierrc.json", ".prettierrc.yml",
			"prettier.config.js", "prettier.config.mjs", "prettier.config.cjs",
		];
		return configs.some(c => fs.existsSync(path.join(cwd, c)));
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		log.info("verify", "Running: npx prettier --check .");
		return [runCommand("prettier", "npx prettier --check .", cwd, this.timeout)];
	},
};

// ─── Audit Provider ─────────────────────────────────────────

const AuditProvider: VerifyProvider = {
	name: "audit",
	timeout: 30_000,
	detect(cwd: string): boolean {
		return fs.existsSync(path.join(cwd, "package-lock.json"));
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		log.info("verify", "Running: npm audit --audit-level=moderate");
		return [runCommand("audit", "npm audit --audit-level=moderate", cwd, this.timeout)];
	},
};

// ─── Python Providers ───────────────────────────────────────

const PythonTestProvider: VerifyProvider = {
	name: "pytest",
	timeout: 180_000,
	detect(cwd: string): boolean {
		if (fs.existsSync(path.join(cwd, "pytest.ini"))) return true;
		if (fs.existsSync(path.join(cwd, "pyproject.toml"))) return true;
		// Check for any test_*.py files
		try {
			const entries = fs.readdirSync(cwd);
			return entries.some(e => /^test_.*\.py$/.test(e));
		} catch { return false; }
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		log.info("verify", "Running: python -m pytest");
		return [runCommand("pytest", "python -m pytest", cwd, this.timeout)];
	},
};

const MypyProvider: VerifyProvider = {
	name: "mypy",
	timeout: 120_000,
	detect(cwd: string): boolean {
		return fs.existsSync(path.join(cwd, "mypy.ini")) || fs.existsSync(path.join(cwd, ".mypy.ini"));
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		log.info("verify", "Running: python -m mypy .");
		return [runCommand("mypy", "python -m mypy .", cwd, this.timeout)];
	},
};

const RuffProvider: VerifyProvider = {
	name: "ruff",
	timeout: 60_000,
	detect(cwd: string): boolean {
		if (fs.existsSync(path.join(cwd, "ruff.toml"))) return true;
		// Check pyproject.toml for ruff config
		const pyprojectPath = path.join(cwd, "pyproject.toml");
		if (fs.existsSync(pyprojectPath)) {
			try {
				const content = fs.readFileSync(pyprojectPath, "utf-8");
				return content.includes("[tool.ruff]");
			} catch { return false; }
		}
		return false;
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		log.info("verify", "Running: ruff check .");
		return [runCommand("ruff", "ruff check .", cwd, this.timeout)];
	},
};

// ─── Go Providers ───────────────────────────────────────────

const GoVetProvider: VerifyProvider = {
	name: "go-vet",
	timeout: 60_000,
	detect(cwd: string): boolean {
		return fs.existsSync(path.join(cwd, "go.mod"));
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		log.info("verify", "Running: go vet ./...");
		return [runCommand("go-vet", "go vet ./...", cwd, this.timeout)];
	},
};

const GoTestProvider: VerifyProvider = {
	name: "go-test",
	timeout: 180_000,
	detect(cwd: string): boolean {
		return fs.existsSync(path.join(cwd, "go.mod"));
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		log.info("verify", "Running: go test ./...");
		return [runCommand("go-test", "go test ./...", cwd, this.timeout)];
	},
};

// ─── Rust Providers ─────────────────────────────────────────

const CargoClippyProvider: VerifyProvider = {
	name: "cargo-clippy",
	timeout: 120_000,
	detect(cwd: string): boolean {
		return fs.existsSync(path.join(cwd, "Cargo.toml"));
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		log.info("verify", "Running: cargo clippy -- -D warnings");
		return [runCommand("cargo-clippy", "cargo clippy -- -D warnings", cwd, this.timeout)];
	},
};

const CargoTestProvider: VerifyProvider = {
	name: "cargo-test",
	timeout: 180_000,
	detect(cwd: string): boolean {
		return fs.existsSync(path.join(cwd, "Cargo.toml"));
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		log.info("verify", "Running: cargo test");
		return [runCommand("cargo-test", "cargo test", cwd, this.timeout)];
	},
};

// ─── Custom Provider Config ─────────────────────────────────

interface CustomProviderConfig {
	name: string;
	command: string;
	timeout?: number;
}

function loadCustomProviders(cwd: string): VerifyProvider[] {
	// Try .planning/verify.json first
	const verifyJsonPath = path.join(cwd, ".planning", "verify.json");
	if (fs.existsSync(verifyJsonPath)) {
		try {
			const data = JSON.parse(fs.readFileSync(verifyJsonPath, "utf-8"));
			const providers = data.providers as CustomProviderConfig[];
			if (Array.isArray(providers)) {
				return providers.map(p => new CommandProvider(p.name, p.command, p.timeout ?? 60_000));
			}
		} catch {
			log.warn("verify", "Failed to parse .planning/verify.json");
		}
	}

	// Fallback to .awsl.json
	const awslJsonPath = path.join(cwd, ".awsl.json");
	if (fs.existsSync(awslJsonPath)) {
		try {
			const data = JSON.parse(fs.readFileSync(awslJsonPath, "utf-8"));
			const providers = data.verify?.providers as CustomProviderConfig[] | undefined;
			if (Array.isArray(providers)) {
				return providers.map(p => new CommandProvider(p.name, p.command, p.timeout ?? 60_000));
			}
		} catch {
			log.warn("verify", "Failed to parse .awsl.json");
		}
	}

	return [];
}

class CommandProvider implements VerifyProvider {
	name: string;
	timeout: number;
	private command: string;

	constructor(taskId: string, command: string, timeoutMs = 60_000) {
		this.name = taskId;
		this.command = command;
		this.timeout = timeoutMs;
	}

	detect(): boolean {
		return true;
	}

	async execute(cwd: string): Promise<VerifyItem[]> {
		return [runCommand(this.name, this.command, cwd, this.timeout)];
	}
}

// ─── Coverage Provider ─────────────────────────────────────
// Runs tests with coverage and checks that coverage meets threshold.

const CoverageProvider: VerifyProvider = {
	name: "coverage",
	timeout: 180_000,
	detect(cwd: string): boolean {
		try {
			const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
			const hasTest = pkg.scripts?.test && !pkg.scripts.test.includes("no test specified");
			// Only if vitest or jest or c8 is available
			const hasVite = fs.existsSync(path.join(cwd, "node_modules", "vitest"));
			const hasJest = fs.existsSync(path.join(cwd, "node_modules", "jest"));
			const hasC8 = fs.existsSync(path.join(cwd, "node_modules", "c8"));
			return !!(hasTest && (hasVite || hasJest || hasC8));
		} catch { return false; }
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		// Request json-summary so we can read coverage/coverage-summary.json from disk.
		// vitest's `--reporter=json` writes test results (not coverage), and jest's
		// `--coverageReporters=text` emits an istanbul table — neither matches
		// the `Lines|Stmts: N%` format the old regex expected.
		const hasVite = fs.existsSync(path.join(cwd, "node_modules", "vitest"));
		const cmd = hasVite
			? "npx vitest run --coverage --coverage.reporter=json-summary --coverage.reporter=text 2>&1"
			: "npx jest --coverage --coverageReporters=json-summary --coverageReporters=text 2>&1";

		const result = runCommand("coverage", cmd, cwd, this.timeout);

		// Read canonical coverage number from the json-summary file.
		let coveragePct = 0;
		const summaryPath = path.join(cwd, "coverage", "coverage-summary.json");
		try {
			if (fs.existsSync(summaryPath)) {
				const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
				const pct = summary?.total?.lines?.pct;
				if (typeof pct === "number" && !Number.isNaN(pct)) coveragePct = pct;
			}
		} catch {
			// keep coveragePct at 0 — reporter likely didn't run
		}

		const THRESHOLD = 60; // minimum 60% line coverage
		const passed = coveragePct >= THRESHOLD;
		result.passed = passed;
		result.output = `Line coverage: ${coveragePct}% (threshold: ${THRESHOLD}%)\n${result.output.slice(0, 1500)}`;

		return [result];
	},
};

// ─── Security Scan Provider ────────────────────────────────
// Runs eslint-plugin-security or semgrep if available.

const SecurityScanProvider: VerifyProvider = {
	name: "security-scan",
	timeout: 60_000,
	detect(cwd: string): boolean {
		// Check for eslint-plugin-security in node_modules
		const hasPlugin = fs.existsSync(path.join(cwd, "node_modules", "eslint-plugin-security"));
		// Or semgrep on PATH
		if (hasPlugin) return true;
		try { execSync("semgrep --version", { stdio: "pipe", timeout: 5000 }); return true; } catch { return false; }
	},
	async execute(cwd: string): Promise<VerifyItem[]> {
		const hasPlugin = fs.existsSync(path.join(cwd, "node_modules", "eslint-plugin-security"));
		if (hasPlugin) {
			return [runCommand("security-scan", "npx eslint src/ --rule '{\"security/detect-object-injection\": \"warn\", \"security/detect-non-literal-fs-filename\": \"warn\", \"security/detect-eval-with-expression\": \"error\"}' --max-warnings 0 2>&1", cwd, this.timeout)];
		}
		// Fallback: semgrep
		return [runCommand("security-scan", "semgrep --config auto src/ --error 2>&1", cwd, this.timeout)];
	},
};

/** All built-in general-check providers. */
const GENERAL_PROVIDERS: VerifyProvider[] = [
	TypeScriptProvider,
	BuildProvider,
	TestProvider,
	CoverageProvider,
	ESLintProvider,
	SecurityScanProvider,
	PrettierProvider,
	AuditProvider,
	PythonTestProvider,
	MypyProvider,
	RuffProvider,
	GoVetProvider,
	GoTestProvider,
	CargoClippyProvider,
	CargoTestProvider,
	GitDiffProvider,
];

/**
 * Parse PLAN.md to extract task verify commands.
 */
function extractVerifyCommands(planContent: string): { taskId: string; command: string }[] {
	const results: { taskId: string; command: string }[] = [];

	// Match ## task-id: name ... ### Verify ... (content until next ## or end-of-string).
	// JS regex has no \Z; `$(?![\s\S])` with the m flag anchors end-of-string since `$`
	// alone with m matches end-of-line. Without this, the last task block in PLAN.md
	// silently fails to match (or terminates at the first stray 'Z' in its body).
	const taskRegex = /^## ([\w-]+):\s*.+$([\s\S]*?)(?=^## |$(?![\s\S]))/gm;
	let match;
	while ((match = taskRegex.exec(planContent)) !== null) {
		const taskId = match[1];
		const body = match[2];

		// Extract verify section
		const verifyMatch = body.match(/### Verify\s*\n([\s\S]*?)(?=###|$)/);
		if (verifyMatch) {
			const verifyText = verifyMatch[1].trim();
			// Extract commands (lines that look like shell commands)
			const cmdLines = verifyText.split("\n")
				.map(l => l.trim())
				.filter(l => l && !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("*"))
				.filter(l => /^(npm |npx |node |tsc |jest |vitest |pytest |cargo |go |make |curl )/.test(l)
					|| /^`(.+)`$/.test(l));

			for (let cmd of cmdLines) {
				// Strip backticks
				cmd = cmd.replace(/^`|`$/g, "").trim();
				if (cmd) results.push({ taskId, command: cmd });
			}
		}
	}

	return results;
}

/**
 * Run full verification pipeline (async, provider-based).
 */
export async function runFullVerification(cwd: string): Promise<VerifyResult> {
	log.section("Verification (Code-Based)");
	const startTime = Date.now();

	const planPath = path.join(cwd, ".planning", "PLAN.md");
	const items: VerifyItem[] = [];

	// Task-specific verify commands (sequential — order matters)
	if (fs.existsSync(planPath)) {
		const planContent = fs.readFileSync(planPath, "utf-8");
		const commands = extractVerifyCommands(planContent);

		for (const { taskId, command } of commands) {
			log.info("verify", `[${taskId}] Running: ${command}`);
			const provider = new CommandProvider(taskId, command);
			const result = await provider.execute(cwd);
			items.push(...result);
		}
	} else {
		log.warn("verify", "No .planning/PLAN.md found, skipping task-specific checks");
	}

	// General checks — detect applicable providers, run in parallel
	const activeProviders = GENERAL_PROVIDERS.filter(p => p.detect(cwd));
	const customProviders = loadCustomProviders(cwd);
	const allProviders = [...activeProviders, ...customProviders];
	const settled = await Promise.allSettled(
		allProviders.map(p => p.execute(cwd))
	);

	const generalChecks: VerifyItem[] = [];
	for (let i = 0; i < settled.length; i++) {
		const result = settled[i];
		if (result.status === "fulfilled") {
			generalChecks.push(...result.value);
		} else {
			// Provider threw — record as failure
			const provider = allProviders[i];
			generalChecks.push({
				taskId: provider.name,
				command: `(provider: ${provider.name})`,
				passed: false,
				output: String(result.reason).slice(0, 2000),
				durationMs: 0,
			});
		}
	}

	// Summary
	const totalMs = Date.now() - startTime;
	const allItems = [...items, ...generalChecks];
	const passCount = allItems.filter(i => i.passed).length;
	const failCount = allItems.filter(i => !i.passed).length;
	const passed = failCount === 0;
	const passRate = allItems.length > 0 ? ((passCount / allItems.length) * 100).toFixed(1) : "0.0";
	const totalSec = (totalMs / 1000).toFixed(1);

	const summary = `Verification: ${passCount}/${allItems.length} passed (${passRate}%) in ${totalSec}s`;
	log.info("verify", summary);

	// Write report
	const report = formatReport(items, generalChecks, summary, totalMs);
	const verifyPath = path.join(cwd, ".planning", "VERIFICATION.md");
	atomicWriteFileSync(verifyPath, report);
	log.info("verify", "Report saved to .planning/VERIFICATION.md");

	return { passed, items, generalChecks, summary };
}

/**
 * Quick regression test — runs only tsc + npm test (fast, no lint/audit).
 * Used after each task to catch regressions before moving to next task.
 */
export async function runRegressionTest(cwd: string): Promise<{ passed: boolean; output: string }> {
	const checks: VerifyItem[] = [];

	// TypeScript compilation
	if (TypeScriptProvider.detect(cwd)) {
		checks.push(...await TypeScriptProvider.execute(cwd));
	}

	// Tests
	if (TestProvider.detect(cwd)) {
		checks.push(...await TestProvider.execute(cwd));
	}

	const passed = checks.every(c => c.passed);
	const output = checks.map(c => `[${c.passed ? "PASS" : "FAIL"}] ${c.taskId}: ${c.output.slice(0, 300)}`).join("\n");

	return { passed, output };
}

// ─── Static Code Review ─────────────────────────────────────

export interface ReviewFinding {
	file: string;
	line: number;
	severity: "critical" | "warning" | "info";
	rule: string;
	message: string;
}

export interface ReviewResult {
	passed: boolean;
	findings: ReviewFinding[];
	summary: string;
}

/**
 * Static code review — deterministic checks, no LLM.
 * Catches common quality issues that agents might miss.
 */
export function runStaticReview(cwd: string): ReviewResult {
	log.section("Static Code Review");
	const findings: ReviewFinding[] = [];

	// Find all TS/JS source files (exclude node_modules, dist, .planning)
	const sourceFiles = findSourceFiles(cwd);
	log.info("review", `Scanning ${sourceFiles.length} source files`);

	for (const file of sourceFiles) {
		const relPath = path.relative(cwd, file);
		let content: string;
		try {
			content = fs.readFileSync(file, "utf-8");
		} catch { continue; }

		const lines = content.split("\n");

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const lineNum = i + 1;

			// Rule: `any` type usage
			if (/:\s*any\b/.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*")) {
				findings.push({
					file: relPath, line: lineNum, severity: "warning",
					rule: "no-any", message: "Explicit `any` type used",
				});
			}

			// Rule: console.log in production code (not test files)
			if (/console\.log\(/.test(line) && !relPath.includes(".test.") && !relPath.includes(".spec.") && !relPath.includes("__tests__")) {
				findings.push({
					file: relPath, line: lineNum, severity: "warning",
					rule: "no-console-log", message: "console.log in production code",
				});
			}

			// Rule: empty catch blocks
			if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || (line.includes("catch") && i + 1 < lines.length && /^\s*\}\s*$/.test(lines[i + 1]))) {
				findings.push({
					file: relPath, line: lineNum, severity: "warning",
					rule: "no-empty-catch", message: "Empty catch block — errors silently swallowed",
				});
			}

			// Rule: TODO/FIXME/HACK comments
			if (/\/\/\s*(TODO|FIXME|HACK|XXX)\b/i.test(line)) {
				findings.push({
					file: relPath, line: lineNum, severity: "info",
					rule: "todo-comment", message: line.trim(),
				});
			}

			// Rule: hardcoded secrets (basic patterns)
			if (/(?:password|secret|api_?key|token)\s*[:=]\s*["'][^"']{8,}["']/i.test(line)
				&& !relPath.includes(".test.") && !relPath.includes(".spec.")
				&& !relPath.includes("__tests__") && !line.includes("process.env")) {
				findings.push({
					file: relPath, line: lineNum, severity: "critical",
					rule: "no-hardcoded-secrets", message: "Possible hardcoded secret",
				});
			}
		}

		// Rule: unused imports
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			// Skip type-only imports and side-effect imports
			if (/^\s*import\s+type\b/.test(line)) continue;
			if (/^\s*import\s+["']/.test(line)) continue;

			// Named imports: import { X, Y, Z } from "..."
			const namedMatch = line.match(/^\s*import\s*\{([^}]+)\}\s*from\b/);
			if (namedMatch) {
				const identifiers = namedMatch[1].split(",").map(s => {
					const parts = s.trim().split(/\s+as\s+/);
					return (parts[1] ?? parts[0]).trim();
				}).filter(Boolean);
				const restOfFile = lines.filter((_, idx) => idx !== i).join("\n");
				for (const id of identifiers) {
					if (id && !new RegExp(`\\b${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(restOfFile)) {
						findings.push({
							file: relPath, line: i + 1, severity: "warning",
							rule: "unused-import", message: `Unused import: \`${id}\``,
						});
					}
				}
				continue;
			}

			// Default imports: import X from "..."
			const defaultMatch = line.match(/^\s*import\s+(\w+)\s+from\b/);
			if (defaultMatch) {
				const id = defaultMatch[1];
				const restOfFile = lines.filter((_, idx) => idx !== i).join("\n");
				if (!new RegExp(`\\b${id}\\b`).test(restOfFile)) {
					findings.push({
						file: relPath, line: i + 1, severity: "warning",
						rule: "unused-import", message: `Unused import: \`${id}\``,
					});
				}
			}
		}

		// Rule: function too long (>50 lines)
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			let funcName: string | null = null;

			// Detect function start patterns
			const funcDeclMatch = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
			const constFuncMatch = line.match(/^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/);
			const methodMatch = line.match(/^\s+(\w+)\s*\(/);

			if (funcDeclMatch) funcName = funcDeclMatch[1];
			else if (constFuncMatch) funcName = constFuncMatch[1];
			else if (methodMatch && !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("if") && !line.trim().startsWith("for") && !line.trim().startsWith("while") && !line.trim().startsWith("switch") && !line.trim().startsWith("return") && !line.trim().startsWith("throw")) funcName = methodMatch[1];

			if (funcName && line.includes("{")) {
				// Track brace depth from this line
				let depth = 0;
				let foundOpen = false;
				for (let j = i; j < lines.length; j++) {
					for (const ch of lines[j]) {
						if (ch === "{") { depth++; foundOpen = true; }
						if (ch === "}") depth--;
					}
					if (foundOpen && depth === 0) {
						const span = j - i + 1;
						if (span > 50) {
							findings.push({
								file: relPath, line: i + 1, severity: "warning",
								rule: "function-too-long", message: `Function \`${funcName}\` is ${span} lines long (max 50)`,
							});
						}
						break;
					}
				}
			}
		}

		// Rule: nesting too deep (>4 levels)
		{
			let depth = 0;
			let reported = false;
			for (let i = 0; i < lines.length; i++) {
				const trimmed = lines[i].trim();
				if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
				for (const ch of lines[i]) {
					if (ch === "{") depth++;
					if (ch === "}") { depth--; if (depth <= 4) reported = false; }
				}
				if (depth > 4 && !reported) {
					findings.push({
						file: relPath, line: i + 1, severity: "warning",
						rule: "nesting-too-deep", message: `Nesting depth exceeds 4 levels (depth: ${depth})`,
					});
					reported = true;
				}
			}
		}

		// Rule: duplicate code blocks (6+ consecutive identical lines)
		{
			const normalized = lines.map(l => l.trim());
			const nonEmptyIndices = normalized.map((l, i) => ({ l, i })).filter(x => x.l.length > 0);
			const SEQ_LEN = 6;
			const reportedDups = new Set<string>();

			for (let a = 0; a < nonEmptyIndices.length - SEQ_LEN + 1; a++) {
				// Check if indices are consecutive in the original file
				let consecutiveA = true;
				for (let k = 1; k < SEQ_LEN; k++) {
					if (nonEmptyIndices[a + k].i !== nonEmptyIndices[a + k - 1].i + 1) { consecutiveA = false; break; }
				}
				if (!consecutiveA) continue;

				const seqA = nonEmptyIndices.slice(a, a + SEQ_LEN).map(x => x.l);
				const seqKey = seqA.join("\n");
				if (reportedDups.has(seqKey)) continue;

				for (let b = a + SEQ_LEN; b < nonEmptyIndices.length - SEQ_LEN + 1; b++) {
					let consecutiveB = true;
					for (let k = 1; k < SEQ_LEN; k++) {
						if (nonEmptyIndices[b + k].i !== nonEmptyIndices[b + k - 1].i + 1) { consecutiveB = false; break; }
					}
					if (!consecutiveB) continue;

					const seqB = nonEmptyIndices.slice(b, b + SEQ_LEN).map(x => x.l);
					let match = true;
					for (let k = 0; k < SEQ_LEN; k++) {
						if (seqA[k] !== seqB[k]) { match = false; break; }
					}
					if (match) {
						reportedDups.add(seqKey);
						findings.push({
							file: relPath, line: nonEmptyIndices[b].i + 1, severity: "info",
							rule: "duplicate-code", message: `Duplicate code block (${SEQ_LEN}+ lines), same as line ${nonEmptyIndices[a].i + 1}`,
						});
						break; // Only report first duplicate
					}
				}
			}
		}

		// Rule: file too long
		if (lines.length > 500) {
			findings.push({
				file: relPath, line: 1, severity: "warning",
				rule: "file-too-long", message: `File has ${lines.length} lines, consider splitting`,
			});
		}
	}

	// Check for test files existence
	const testFiles = sourceFiles.filter(f =>
		f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__")
	);
	const srcFiles = sourceFiles.filter(f =>
		!f.includes(".test.") && !f.includes(".spec.") && !f.includes("__tests__")
	);

	if (srcFiles.length > 0 && testFiles.length === 0) {
		findings.push({
			file: "(project)", line: 0, severity: "critical",
			rule: "no-tests", message: "No test files found — project has no tests",
		});
	}

	const criticalCount = findings.filter(f => f.severity === "critical").length;
	const warningCount = findings.filter(f => f.severity === "warning").length;
	const infoCount = findings.filter(f => f.severity === "info").length;
	const passed = criticalCount === 0;

	const summary = `Review: ${criticalCount} critical, ${warningCount} warnings, ${infoCount} info across ${sourceFiles.length} files.`;
	log.info("review", summary);

	// Write report
	const report = formatReviewReport(findings, summary);
	const reviewPath = path.join(cwd, ".planning", "REVIEW.md");
	atomicWriteFileSync(reviewPath, report);
	log.info("review", "Report saved to .planning/REVIEW.md");

	return { passed, findings, summary };
}

function findSourceFiles(dir: string): string[] {
	const files: string[] = [];
	const ignored = new Set(["node_modules", "dist", ".planning", ".git", "coverage", ".next", "build"]);

	function walk(d: string) {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(d, { withFileTypes: true });
		} catch { return; }

		for (const entry of entries) {
			if (ignored.has(entry.name)) continue;
			const full = path.join(d, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (/\.(ts|tsx|js|jsx|mts|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
				files.push(full);
			}
		}
	}

	walk(dir);
	return files;
}

function formatReviewReport(findings: ReviewFinding[], summary: string): string {
	const criticalCount = findings.filter(f => f.severity === "critical").length;
	const warningCount = findings.filter(f => f.severity === "warning").length;
	const infoCount = findings.filter(f => f.severity === "info").length;
	const fileCount = new Set(findings.map(f => f.file)).size || 0;

	const statusLabel = criticalCount > 0
		? `FAIL — ${criticalCount} critical finding${criticalCount > 1 ? "s" : ""}`
		: "PASS — no critical findings";

	const lines = [
		"# Static Code Review\n",
		`**Summary:** ${criticalCount} critical, ${warningCount} warnings, ${infoCount} info across ${fileCount} files`,
		`**Status:** ${statusLabel}\n`,
	];

	const bySeverity = { critical: [] as ReviewFinding[], warning: [] as ReviewFinding[], info: [] as ReviewFinding[] };
	for (const f of findings) {
		bySeverity[f.severity].push(f);
	}

	for (const [severity, items] of Object.entries(bySeverity)) {
		if (items.length === 0) continue;
		lines.push(`## ${severity.toUpperCase()} (${items.length})\n`);
		for (const f of items) {
			lines.push(`- **${f.file}:${f.line}** [${f.rule}] ${f.message}`);
		}
		lines.push("");
	}

	return lines.join("\n");
}

// ─── Report Formatting ──────────────────────────────────────

function formatReport(items: VerifyItem[], generalChecks: VerifyItem[], summary: string, totalMs: number): string {
	const allItems = [...items, ...generalChecks];
	const passCount = allItems.filter(i => i.passed).length;
	const total = allItems.length;
	const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : "0.0";
	const totalSec = (totalMs / 1000).toFixed(1);

	const lines = [
		"# Verification Report\n",
		`**Summary:** ${passCount}/${total} passed (${passRate}% pass rate)`,
		`**Total time:** ${totalSec}s`,
		`**Generated:** ${new Date().toISOString()}\n`,
	];

	if (items.length > 0) {
		lines.push("## Task Checks\n");
		for (const item of items) {
			const icon = item.passed ? "PASS" : "FAIL";
			const dur = (item.durationMs / 1000).toFixed(1);
			lines.push(`### [${icon}] ${item.taskId}: \`${item.command}\` (${dur}s)`);
			if (item.output) {
				lines.push("```");
				lines.push(item.output.slice(0, 500));
				lines.push("```");
			}
			lines.push("");
		}

		const taskPass = items.filter(i => i.passed).length;
		const taskTotal = items.length;
		const taskRate = taskTotal > 0 ? ((taskPass / taskTotal) * 100).toFixed(1) : "0.0";
		const taskTime = (items.reduce((sum, i) => sum + i.durationMs, 0) / 1000).toFixed(1);
		lines.push(`> Task checks: ${taskPass}/${taskTotal} passed (${taskRate}%) in ${taskTime}s\n`);
	}

	if (generalChecks.length > 0) {
		lines.push("## General Checks\n");
		for (const item of generalChecks) {
			const icon = item.passed ? "PASS" : "FAIL";
			const dur = (item.durationMs / 1000).toFixed(1);
			lines.push(`### [${icon}] ${item.taskId}: \`${item.command}\` (${dur}s)`);
			if (item.output) {
				lines.push("```");
				lines.push(item.output.slice(0, 500));
				lines.push("```");
			}
			lines.push("");
		}

		const genPass = generalChecks.filter(i => i.passed).length;
		const genTotal = generalChecks.length;
		const genRate = genTotal > 0 ? ((genPass / genTotal) * 100).toFixed(1) : "0.0";
		const genTime = (generalChecks.reduce((sum, i) => sum + i.durationMs, 0) / 1000).toFixed(1);
		lines.push(`> General checks: ${genPass}/${genTotal} passed (${genRate}%) in ${genTime}s\n`);
	}

	return lines.join("\n");
}
