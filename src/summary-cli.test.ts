/**
 * Tests for summary CLI integration.
 *
 * Verifies that the summary command is wired into cli.ts correctly
 * and that index.ts exports all summary types/functions.
 *
 * Run: npx tsx src/summary-cli.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── Test helpers ────────────────────────────────────────────

function assert(condition: boolean, msg: string) {
	if (!condition) throw new Error(`FAIL: ${msg}`);
}

function assertIncludes(str: string, substr: string, msg: string) {
	if (!str.includes(substr)) throw new Error(`FAIL: ${msg} — expected to include ${JSON.stringify(substr)}`);
}

// ─── Test: index.ts exports summary types ────────────────────

async function testIndexExportsSummary() {
	// Dynamic import to verify exports exist
	const mod = await import("./index.js");
	assert(typeof mod.generateSummary === "function", "generateSummary exported");
	assert(typeof mod.formatSummary === "function", "formatSummary exported");
	assert(typeof mod.computeTimeRange === "function", "computeTimeRange exported");
	console.log("✓ testIndexExportsSummary");
}

// ─── Test: cli.ts usage includes summary ─────────────────────

function testCliUsageIncludesSummary() {
	const cliSource = fs.readFileSync(path.join(import.meta.dirname, "cli.ts"), "utf-8");
	assertIncludes(cliSource, "summary", "cli.ts mentions summary command");
	assertIncludes(cliSource, "--all-projects", "cli.ts mentions --all-projects flag");
	assertIncludes(cliSource, "generateSummary", "cli.ts imports generateSummary");
	assertIncludes(cliSource, "formatSummary", "cli.ts imports formatSummary");
	console.log("✓ testCliUsageIncludesSummary");
}

// ─── Test: cli summary command runs without error ────────────

async function testCliSummaryRuns() {
	const { execSync } = await import("node:child_process");
	// Run awsl summary with --date pointing to a date with no history.
	// Should exit 0 and print "No activity found" or similar.
	// We use a temp dir with empty history to avoid depending on real data.
	const os = await import("node:os");
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-cli-summary-"));
	const planDir = path.join(tmpDir, ".planning");
	fs.mkdirSync(planDir, { recursive: true });
	fs.writeFileSync(
		path.join(planDir, "HISTORY.json"),
		JSON.stringify({ entries: [], updatedAt: new Date().toISOString() }),
	);

	try {
		const cliPath = path.resolve(import.meta.dirname, "..", "dist", "cli.js");
		const output = execSync(
			`node "${cliPath}" summary --date 2020-01-01 --cwd "${tmpDir}"`,
			{ encoding: "utf-8", timeout: 10000 },
		);
		assertIncludes(output, "No activity found", "empty summary output");
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}
	console.log("✓ testCliSummaryRuns");
}

// ─── Run all tests ───────────────────────────────────────────

const tests: Array<() => void | Promise<void>> = [
	testIndexExportsSummary,
	testCliUsageIncludesSummary,
	testCliSummaryRuns,
];

let passed = 0;
let failed = 0;
for (const test of tests) {
	try {
		await test();
		passed++;
	} catch (e: any) {
		console.error(`✗ ${test.name}: ${e.message}`);
		failed++;
	}
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
process.exit(failed > 0 ? 1 : 0);
