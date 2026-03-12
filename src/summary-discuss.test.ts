/**
 * Tests for discussion support in summary module.
 *
 * Verifies that SessionSummary includes discussions and formatSummary renders them.
 *
 * Run: npx tsx src/summary-discuss.test.ts
 */

import { generateSummary, formatSummary, computeTimeRange, type SessionSummary } from "./summary.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ─── Test helpers ────────────────────────────────────────────

function assert(condition: boolean, msg: string) {
	if (!condition) throw new Error(`FAIL: ${msg}`);
}

function assertIncludes(str: string, substr: string, msg: string) {
	if (!str.includes(substr)) throw new Error(`FAIL: ${msg} — expected to include ${JSON.stringify(substr)}`);
}

function assertNotIncludes(str: string, substr: string, msg: string) {
	if (str.includes(substr)) throw new Error(`FAIL: ${msg} — expected NOT to include ${JSON.stringify(substr)}`);
}

// ─── Test: SessionSummary has discussions field ───────────────

function testSessionSummaryHasDiscussions() {
	const summary: SessionSummary = {
		timeRange: { from: new Date(), to: new Date() },
		tasks: { total: 0, done: 0, failed: 0, entries: [] },
		git: { commitCount: 0, commits: [] },
		totalDuration: 0,
		totalCostUsd: 0,
		totalInputTokens: 0,
		totalOutputTokens: 0,
		agentBreakdown: {},
		projects: [],
		discussions: [],
	};
	assert(Array.isArray(summary.discussions), "discussions is an array");
	assert(summary.discussions.length === 0, "discussions starts empty");
	console.log("✓ testSessionSummaryHasDiscussions");
}

// ─── Test: generateSummary returns discussions from discuss-mode entries ──

function testGenerateSummaryExtractsDiscussions() {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-summary-disc-"));
	const planDir = path.join(tmpDir, ".planning");
	fs.mkdirSync(planDir, { recursive: true });

	const now = new Date();
	const entry = {
		id: "disc-1",
		date: now.toISOString().slice(0, 10),
		project: "test",
		projectPath: tmpDir,
		queueTaskId: "q1",
		goal: "Should we use Redis or Postgres?",
		status: "done" as const,
		startedAt: now.toISOString(),
		completedAt: now.toISOString(),
		duration: 60000,
		tasksCompleted: 1,
		tasksTotal: 1,
		summary: "discussion",
		agents: ["architect", "coder", "reviewer"],
		costUsd: 0.42,
		mode: "discuss" as const,
		answer: "Use Postgres for the primary store with Redis as a cache layer.",
	};

	fs.writeFileSync(
		path.join(planDir, "HISTORY.json"),
		JSON.stringify({ entries: [entry], updatedAt: now.toISOString() }),
	);

	try {
		// Use a time range that includes the entry
		const summary = generateSummary({
			from: "00:00",
			to: "23:59",
			date: now.toISOString().slice(0, 10),
			cwd: tmpDir,
		});

		assert(Array.isArray(summary.discussions), "discussions is an array");
		assert(summary.discussions.length === 1, `Expected 1 discussion, got ${summary.discussions.length}`);

		const d = summary.discussions[0];
		assert(d.question === "Should we use Redis or Postgres?", "question matches goal");
		assert(d.answer === "Use Postgres for the primary store with Redis as a cache layer.", "answer matches");
		assert(d.agents.length === 3, "3 agents");
		assert(d.duration === 60000, "duration matches");
		assert(d.costUsd === 0.42, "cost matches");
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}

	console.log("✓ testGenerateSummaryExtractsDiscussions");
}

// ─── Test: generateSummary skips build-mode entries in discussions ──

function testGenerateSummarySkipsBuildEntries() {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-summary-disc2-"));
	const planDir = path.join(tmpDir, ".planning");
	fs.mkdirSync(planDir, { recursive: true });

	const now = new Date();
	const buildEntry = {
		id: "build-1",
		date: now.toISOString().slice(0, 10),
		project: "test",
		projectPath: tmpDir,
		queueTaskId: "q2",
		goal: "Build the auth module",
		status: "done" as const,
		startedAt: now.toISOString(),
		completedAt: now.toISOString(),
		duration: 120000,
		tasksCompleted: 5,
		tasksTotal: 5,
		summary: "built stuff",
		mode: "build" as const,
	};

	fs.writeFileSync(
		path.join(planDir, "HISTORY.json"),
		JSON.stringify({ entries: [buildEntry], updatedAt: now.toISOString() }),
	);

	try {
		const summary = generateSummary({
			from: "00:00",
			to: "23:59",
			date: now.toISOString().slice(0, 10),
			cwd: tmpDir,
		});
		assert(summary.discussions.length === 0, "No discussions for build entries");
	} finally {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	}

	console.log("✓ testGenerateSummarySkipsBuildEntries");
}

// ─── Test: formatSummary renders Discussions section ──────────

function testFormatSummaryRendersDiscussions() {
	const summary: SessionSummary = {
		timeRange: { from: new Date("2026-03-10T22:00:00"), to: new Date("2026-03-11T06:00:00") },
		tasks: { total: 1, done: 1, failed: 0, entries: [] },
		git: { commitCount: 0, commits: [] },
		totalDuration: 60000,
		totalCostUsd: 0.42,
		totalInputTokens: 10000,
		totalOutputTokens: 5000,
		agentBreakdown: {},
		projects: [],
		discussions: [
			{
				question: "Should we use Redis or Postgres?",
				answer: "Use Postgres for the primary store with Redis as a cache layer.",
				agents: ["architect", "coder", "reviewer"],
				duration: 60000,
				costUsd: 0.42,
			},
		],
	};

	const output = formatSummary(summary);
	assertIncludes(output, "Discussions:", "has Discussions section header");
	assertIncludes(output, "Q: Should we use Redis or Postgres?", "has question");
	assertIncludes(output, "A: Use Postgres for the primary store", "has answer preview");
	assertIncludes(output, "3 agents", "has agent count");
	assertIncludes(output, "$0.42", "has cost");

	console.log("✓ testFormatSummaryRendersDiscussions");
}

// ─── Test: formatSummary truncates long answers ──────────────

function testFormatSummaryTruncatesLongAnswer() {
	const longAnswer = "A".repeat(200);
	const summary: SessionSummary = {
		timeRange: { from: new Date("2026-03-10T22:00:00"), to: new Date("2026-03-11T06:00:00") },
		tasks: { total: 1, done: 1, failed: 0, entries: [] },
		git: { commitCount: 0, commits: [] },
		totalDuration: 60000,
		totalCostUsd: 0.50,
		totalInputTokens: 10000,
		totalOutputTokens: 5000,
		agentBreakdown: {},
		projects: [],
		discussions: [
			{
				question: "Long question",
				answer: longAnswer,
				agents: ["architect", "coder"],
				duration: 30000,
				costUsd: 0.50,
			},
		],
	};

	const output = formatSummary(summary);
	assertIncludes(output, "...", "truncated answer has ellipsis");
	// The answer line should have at most 150 chars of the answer + "..."
	const answerLine = output.split("\n").find(l => l.includes("A: "));
	assert(answerLine !== undefined, "answer line exists");
	// 150 A's + "..." = the preview
	assertIncludes(answerLine!, "A".repeat(150) + "...", "truncated to 150 chars");

	console.log("✓ testFormatSummaryTruncatesLongAnswer");
}

// ─── Test: formatSummary omits Discussions when empty ────────

function testFormatSummaryOmitsEmptyDiscussions() {
	const summary: SessionSummary = {
		timeRange: { from: new Date("2026-03-10T22:00:00"), to: new Date("2026-03-11T06:00:00") },
		tasks: { total: 1, done: 1, failed: 0, entries: [{
			id: "b1",
			date: "2026-03-10",
			project: "test",
			projectPath: "/tmp",
			queueTaskId: "q1",
			goal: "Build something",
			status: "done",
			startedAt: "2026-03-10T23:00:00Z",
			completedAt: "2026-03-10T23:30:00Z",
			duration: 1800000,
			tasksCompleted: 1,
			tasksTotal: 1,
			summary: "done",
		}] },
		git: { commitCount: 1, commits: [] },
		totalDuration: 1800000,
		totalCostUsd: 1.00,
		totalInputTokens: 50000,
		totalOutputTokens: 20000,
		agentBreakdown: {},
		projects: [],
		discussions: [],
	};

	const output = formatSummary(summary);
	assertNotIncludes(output, "Discussions:", "no Discussions section when empty");

	console.log("✓ testFormatSummaryOmitsEmptyDiscussions");
}

// ─── Run all tests ───────────────────────────────────────────

const tests: Array<() => void | Promise<void>> = [
	testSessionSummaryHasDiscussions,
	testGenerateSummaryExtractsDiscussions,
	testGenerateSummarySkipsBuildEntries,
	testFormatSummaryRendersDiscussions,
	testFormatSummaryTruncatesLongAnswer,
	testFormatSummaryOmitsEmptyDiscussions,
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
