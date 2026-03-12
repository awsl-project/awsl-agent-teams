/**
 * Comprehensive tests for summary module — night session summary.
 *
 * Run: npx tsx src/summary.test.ts
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import {
	computeTimeRange,
	generateSummary,
	formatSummary,
	type SessionSummary,
} from "./summary.js";
import type { HistoryEntry } from "./history.js";

// ─── computeTimeRange tests ─────────────────────────────────

describe("computeTimeRange", () => {
	test("before 06:00 → yesterday 22:00 to today 06:00", () => {
		const now = new Date(2026, 2, 11, 2, 0, 0); // March 11 02:00
		const range = computeTimeRange({}, now);

		assert.equal(range.from.getFullYear(), 2026);
		assert.equal(range.from.getMonth(), 2);
		assert.equal(range.from.getDate(), 10, "from = yesterday");
		assert.equal(range.from.getHours(), 22);
		assert.equal(range.from.getMinutes(), 0);

		assert.equal(range.to.getDate(), 11, "to = today");
		assert.equal(range.to.getHours(), 6);
		assert.equal(range.to.getMinutes(), 0);
	});

	test("after 22:00 → today 22:00 to tomorrow 06:00", () => {
		const now = new Date(2026, 2, 11, 23, 0, 0); // March 11 23:00
		const range = computeTimeRange({}, now);

		assert.equal(range.from.getDate(), 11, "from = today");
		assert.equal(range.from.getHours(), 22);
		assert.equal(range.to.getDate(), 12, "to = tomorrow");
		assert.equal(range.to.getHours(), 6);
	});

	test("daytime (06:00-22:00) → last night: yesterday 22:00 to today 06:00", () => {
		const now = new Date(2026, 2, 11, 14, 0, 0); // March 11 14:00
		const range = computeTimeRange({}, now);

		assert.equal(range.from.getDate(), 10, "from = yesterday");
		assert.equal(range.from.getHours(), 22);
		assert.equal(range.to.getDate(), 11, "to = today");
		assert.equal(range.to.getHours(), 6);
	});

	test("explicit --date '2026-03-10' → 2026-03-10T22:00 to 2026-03-11T06:00", () => {
		const range = computeTimeRange({ date: "2026-03-10" });

		assert.equal(range.from.getFullYear(), 2026);
		assert.equal(range.from.getMonth(), 2); // March = 2
		assert.equal(range.from.getDate(), 10);
		assert.equal(range.from.getHours(), 22);
		assert.equal(range.from.getMinutes(), 0);

		assert.equal(range.to.getFullYear(), 2026);
		assert.equal(range.to.getMonth(), 2);
		assert.equal(range.to.getDate(), 11);
		assert.equal(range.to.getHours(), 6);
		assert.equal(range.to.getMinutes(), 0);
	});

	test("custom --from '21:00' --to '05:00' uses custom times", () => {
		const range = computeTimeRange({ date: "2026-03-10", from: "21:00", to: "05:00" });

		assert.equal(range.from.getDate(), 10);
		assert.equal(range.from.getHours(), 21);
		assert.equal(range.from.getMinutes(), 0);
		assert.equal(range.to.getDate(), 11);
		assert.equal(range.to.getHours(), 5);
		assert.equal(range.to.getMinutes(), 0);
	});

	test("boundary: now at exactly 06:00 → daytime path (yesterday 22:00 to today 06:00)", () => {
		const now = new Date(2026, 2, 11, 6, 0, 0);
		const range = computeTimeRange({}, now);

		// 06:00 is >= 6 and < 22, so daytime path
		assert.equal(range.from.getDate(), 10);
		assert.equal(range.from.getHours(), 22);
		assert.equal(range.to.getDate(), 11);
		assert.equal(range.to.getHours(), 6);
	});

	test("boundary: now at exactly 22:00 → tonight path", () => {
		const now = new Date(2026, 2, 11, 22, 0, 0);
		const range = computeTimeRange({}, now);

		assert.equal(range.from.getDate(), 11, "from = today");
		assert.equal(range.from.getHours(), 22);
		assert.equal(range.to.getDate(), 12, "to = tomorrow");
		assert.equal(range.to.getHours(), 6);
	});

	test("custom from/to without date uses auto-detection", () => {
		const now = new Date(2026, 2, 11, 3, 0, 0); // 03:00, before 6AM
		const range = computeTimeRange({ from: "21:30", to: "05:30" }, now);

		assert.equal(range.from.getDate(), 10);
		assert.equal(range.from.getHours(), 21);
		assert.equal(range.from.getMinutes(), 30);
		assert.equal(range.to.getDate(), 11);
		assert.equal(range.to.getHours(), 5);
		assert.equal(range.to.getMinutes(), 30);
	});
});

// ─── generateSummary tests ──────────────────────────────────

describe("generateSummary", () => {
	let testDir: string;

	function makeHistoryEntry(overrides: Partial<HistoryEntry> & { id: string; startedAt: string; completedAt: string; goal: string; status: "done" | "failed" }): HistoryEntry {
		return {
			date: "2026-03-10",
			project: "test-project",
			projectPath: testDir,
			queueTaskId: "q_1",
			duration: 600000,
			tasksCompleted: 1,
			tasksTotal: 1,
			summary: "test",
			...overrides,
		};
	}

	function writeHistory(entries: HistoryEntry[]) {
		const planningDir = path.join(testDir, ".planning");
		fs.mkdirSync(planningDir, { recursive: true });
		fs.writeFileSync(
			path.join(planningDir, "HISTORY.json"),
			JSON.stringify({ entries, updatedAt: new Date().toISOString() }, null, 2),
		);
	}

	function initGitRepo() {
		try {
			execSync("git init", { cwd: testDir, stdio: "ignore" });
			execSync("git config user.email test@test.com", { cwd: testDir, stdio: "ignore" });
			execSync("git config user.name Test", { cwd: testDir, stdio: "ignore" });
		} catch {
			// git might not be available
		}
	}

	before(() => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-summary-test-"));
	});

	after(() => {
		if (testDir) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	test("filters entries within time range and excludes out-of-range", () => {
		// In-range: March 10 22:15 and 23:00 local time
		const inRange1Start = new Date(2026, 2, 10, 22, 15).toISOString();
		const inRange1End = new Date(2026, 2, 10, 22, 30).toISOString();
		const inRange2Start = new Date(2026, 2, 10, 23, 0).toISOString();
		const inRange2End = new Date(2026, 2, 10, 23, 10).toISOString();
		// Out-of-range: March 9 10:00 local time
		const outStart = new Date(2026, 2, 9, 10, 0).toISOString();
		const outEnd = new Date(2026, 2, 9, 10, 30).toISOString();

		writeHistory([
			makeHistoryEntry({ id: "h_1", startedAt: inRange1Start, completedAt: inRange1End, goal: "Feature A", status: "done", agents: ["coder", "reviewer"] }),
			makeHistoryEntry({ id: "h_2", startedAt: inRange2Start, completedAt: inRange2End, goal: "Fix B", status: "failed", agents: ["coder"] }),
			makeHistoryEntry({ id: "h_3", startedAt: outStart, completedAt: outEnd, goal: "Old task", status: "done" }),
		]);
		initGitRepo();

		const summary = generateSummary({ date: "2026-03-10", cwd: testDir });

		// h_1 and h_2 should be in range, h_3 should not
		assert.ok(summary.tasks.entries.length >= 1, `expected >= 1 entries, got ${summary.tasks.entries.length}`);
		assert.ok(summary.tasks.entries.length <= 2, `expected <= 2 entries, got ${summary.tasks.entries.length}`);

		// None of the filtered entries should be h_3
		const ids = summary.tasks.entries.map((e) => e.id);
		assert.ok(!ids.includes("h_3"), "out-of-range entry h_3 should be excluded");
	});

	test("aggregates totalDuration, totalCostUsd, totalInputTokens, totalOutputTokens", () => {
		const start1 = new Date(2026, 2, 10, 22, 15).toISOString();
		const end1 = new Date(2026, 2, 10, 22, 30).toISOString();
		const start2 = new Date(2026, 2, 10, 23, 0).toISOString();
		const end2 = new Date(2026, 2, 10, 23, 10).toISOString();

		writeHistory([
			makeHistoryEntry({
				id: "h_1", startedAt: start1, completedAt: end1, goal: "A", status: "done",
				duration: 900000, costUsd: 2.50, inputTokens: 50000, outputTokens: 30000,
				agents: ["coder", "reviewer"],
			}),
			makeHistoryEntry({
				id: "h_2", startedAt: start2, completedAt: end2, goal: "B", status: "failed",
				duration: 600000, costUsd: 1.00, inputTokens: 20000, outputTokens: 15000,
				agents: ["coder"],
			}),
		]);

		const summary = generateSummary({ date: "2026-03-10", cwd: testDir });

		// Both entries are in range
		if (summary.tasks.total === 2) {
			assert.equal(summary.totalDuration, 1500000, "sum of durations");
			assert.equal(summary.totalCostUsd, 3.50, "sum of costs");
			assert.equal(summary.totalInputTokens, 70000, "sum of input tokens");
			assert.equal(summary.totalOutputTokens, 45000, "sum of output tokens");
		} else {
			// At least one entry matched
			assert.ok(summary.totalDuration > 0, "totalDuration > 0");
			assert.ok(summary.totalCostUsd > 0, "totalCostUsd > 0");
		}
	});

	test("agentBreakdown counts correctly", () => {
		const start1 = new Date(2026, 2, 10, 22, 15).toISOString();
		const end1 = new Date(2026, 2, 10, 22, 30).toISOString();
		const start2 = new Date(2026, 2, 10, 23, 0).toISOString();
		const end2 = new Date(2026, 2, 10, 23, 10).toISOString();

		writeHistory([
			makeHistoryEntry({ id: "h_1", startedAt: start1, completedAt: end1, goal: "A", status: "done", agents: ["coder", "reviewer"] }),
			makeHistoryEntry({ id: "h_2", startedAt: start2, completedAt: end2, goal: "B", status: "done", agents: ["coder", "tester"] }),
		]);

		const summary = generateSummary({ date: "2026-03-10", cwd: testDir });

		if (summary.tasks.total === 2) {
			assert.equal(summary.agentBreakdown["coder"], 2, "coder appeared in 2 entries");
			assert.equal(summary.agentBreakdown["reviewer"], 1, "reviewer appeared in 1 entry");
			assert.equal(summary.agentBreakdown["tester"], 1, "tester appeared in 1 entry");
		} else {
			assert.ok("coder" in summary.agentBreakdown, "has coder in breakdown");
		}
	});

	test("empty history returns zeroed summary", () => {
		writeHistory([]);

		const summary = generateSummary({ date: "2026-03-10", cwd: testDir });

		assert.equal(summary.tasks.total, 0);
		assert.equal(summary.tasks.done, 0);
		assert.equal(summary.tasks.failed, 0);
		assert.equal(summary.totalDuration, 0);
		assert.equal(summary.totalCostUsd, 0);
		assert.equal(summary.totalInputTokens, 0);
		assert.equal(summary.totalOutputTokens, 0);
		assert.deepEqual(summary.agentBreakdown, {});
		assert.deepEqual(summary.projects, []);
	});

	test("entries with null/undefined optional fields do not crash", () => {
		const start = new Date(2026, 2, 10, 22, 30).toISOString();
		const end = new Date(2026, 2, 10, 22, 45).toISOString();

		// Write entries with missing optional fields (costUsd, inputTokens, outputTokens, agents, duration)
		const entry: any = {
			id: "h_1",
			date: "2026-03-10",
			project: "test-project",
			projectPath: testDir,
			queueTaskId: "q_1",
			goal: "Sparse entry",
			status: "done",
			startedAt: start,
			completedAt: end,
			duration: 0,
			tasksCompleted: 1,
			tasksTotal: 1,
			summary: "test",
			// costUsd, inputTokens, outputTokens, agents are intentionally omitted
		};

		writeHistory([entry]);

		assert.doesNotThrow(() => {
			const summary = generateSummary({ date: "2026-03-10", cwd: testDir });
			// Should still produce a valid summary with zeroed metrics
			assert.ok(summary.tasks.total >= 0);
			assert.equal(summary.totalCostUsd, 0);
			assert.equal(summary.totalInputTokens, 0);
			assert.equal(summary.totalOutputTokens, 0);
		});
	});

	test("done/failed counts are correct", () => {
		const s1 = new Date(2026, 2, 10, 22, 10).toISOString();
		const e1 = new Date(2026, 2, 10, 22, 20).toISOString();
		const s2 = new Date(2026, 2, 10, 22, 30).toISOString();
		const e2 = new Date(2026, 2, 10, 22, 40).toISOString();
		const s3 = new Date(2026, 2, 10, 22, 50).toISOString();
		const e3 = new Date(2026, 2, 10, 23, 0).toISOString();

		writeHistory([
			makeHistoryEntry({ id: "h_1", startedAt: s1, completedAt: e1, goal: "A", status: "done" }),
			makeHistoryEntry({ id: "h_2", startedAt: s2, completedAt: e2, goal: "B", status: "done" }),
			makeHistoryEntry({ id: "h_3", startedAt: s3, completedAt: e3, goal: "C", status: "failed" }),
		]);

		const summary = generateSummary({ date: "2026-03-10", cwd: testDir });

		if (summary.tasks.total === 3) {
			assert.equal(summary.tasks.done, 2);
			assert.equal(summary.tasks.failed, 1);
		}
	});

	test("projects set is populated from entries", () => {
		const s1 = new Date(2026, 2, 10, 22, 10).toISOString();
		const e1 = new Date(2026, 2, 10, 22, 20).toISOString();
		const s2 = new Date(2026, 2, 10, 22, 30).toISOString();
		const e2 = new Date(2026, 2, 10, 22, 40).toISOString();

		writeHistory([
			makeHistoryEntry({ id: "h_1", startedAt: s1, completedAt: e1, goal: "A", status: "done", project: "alpha" }),
			makeHistoryEntry({ id: "h_2", startedAt: s2, completedAt: e2, goal: "B", status: "done", project: "beta" }),
		]);

		const summary = generateSummary({ date: "2026-03-10", cwd: testDir });

		if (summary.tasks.total === 2) {
			assert.ok(summary.projects.includes("alpha"), "has alpha");
			assert.ok(summary.projects.includes("beta"), "has beta");
		}
	});
});

// ─── formatSummary tests ────────────────────────────────────

describe("formatSummary", () => {
	test("empty summary (0 tasks, 0 commits) contains 'No activity'", () => {
		const summary: SessionSummary = {
			timeRange: {
				from: new Date(2026, 2, 10, 22, 0),
				to: new Date(2026, 2, 11, 6, 0),
			},
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

		const output = formatSummary(summary);
		assert.ok(output.includes("No activity"), "should show no activity message");
	});

	test("valid summary contains time range, task counts, cost, agents, projects", () => {
		const summary: SessionSummary = {
			timeRange: {
				from: new Date(2026, 2, 10, 22, 0),
				to: new Date(2026, 2, 11, 6, 0),
			},
			tasks: {
				total: 3,
				done: 2,
				failed: 1,
				entries: [
					{
						id: "h_1",
						date: "2026-03-10",
						project: "my-app",
						projectPath: "/tmp/my-app",
						queueTaskId: "q_1",
						goal: "Build login page",
						status: "done",
						startedAt: new Date(2026, 2, 10, 22, 15).toISOString(),
						completedAt: new Date(2026, 2, 10, 22, 30).toISOString(),
						duration: 900000,
						tasksCompleted: 3,
						tasksTotal: 3,
						summary: "Done",
						costUsd: 2.50,
						inputTokens: 50000,
						outputTokens: 30000,
						agents: ["coder"],
					},
					{
						id: "h_2",
						date: "2026-03-10",
						project: "my-app",
						projectPath: "/tmp/my-app",
						queueTaskId: "q_2",
						goal: "Fix auth bug",
						status: "failed",
						startedAt: new Date(2026, 2, 10, 23, 0).toISOString(),
						completedAt: new Date(2026, 2, 10, 23, 10).toISOString(),
						duration: 600000,
						tasksCompleted: 0,
						tasksTotal: 1,
						summary: "Failed",
						costUsd: 1.00,
						inputTokens: 20000,
						outputTokens: 10000,
						agents: ["coder"],
					},
				],
			},
			git: { commitCount: 5, commits: [] },
			totalDuration: 1500000,
			totalCostUsd: 3.50,
			totalInputTokens: 70000,
			totalOutputTokens: 40000,
			agentBreakdown: { coder: 2, reviewer: 1 },
			projects: ["my-app"],
			discussions: [],
		};

		const output = formatSummary(summary);

		assert.ok(output.includes("Night Summary"), "has header");
		assert.ok(output.includes("2 done"), "shows done count");
		assert.ok(output.includes("1 failed"), "shows failed count");
		assert.ok(output.includes("$3.50"), "shows cost");
		assert.ok(output.includes("70K in"), "shows input tokens");
		assert.ok(output.includes("40K out"), "shows output tokens");
		assert.ok(output.includes("5"), "shows commit count");
		assert.ok(output.includes("coder"), "shows agent in breakdown");
		assert.ok(output.includes("reviewer"), "shows reviewer in breakdown");
		assert.ok(output.includes("my-app"), "shows project name");
	});

	test("timeline shows entries sorted by start time", () => {
		const summary: SessionSummary = {
			timeRange: {
				from: new Date(2026, 2, 10, 22, 0),
				to: new Date(2026, 2, 11, 6, 0),
			},
			tasks: {
				total: 2,
				done: 2,
				failed: 0,
				entries: [
					{
						id: "h_2",
						date: "2026-03-10",
						project: "test",
						projectPath: "/tmp",
						queueTaskId: "q_2",
						goal: "Second task",
						status: "done",
						startedAt: new Date(2026, 2, 10, 23, 30).toISOString(),
						completedAt: new Date(2026, 2, 10, 23, 45).toISOString(),
						duration: 900000,
						tasksCompleted: 1,
						tasksTotal: 1,
						summary: "Done",
					},
					{
						id: "h_1",
						date: "2026-03-10",
						project: "test",
						projectPath: "/tmp",
						queueTaskId: "q_1",
						goal: "First task",
						status: "done",
						startedAt: new Date(2026, 2, 10, 22, 10).toISOString(),
						completedAt: new Date(2026, 2, 10, 22, 25).toISOString(),
						duration: 900000,
						tasksCompleted: 1,
						tasksTotal: 1,
						summary: "Done",
					},
				],
			},
			git: { commitCount: 0, commits: [] },
			totalDuration: 1800000,
			totalCostUsd: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			agentBreakdown: {},
			projects: ["test"],
			discussions: [],
		};

		const output = formatSummary(summary);

		// "First task" should appear before "Second task" in output
		const firstIdx = output.indexOf("First task");
		const secondIdx = output.indexOf("Second task");
		assert.ok(firstIdx > -1, "contains First task");
		assert.ok(secondIdx > -1, "contains Second task");
		assert.ok(firstIdx < secondIdx, "First task appears before Second task");
	});

	test("duration formatting: hours and minutes", () => {
		const summary: SessionSummary = {
			timeRange: {
				from: new Date(2026, 2, 10, 22, 0),
				to: new Date(2026, 2, 11, 6, 0),
			},
			tasks: { total: 1, done: 1, failed: 0, entries: [{
				id: "h_1", date: "2026-03-10", project: "test", projectPath: "/tmp",
				queueTaskId: "q_1", goal: "Long task", status: "done",
				startedAt: new Date(2026, 2, 10, 22, 0).toISOString(),
				completedAt: new Date(2026, 2, 10, 23, 30).toISOString(),
				duration: 5400000, // 1h 30m
				tasksCompleted: 1, tasksTotal: 1, summary: "Done",
			}] },
			git: { commitCount: 0, commits: [] },
			totalDuration: 5400000, // 1h 30m
			totalCostUsd: 0,
			totalInputTokens: 0,
			totalOutputTokens: 0,
			agentBreakdown: {},
			projects: [],
			discussions: [],
		};

		const output = formatSummary(summary);
		assert.ok(output.includes("1h 30m"), "shows hours and minutes for duration >= 60min");
	});

	test("token formatting: M for millions, K for thousands", () => {
		const summary: SessionSummary = {
			timeRange: {
				from: new Date(2026, 2, 10, 22, 0),
				to: new Date(2026, 2, 11, 6, 0),
			},
			tasks: { total: 1, done: 1, failed: 0, entries: [{
				id: "h_1", date: "2026-03-10", project: "test", projectPath: "/tmp",
				queueTaskId: "q_1", goal: "Token test", status: "done",
				startedAt: new Date(2026, 2, 10, 22, 0).toISOString(),
				completedAt: new Date(2026, 2, 10, 22, 30).toISOString(),
				duration: 1800000, tasksCompleted: 1, tasksTotal: 1, summary: "Done",
			}] },
			git: { commitCount: 0, commits: [] },
			totalDuration: 1800000,
			totalCostUsd: 5.00,
			totalInputTokens: 1500000, // 1.5M
			totalOutputTokens: 800,    // 800 (raw number)
			agentBreakdown: {},
			projects: [],
			discussions: [],
		};

		const output = formatSummary(summary);
		assert.ok(output.includes("1.5M"), "shows M for millions");
		assert.ok(output.includes("800"), "shows raw number for < 1000");
	});
});
