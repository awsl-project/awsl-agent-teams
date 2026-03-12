/**
 * Tests for dashboard /api/agents endpoints.
 *
 * Run: npx tsx src/dashboard-agents.test.ts
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
	testDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-dash-agents-test-"));
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

async function testGetAgentsReturnsBuiltins() {
	const res = await request("GET", "/api/agents");
	assertEqual(res.status, 200, "GET /api/agents returns 200");
	assert(Array.isArray(res.data), "response is array");
	assert(res.data.length >= 5, "includes builtins (planner, architect, coder, reviewer, tester)");
	const names = res.data.map((a: any) => a.name);
	assert(names.includes("planner"), "has planner");
	assert(names.includes("coder"), "has coder");
	console.log("✓ testGetAgentsReturnsBuiltins");
}

async function testGetAgentByName() {
	const res = await request("GET", "/api/agents?name=coder");
	assertEqual(res.status, 200, "GET /api/agents?name=coder returns 200");
	assertEqual(res.data.name, "coder", "name is coder");
	assertEqual(res.data.source, "builtin", "source is builtin");
	console.log("✓ testGetAgentByName");
}

async function testGetAgentByNameNotFound() {
	const res = await request("GET", "/api/agents?name=nonexistent");
	assertEqual(res.status, 404, "GET /api/agents?name=nonexistent returns 404");
	console.log("✓ testGetAgentByNameNotFound");
}

async function testCreateAgent() {
	const res = await request("POST", "/api/agents", {
		name: "my-agent",
		role: "coder",
		description: "A custom agent",
		systemPrompt: "You are a custom agent.",
	});
	assertEqual(res.status, 201, "POST /api/agents returns 201");
	assertEqual(res.data.name, "my-agent", "name matches");
	assertEqual(res.data.role, "coder", "role matches");
	assertEqual(res.data.systemPrompt, "You are a custom agent.", "systemPrompt matches");
	assertEqual(res.data.source, "file", "source is file");

	// Verify file was created
	const agentFile = path.join(testDir, "agents", "my-agent.md");
	assert(fs.existsSync(agentFile), "agent file exists on disk");
	console.log("✓ testCreateAgent");
}

async function testCreateAgentMissingName() {
	const res = await request("POST", "/api/agents", {
		role: "coder",
		systemPrompt: "test",
	});
	assertEqual(res.status, 400, "missing name returns 400");
	console.log("✓ testCreateAgentMissingName");
}

async function testCreateAgentInvalidName() {
	const res = await request("POST", "/api/agents", {
		name: "Invalid Name!",
		systemPrompt: "test",
	});
	assertEqual(res.status, 400, "invalid name returns 400");
	console.log("✓ testCreateAgentInvalidName");
}

async function testCreateAgentMissingPrompt() {
	const res = await request("POST", "/api/agents", {
		name: "no-prompt",
	});
	assertEqual(res.status, 400, "missing systemPrompt returns 400");
	console.log("✓ testCreateAgentMissingPrompt");
}

async function testCreateAgentDuplicate() {
	// my-agent was created in testCreateAgent
	const res = await request("POST", "/api/agents", {
		name: "my-agent",
		systemPrompt: "duplicate",
	});
	assertEqual(res.status, 409, "duplicate name returns 409");
	console.log("✓ testCreateAgentDuplicate");
}

async function testUpdateAgent() {
	const res = await request("PUT", "/api/agents", {
		name: "my-agent",
		description: "Updated description",
		systemPrompt: "Updated prompt.",
	});
	assertEqual(res.status, 200, "PUT /api/agents returns 200");
	assertEqual(res.data.description, "Updated description", "description updated");
	assertEqual(res.data.systemPrompt, "Updated prompt.", "systemPrompt updated");

	// Verify via GET
	const check = await request("GET", "/api/agents?name=my-agent");
	assertEqual(check.data.description, "Updated description", "GET confirms update");
	console.log("✓ testUpdateAgent");
}

async function testUpdateAgentNotFound() {
	const res = await request("PUT", "/api/agents", {
		name: "nonexistent-agent",
		systemPrompt: "test",
	});
	assertEqual(res.status, 404, "update nonexistent returns 404");
	console.log("✓ testUpdateAgentNotFound");
}

async function testDeleteAgent() {
	const res = await request("DELETE", "/api/agents?name=my-agent");
	assertEqual(res.status, 200, "DELETE /api/agents returns 200");
	assertEqual(res.data.deleted, true, "deleted is true");

	// Verify gone
	const check = await request("GET", "/api/agents?name=my-agent");
	assertEqual(check.status, 404, "agent no longer found");
	console.log("✓ testDeleteAgent");
}

async function testDeleteBuiltinAgent() {
	const res = await request("DELETE", "/api/agents?name=coder");
	assertEqual(res.status, 400, "cannot delete builtin returns 400");
	console.log("✓ testDeleteBuiltinAgent");
}

async function testDeleteAgentNotFound() {
	const res = await request("DELETE", "/api/agents?name=no-such-agent");
	assertEqual(res.status, 404, "delete nonexistent returns 404");
	console.log("✓ testDeleteAgentNotFound");
}

async function testDeleteAgentMissingName() {
	const res = await request("DELETE", "/api/agents");
	assertEqual(res.status, 400, "missing name returns 400");
	console.log("✓ testDeleteAgentMissingName");
}

async function testGetAgentsIncludesCustom() {
	// Create a custom agent first
	await request("POST", "/api/agents", {
		name: "custom-lister",
		role: "reviewer",
		description: "For list test",
		systemPrompt: "You review code.",
	});
	const res = await request("GET", "/api/agents");
	const names = res.data.map((a: any) => a.name);
	assert(names.includes("custom-lister"), "custom agent appears in list");
	assert(names.includes("planner"), "builtins still present");
	console.log("✓ testGetAgentsIncludesCustom");
}

// ─── WaveTaskDetail & WaveInfo Tests (no server needed) ──────

import type { WaveTaskDetail, WaveInfo } from "./history.js";

function testWaveTaskDetailShape() {
	const detail: WaveTaskDetail = {
		id: "task_1",
		description: "Implement login",
		assignee: "coder",
		status: "done",
		files: ["src/auth.ts", "src/auth.test.ts"],
		result: "Login implemented",
	};
	assertEqual(detail.id, "task_1", "WaveTaskDetail id set");
	assertEqual(detail.description, "Implement login", "WaveTaskDetail description set");
	assertEqual(detail.assignee, "coder", "WaveTaskDetail assignee set");
	assertEqual(detail.status, "done", "WaveTaskDetail status set");
	assert(Array.isArray(detail.files), "WaveTaskDetail files is array");
	assertEqual(detail.files!.length, 2, "WaveTaskDetail files has 2 entries");
	assertEqual(detail.result, "Login implemented", "WaveTaskDetail result set");
	assertEqual(detail.error, undefined, "WaveTaskDetail error is undefined when not set");
	console.log("✓ testWaveTaskDetailShape");
}

function testWaveTaskDetailFailedWithError() {
	const detail: WaveTaskDetail = {
		id: "task_2",
		description: "Fix bug",
		assignee: "coder",
		status: "failed",
		error: "Compilation error",
	};
	assertEqual(detail.status, "failed", "failed status");
	assertEqual(detail.error, "Compilation error", "error message set");
	assertEqual(detail.result, undefined, "result undefined on failure");
	assertEqual(detail.files, undefined, "files optional");
	console.log("✓ testWaveTaskDetailFailedWithError");
}

function testWaveTaskDetailVerifiedStatus() {
	const detail: WaveTaskDetail = {
		id: "task_3",
		description: "Review code",
		assignee: "reviewer",
		status: "verified",
		result: "All checks pass",
	};
	assertEqual(detail.status, "verified", "verified status");
	console.log("✓ testWaveTaskDetailVerifiedStatus");
}

function testWaveInfoEnrichmentWithTasks() {
	const tasks: WaveTaskDetail[] = [
		{ id: "t1", description: "Build API", assignee: "coder", status: "done", files: ["src/api.ts"], result: "API built" },
		{ id: "t2", description: "Test API", assignee: "tester", status: "verified", result: "All tests pass" },
	];
	const wave: WaveInfo = {
		wave: 1,
		taskIds: ["t1", "t2"],
		agents: ["coder", "tester"],
		parallel: 2,
		tasks,
		status: "success",
	};
	assertEqual(wave.tasks!.length, 2, "wave has 2 tasks");
	assertEqual(wave.tasks![0].id, "t1", "first task id");
	assertEqual(wave.tasks![0].description, "Build API", "first task description");
	assertEqual(wave.tasks![0].assignee, "coder", "first task assignee");
	assertEqual(wave.tasks![0].status, "done", "first task status");
	assertEqual(wave.tasks![1].status, "verified", "second task status");
	assertEqual(wave.status, "success", "wave status is success");
	console.log("✓ testWaveInfoEnrichmentWithTasks");
}

function testWaveInfoResultTruncation() {
	const longResult = "A".repeat(300);
	const truncated = longResult.slice(0, 200);
	const tasks: WaveTaskDetail[] = [
		{ id: "t1", description: "D", assignee: "coder", status: "done", result: truncated },
	];
	assertEqual(tasks[0].result!.length, 200, "result truncated to 200 chars");
	// Verify the long error also truncates
	const longError = "E".repeat(500);
	const truncErr = longError.slice(0, 200);
	const failTask: WaveTaskDetail = { id: "t2", description: "D", assignee: "coder", status: "failed", error: truncErr };
	assertEqual(failTask.error!.length, 200, "error truncated to 200 chars");
	console.log("✓ testWaveInfoResultTruncation");
}

function testWaveStatusAllSuccess() {
	const tasks: WaveTaskDetail[] = [
		{ id: "t1", description: "D", assignee: "coder", status: "done" },
		{ id: "t2", description: "D", assignee: "coder", status: "verified" },
	];
	const allDone = tasks.every(t => t.status === "done" || t.status === "verified");
	const allFailed = tasks.every(t => t.status === "failed");
	const status = allDone ? "success" : allFailed ? "failed" : "partial";
	assertEqual(status, "success", "all done/verified → success");
	console.log("✓ testWaveStatusAllSuccess");
}

function testWaveStatusAllFailed() {
	const tasks: WaveTaskDetail[] = [
		{ id: "t1", description: "D", assignee: "coder", status: "failed", error: "err1" },
		{ id: "t2", description: "D", assignee: "tester", status: "failed", error: "err2" },
	];
	const allDone = tasks.every(t => t.status === "done" || t.status === "verified");
	const allFailed = tasks.every(t => t.status === "failed");
	const status = allDone ? "success" : allFailed ? "failed" : "partial";
	assertEqual(status, "failed", "all failed → failed");
	console.log("✓ testWaveStatusAllFailed");
}

function testWaveStatusPartialMixed() {
	const tasks: WaveTaskDetail[] = [
		{ id: "t1", description: "D", assignee: "coder", status: "done" },
		{ id: "t2", description: "D", assignee: "coder", status: "failed" },
		{ id: "t3", description: "D", assignee: "tester", status: "verified" },
	];
	const allDone = tasks.every(t => t.status === "done" || t.status === "verified");
	const allFailed = tasks.every(t => t.status === "failed");
	const status = allDone ? "success" : allFailed ? "failed" : "partial";
	assertEqual(status, "partial", "mixed → partial");
	console.log("✓ testWaveStatusPartialMixed");
}

function testWaveInfoBackwardCompatNoTasks() {
	const wave: WaveInfo = {
		wave: 1,
		taskIds: ["task_1"],
		agents: ["coder"],
		parallel: 1,
	};
	assertEqual(wave.tasks, undefined, "tasks undefined for old data");
	assertEqual(wave.status, undefined, "status undefined for old data");
	// Core fields still accessible
	assertEqual(wave.wave, 1, "wave number present");
	assertEqual(wave.taskIds.length, 1, "taskIds present");
	assertEqual(wave.agents[0], "coder", "agents present");
	assertEqual(wave.parallel, 1, "parallel present");
	console.log("✓ testWaveInfoBackwardCompatNoTasks");
}

function testWaveInfoMultipleWaves() {
	const waves: WaveInfo[] = [
		{
			wave: 1, taskIds: ["t1"], agents: ["coder"], parallel: 1,
			tasks: [{ id: "t1", description: "D", assignee: "coder", status: "done", result: "OK" }],
			status: "success",
		},
		{
			wave: 2, taskIds: ["t2", "t3"], agents: ["coder", "tester"], parallel: 2,
			tasks: [
				{ id: "t2", description: "D", assignee: "coder", status: "done" },
				{ id: "t3", description: "D", assignee: "tester", status: "failed", error: "timeout" },
			],
			status: "partial",
		},
	];
	assertEqual(waves.length, 2, "two waves");
	assertEqual(waves[0].status, "success", "wave 1 success");
	assertEqual(waves[1].status, "partial", "wave 2 partial");
	assertEqual(waves[1].tasks!.length, 2, "wave 2 has 2 tasks");
	console.log("✓ testWaveInfoMultipleWaves");
}

// ─── Templates & Preview Tests ───────────────────────────────

async function testGetTemplates() {
	const res = await request("GET", "/api/agents/templates");
	assertEqual(res.status, 200, "GET /api/agents/templates returns 200");
	assert(Array.isArray(res.data), "response is array");
	assert(res.data.length >= 7, "at least 7 templates (coder, reviewer, architect, tester, planner, devops, documenter)");
	const names = res.data.map((t: any) => t.name);
	assert(names.includes("coder"), "has coder template");
	assert(names.includes("devops"), "has devops template");
	assert(names.includes("documenter"), "has documenter template");
	// Each template should have name, description, prompt
	for (const t of res.data) {
		assert(typeof t.name === "string" && t.name.length > 0, `template has name: ${t.name}`);
		assert(typeof t.description === "string" && t.description.length > 0, `template has description: ${t.name}`);
		assert(typeof t.prompt === "string" && t.prompt.length > 0, `template has prompt: ${t.name}`);
	}
	console.log("✓ testGetTemplates");
}

async function testPreviewAgent() {
	const res = await request("POST", "/api/agents/preview", {
		name: "coder",
	});
	assertEqual(res.status, 200, "POST /api/agents/preview returns 200");
	assert(typeof res.data.composed === "string", "has composed field");
	assert(res.data.composed.includes("# Agent: coder"), "composed includes agent header");
	assert(typeof res.data.sections === "object", "has sections field");
	assert(typeof res.data.sections.base === "string", "sections.base is string");
	assert(typeof res.data.sections.skills === "string", "sections.skills is string");
	assert(typeof res.data.sections.team === "string", "sections.team is string");
	// Team section should list other agents (not coder itself)
	assert(!res.data.sections.team.includes("**coder**"), "team does not include self");
	assert(res.data.sections.team.includes("planner"), "team includes planner");
	console.log("✓ testPreviewAgent");
}

async function testPreviewAgentNotFound() {
	const res = await request("POST", "/api/agents/preview", {
		name: "nonexistent-agent",
	});
	assertEqual(res.status, 404, "preview nonexistent returns 404");
	console.log("✓ testPreviewAgentNotFound");
}

async function testPreviewAgentMissingName() {
	const res = await request("POST", "/api/agents/preview", {});
	assertEqual(res.status, 400, "preview without name returns 400");
	console.log("✓ testPreviewAgentMissingName");
}

// ─── Runner ──────────────────────────────────────────────────

// Wave tests run before server setup (pure unit tests)
const waveTests = [
	testWaveTaskDetailShape,
	testWaveTaskDetailFailedWithError,
	testWaveTaskDetailVerifiedStatus,
	testWaveInfoEnrichmentWithTasks,
	testWaveInfoResultTruncation,
	testWaveStatusAllSuccess,
	testWaveStatusAllFailed,
	testWaveStatusPartialMixed,
	testWaveInfoBackwardCompatNoTasks,
	testWaveInfoMultipleWaves,
];

const tests = [
	testGetAgentsReturnsBuiltins,
	testGetAgentByName,
	testGetAgentByNameNotFound,
	testCreateAgent,
	testCreateAgentMissingName,
	testCreateAgentInvalidName,
	testCreateAgentMissingPrompt,
	testCreateAgentDuplicate,
	testUpdateAgent,
	testUpdateAgentNotFound,
	testDeleteAgent,
	testDeleteBuiltinAgent,
	testDeleteAgentNotFound,
	testDeleteAgentMissingName,
	testGetAgentsIncludesCustom,
	testGetTemplates,
	testPreviewAgent,
	testPreviewAgentNotFound,
	testPreviewAgentMissingName,
];

async function run() {
	let passed = 0;
	let failed = 0;
	const total = waveTests.length + tests.length;

	// Run wave unit tests first (no server needed)
	console.log("── Wave Detail Tests ──");
	for (const test of waveTests) {
		try {
			test();
			passed++;
		} catch (e: any) {
			console.error(`✗ ${test.name}: ${e.message}`);
			failed++;
		}
	}

	// Run API tests (need server)
	console.log("\n── Dashboard API Tests ──");
	await setup();
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
	console.log(`\n${passed} passed, ${failed} failed out of ${total} tests`);
	process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
	console.error("Test setup failed:", e);
	process.exit(1);
});
