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
	try {
		const output = execSync(command, {
			cwd,
			encoding: "utf-8",
			timeout: timeoutMs,
			stdio: ["pipe", "pipe", "pipe"],
		});
		return { taskId, command, passed: true, output: output.slice(0, 2000) };
	} catch (e: any) {
		const output = (e.stdout ?? "") + (e.stderr ?? "");
		return { taskId, command, passed: false, output: output.slice(0, 2000) };
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
			if (diff) {
				return [{ taskId: "git-diff", command: "git diff --stat", passed: true, output: diff }];
			}
		} catch { /* not a git repo or no commits */ }
		return [];
	},
};

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

/** All built-in general-check providers. */
const GENERAL_PROVIDERS: VerifyProvider[] = [
	TypeScriptProvider,
	TestProvider,
	ESLintProvider,
	GitDiffProvider,
];

/**
 * Parse PLAN.md to extract task verify commands.
 */
function extractVerifyCommands(planContent: string): { taskId: string; command: string }[] {
	const results: { taskId: string; command: string }[] = [];

	// Match ## task-id: name ... ### Verify ... (content until next ##)
	const taskRegex = /^## ([\w-]+):\s*.+$([\s\S]*?)(?=^## |\Z)/gm;
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
	const settled = await Promise.allSettled(
		activeProviders.map(p => p.execute(cwd))
	);

	const generalChecks: VerifyItem[] = [];
	for (let i = 0; i < settled.length; i++) {
		const result = settled[i];
		if (result.status === "fulfilled") {
			generalChecks.push(...result.value);
		} else {
			// Provider threw — record as failure
			const provider = activeProviders[i];
			generalChecks.push({
				taskId: provider.name,
				command: `(provider: ${provider.name})`,
				passed: false,
				output: String(result.reason).slice(0, 2000),
			});
		}
	}

	// Summary
	const allItems = [...items, ...generalChecks];
	const passCount = allItems.filter(i => i.passed).length;
	const failCount = allItems.filter(i => !i.passed).length;
	const passed = failCount === 0;

	const summary = `Verification: ${passCount} passed, ${failCount} failed out of ${allItems.length} checks.`;
	log.info("verify", summary);

	// Write report
	const report = formatReport(items, generalChecks, summary);
	const verifyPath = path.join(cwd, ".planning", "VERIFICATION.md");
	atomicWriteFileSync(verifyPath, report);
	log.info("verify", "Report saved to .planning/VERIFICATION.md");

	return { passed, items, generalChecks, summary };
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
	const lines = ["# Static Code Review\n", `**${summary}**\n`];

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

function formatReport(items: VerifyItem[], generalChecks: VerifyItem[], summary: string): string {
	const lines = ["# Verification Report\n", `**${summary}**\n`];

	if (items.length > 0) {
		lines.push("## Task Checks\n");
		for (const item of items) {
			const icon = item.passed ? "PASS" : "FAIL";
			lines.push(`### [${icon}] ${item.taskId}: \`${item.command}\``);
			if (item.output) {
				lines.push("```");
				lines.push(item.output.slice(0, 500));
				lines.push("```");
			}
			lines.push("");
		}
	}

	if (generalChecks.length > 0) {
		lines.push("## General Checks\n");
		for (const item of generalChecks) {
			const icon = item.passed ? "PASS" : "FAIL";
			lines.push(`### [${icon}] ${item.taskId}: \`${item.command}\``);
			if (item.output) {
				lines.push("```");
				lines.push(item.output.slice(0, 500));
				lines.push("```");
			}
			lines.push("");
		}
	}

	return lines.join("\n");
}
