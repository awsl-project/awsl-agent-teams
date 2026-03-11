/**
 * Tests for dashboard /api/projects/* endpoints.
 *
 * Run: npx tsx src/dashboard-projects.test.ts
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { startDashboard } from "./dashboard.js";
import { ProjectManager } from "./projects.js";

// ─── Helpers ─────────────────────────────────────────────────

let testDir: string;
let server: http.Server;
let port: number;

function setup(): Promise<void> {
	testDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-dash-test-"));
	(ProjectManager as any)._testRegistryPath = path.join(testDir, "projects.json");
	port = 30000 + Math.floor(Math.random() * 10000);
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error(`Setup timed out — server failed to listen on port ${port}`)), 10000);
		server = startDashboard(testDir, port, "127.0.0.1");
		server.once("listening", () => { clearTimeout(timeout); resolve(); });
		server.once("error", (err) => { clearTimeout(timeout); reject(err); });
	});
}

function teardown(): Promise<void> {
	delete (ProjectManager as any)._testRegistryPath;
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

async function testGetProjects() {
	const res = await request("GET", "/api/projects");
	assertEqual(res.status, 200, "GET /api/projects returns 200");
	assert(Array.isArray(res.data), "response is array");
	assertEqual(res.data.length, 0, "empty initially");
	console.log("✓ testGetProjects");
}

async function testAddProject() {
	const projectPath = path.join(testDir, "proj-a");
	fs.mkdirSync(projectPath, { recursive: true });

	const res = await request("POST", "/api/projects/add", { path: projectPath, name: "Proj A", tags: ["test"] });
	assertEqual(res.status, 200, "POST /api/projects/add returns 200");
	assertEqual(res.data.name, "Proj A", "name matches");
	assert(res.data.path !== undefined, "path is set");
	console.log("✓ testAddProject");
}

async function testAddProjectValidation() {
	// Missing path
	const res = await request("POST", "/api/projects/add", { name: "No Path" });
	assertEqual(res.status, 400, "missing path returns 400");

	// Relative path
	const res2 = await request("POST", "/api/projects/add", { path: "relative/path" });
	assertEqual(res2.status, 400, "relative path returns 400");
	console.log("✓ testAddProjectValidation");
}

async function testRemoveProject() {
	const projectPath = path.join(testDir, "proj-remove");
	fs.mkdirSync(projectPath, { recursive: true });
	ProjectManager.add(projectPath);

	const res = await request("POST", "/api/projects/remove", { path: projectPath });
	assertEqual(res.status, 200, "POST /api/projects/remove returns 200");
	assertEqual(res.data.removed, true, "removed is true");

	// Verify removed
	const list = await request("GET", "/api/projects");
	assertEqual(list.data.length, 1, "only proj-a remains"); // proj-a from previous test
	console.log("✓ testRemoveProject");
}

async function testScanProjects() {
	const scanDir = path.join(testDir, "scan-root");
	fs.mkdirSync(path.join(scanDir, "proj-1", ".planning"), { recursive: true });
	fs.mkdirSync(path.join(scanDir, "proj-2", ".git"), { recursive: true });

	const res = await request("POST", "/api/projects/scan", { dir: scanDir });
	assertEqual(res.status, 200, "POST /api/projects/scan returns 200");
	assert(Array.isArray(res.data), "response is array");
	assert(res.data.length >= 2, `found ${res.data.length} projects`);
	console.log("✓ testScanProjects");
}

async function testScanValidation() {
	const res = await request("POST", "/api/projects/scan", { dir: "relative/dir" });
	assertEqual(res.status, 400, "relative dir returns 400");
	console.log("✓ testScanValidation");
}

async function testProjectQueue() {
	const projectPath = path.join(testDir, "proj-queue");
	const planningDir = path.join(projectPath, ".planning");
	fs.mkdirSync(planningDir, { recursive: true });
	fs.writeFileSync(
		path.join(planningDir, "QUEUE.json"),
		JSON.stringify({ tasks: [{ id: "q_1", goal: "test task", status: "pending" }] })
	);

	const res = await request("GET", `/api/projects/queue?path=${encodeURIComponent(projectPath)}`);
	assertEqual(res.status, 200, "GET /api/projects/queue returns 200");
	assert(Array.isArray(res.data.tasks), "has tasks array");
	assertEqual(res.data.tasks.length, 1, "1 task in queue");
	console.log("✓ testProjectQueue");
}

async function testProjectQueueValidation() {
	const res = await request("GET", "/api/projects/queue?path=relative/path");
	assertEqual(res.status, 400, "relative path returns 400");
	console.log("✓ testProjectQueueValidation");
}

async function testProjectHistory() {
	const projectPath = path.join(testDir, "proj-history");
	const planningDir = path.join(projectPath, ".planning");
	fs.mkdirSync(planningDir, { recursive: true });
	fs.writeFileSync(
		path.join(planningDir, "HISTORY.json"),
		JSON.stringify({ entries: [{ goal: "test", status: "done", date: "2026-01-01" }] })
	);

	const res = await request("GET", `/api/projects/history?path=${encodeURIComponent(projectPath)}`);
	assertEqual(res.status, 200, "GET /api/projects/history returns 200");
	assert(res.data.entries !== undefined, "has entries");
	console.log("✓ testProjectHistory");
}

async function testProjectStats() {
	const projectPath = path.join(testDir, "proj-stats");
	const planningDir = path.join(projectPath, ".planning");
	fs.mkdirSync(planningDir, { recursive: true });
	fs.writeFileSync(
		path.join(planningDir, "HISTORY.json"),
		JSON.stringify({ entries: [{ goal: "test", status: "done", date: "2026-01-01", duration: 100 }] })
	);

	const res = await request("GET", `/api/projects/stats?path=${encodeURIComponent(projectPath)}`);
	assertEqual(res.status, 200, "GET /api/projects/stats returns 200");
	console.log("✓ testProjectStats");
}

async function testProjectQueueAdd() {
	const projectPath = path.join(testDir, "proj-qadd");
	fs.mkdirSync(path.join(projectPath, ".planning"), { recursive: true });

	const res = await request("POST", "/api/projects/queue/add", {
		path: projectPath,
		goal: "Build feature X",
	});
	assertEqual(res.status, 200, "POST /api/projects/queue/add returns 200");
	assert(res.data.id !== undefined, "task has id");
	assertEqual(res.data.goal, "Build feature X", "goal matches");
	console.log("✓ testProjectQueueAdd");
}

async function testProjectQueueAddValidation() {
	// Missing goal
	const res = await request("POST", "/api/projects/queue/add", {
		path: testDir,
	});
	assertEqual(res.status, 400, "missing goal returns 400");

	// Relative path
	const res2 = await request("POST", "/api/projects/queue/add", {
		path: "relative",
		goal: "test",
	});
	assertEqual(res2.status, 400, "relative path returns 400");
	console.log("✓ testProjectQueueAddValidation");
}

async function testProjectQueueClear() {
	const projectPath = path.join(testDir, "proj-qclear");
	const planningDir = path.join(projectPath, ".planning");
	fs.mkdirSync(planningDir, { recursive: true });
	fs.writeFileSync(
		path.join(planningDir, "QUEUE.json"),
		JSON.stringify({ tasks: [{ id: "q_1", goal: "test", status: "pending" }] })
	);

	const res = await request("POST", "/api/projects/queue/clear", { path: projectPath });
	assertEqual(res.status, 200, "POST /api/projects/queue/clear returns 200");
	assertEqual(res.data.cleared, true, "cleared is true");
	console.log("✓ testProjectQueueClear");
}

// ─── Runner ──────────────────────────────────────────────────

const tests = [
	testGetProjects,
	testAddProject,
	testAddProjectValidation,
	testRemoveProject,
	testScanProjects,
	testScanValidation,
	testProjectQueue,
	testProjectQueueValidation,
	testProjectHistory,
	testProjectStats,
	testProjectQueueAdd,
	testProjectQueueAddValidation,
	testProjectQueueClear,
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
	if (failed > 0) process.exit(1);
}

run().catch((e) => {
	console.error("Test setup failed:", e);
	process.exit(1);
});
