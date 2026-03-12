/**
 * Tests for dashboard discussion mode endpoints:
 * - POST /api/queue/add with mode="discuss"
 * - GET /api/discussions
 *
 * Run: npx tsx src/dashboard-discuss.test.ts
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { startDashboard } from "./dashboard.js";

// ─── Helpers ─────────────────────────────────────────────────

let testDir: string;
let server: http.Server;
let port: number;

function setup(): Promise<void> {
	testDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-dash-discuss-"));
	fs.mkdirSync(path.join(testDir, ".planning"), { recursive: true });
	port = 30000 + Math.floor(Math.random() * 10000);
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error(`Setup timed out`)), 10000);
		server = startDashboard(testDir, port, "127.0.0.1");
		server.once("listening", () => { clearTimeout(timeout); resolve(); });
		server.once("error", (err) => { clearTimeout(timeout); reject(err); });
	});
}

function teardown(): Promise<void> {
	fs.rmSync(testDir, { recursive: true, force: true });
	return new Promise((resolve) => {
		const timeout = setTimeout(() => resolve(), 5000);
		server.close(() => { clearTimeout(timeout); resolve(); });
	});
}

function request(method: string, urlPath: string, body?: unknown): Promise<{ status: number; data: any }> {
	return new Promise((resolve, reject) => {
		const payload = body ? JSON.stringify(body) : undefined;
		const req = http.request(
			{
				hostname: "127.0.0.1",
				port,
				path: urlPath,
				method,
				headers: payload
					? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
					: {},
			},
			(res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () => {
					try {
						resolve({ status: res.statusCode!, data: JSON.parse(data) });
					} catch {
						resolve({ status: res.statusCode!, data });
					}
				});
			}
		);
		req.on("error", reject);
		if (payload) req.write(payload);
		req.end();
	});
}

function assert(condition: boolean, msg: string) {
	if (!condition) throw new Error(`FAIL: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
	if (actual !== expected) throw new Error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─── Tests ───────────────────────────────────────────────────

async function testQueueAddWithMode() {
	const res = await request("POST", "/api/queue/add", {
		goal: "What is the best testing strategy?",
		mode: "discuss",
		discussRounds: 2,
	});
	assertEqual(res.status, 200, "POST /api/queue/add with mode returns 200");
	assertEqual(res.data.goal, "What is the best testing strategy?", "goal matches");
	assertEqual(res.data.mode, "discuss", "mode is discuss");
	assert(res.data.id !== undefined, "task has id");
	console.log("✓ testQueueAddWithMode");
}

async function testQueueAddDefaultMode() {
	const res = await request("POST", "/api/queue/add", {
		goal: "Build feature Y",
	});
	assertEqual(res.status, 200, "POST /api/queue/add without mode returns 200");
	assertEqual(res.data.goal, "Build feature Y", "goal matches");
	// mode should be undefined (defaults to build)
	assert(res.data.mode === undefined || res.data.mode === "build", "mode is undefined or build");
	console.log("✓ testQueueAddDefaultMode");
}

async function testGetDiscussionsEmpty() {
	const res = await request("GET", "/api/discussions");
	assertEqual(res.status, 200, "GET /api/discussions returns 200");
	assert(Array.isArray(res.data), "response is array");
	assertEqual(res.data.length, 0, "no discussions initially");
	console.log("✓ testGetDiscussionsEmpty");
}

async function testGetDiscussionsWithData() {
	// Seed history with a discussion entry
	const historyPath = path.join(testDir, ".planning", "HISTORY.json");
	const historyData = {
		entries: [
			{
				queueTaskId: "q_1",
				goal: "What is TDD?",
				mode: "discuss",
				answer: "TDD is test-driven development...",
				agents: ["architect", "coder"],
				completedAt: "2026-03-10T10:00:00Z",
				duration: 30,
				costUsd: 0.05,
			},
			{
				queueTaskId: "q_2",
				goal: "Build login page",
				mode: "build",
				completedAt: "2026-03-10T11:00:00Z",
				duration: 120,
			},
			{
				queueTaskId: "q_3",
				goal: "Explain microservices",
				mode: "discuss",
				answer: "Microservices are...",
				agents: ["architect"],
				completedAt: "2026-03-10T12:00:00Z",
				duration: 20,
				costUsd: 0.03,
			},
		],
	};
	fs.writeFileSync(historyPath, JSON.stringify(historyData));

	const res = await request("GET", "/api/discussions");
	assertEqual(res.status, 200, "GET /api/discussions returns 200");
	assert(Array.isArray(res.data), "response is array");
	assertEqual(res.data.length, 2, "only discuss entries returned");
	assertEqual(res.data[0].question, "What is TDD?", "first question matches");
	assertEqual(res.data[0].answer, "TDD is test-driven development...", "first answer matches");
	assertEqual(res.data[1].question, "Explain microservices", "second question matches");
	assertEqual(res.data[1].costUsd, 0.03, "costUsd propagated");
	console.log("✓ testGetDiscussionsWithData");
}

// ─── Runner ──────────────────────────────────────────────────

const tests = [
	testQueueAddWithMode,
	testQueueAddDefaultMode,
	testGetDiscussionsEmpty,
	testGetDiscussionsWithData,
];

async function run() {
	await setup();
	let passed = 0;
	let failed = 0;
	try {
		for (const test of tests) {
			try {
				await test();
				passed++;
			} catch (e: any) {
				console.error(`✗ ${test.name}: ${e.message}`);
				failed++;
			}
		}
	} finally {
		await teardown();
	}
	console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
	process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
	console.error("Test setup failed:", e);
	process.exit(1);
});
