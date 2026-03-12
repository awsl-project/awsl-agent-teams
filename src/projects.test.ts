/**
 * Tests for ProjectManager — global project registry.
 *
 * Run: npx tsx src/projects.test.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ProjectManager, type ProjectEntry, type ProjectRegistry, type ProjectStatus } from "./projects.js";

// ─── Test helpers ────────────────────────────────────────────

let testDir: string;
let originalRegistryPath: string;

function setup() {
	testDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-test-"));
	// Override registry path for tests
	originalRegistryPath = ProjectManager.registryPath();
	const testRegistry = path.join(testDir, "projects.json");
	(ProjectManager as any)._testRegistryPath = testRegistry;
}

function teardown() {
	delete (ProjectManager as any)._testRegistryPath;
	fs.rmSync(testDir, { recursive: true, force: true });
}

function assert(condition: boolean, msg: string) {
	if (!condition) throw new Error(`FAIL: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
	if (actual !== expected) throw new Error(`FAIL: ${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─── Tests ───────────────────────────────────────────────────

function testLoadEmpty() {
	setup();
	try {
		const reg = ProjectManager.load();
		assert(Array.isArray(reg.projects), "load() returns projects array");
		assertEqual(reg.projects.length, 0, "empty registry has 0 projects");
		assert(typeof reg.updatedAt === "string", "updatedAt is a string");
	} finally {
		teardown();
	}
	console.log("✓ testLoadEmpty");
}

function testAddAndGet() {
	setup();
	try {
		const projectPath = path.join(testDir, "my-project");
		fs.mkdirSync(projectPath, { recursive: true });

		const entry = ProjectManager.add(projectPath, "My Project", ["web"]);
		assert(entry !== undefined, "add() returns entry");
		assertEqual(entry.name, "My Project", "name matches");
		assertEqual(entry.path, path.resolve(path.normalize(projectPath)), "path is normalized");
		assert(entry.tags?.includes("web") ?? false, "tags preserved");
		assert(typeof entry.addedAt === "string", "addedAt is set");

		// Get by path
		const found = ProjectManager.get(projectPath);
		assert(found !== undefined, "get() finds the project");
		assertEqual(found!.name, "My Project", "get() returns correct entry");

		// Idempotent — add same path returns existing
		const existing = ProjectManager.add(projectPath, "Different Name");
		assertEqual(existing.name, "My Project", "add() is idempotent (returns existing)");

		// Verify persisted
		const all = ProjectManager.list();
		assertEqual(all.length, 1, "list() returns 1 project");
	} finally {
		teardown();
	}
	console.log("✓ testAddAndGet");
}

function testAddDefaultName() {
	setup();
	try {
		const projectPath = path.join(testDir, "cool-app");
		fs.mkdirSync(projectPath, { recursive: true });

		const entry = ProjectManager.add(projectPath);
		assertEqual(entry.name, "cool-app", "default name is basename");
	} finally {
		teardown();
	}
	console.log("✓ testAddDefaultName");
}

function testRemove() {
	setup();
	try {
		const projectPath = path.join(testDir, "to-remove");
		fs.mkdirSync(projectPath, { recursive: true });

		ProjectManager.add(projectPath);
		assertEqual(ProjectManager.list().length, 1, "has 1 project");

		const removed = ProjectManager.remove(projectPath);
		assert(removed, "remove() returns true");
		assertEqual(ProjectManager.list().length, 0, "list is empty after remove");

		const removedAgain = ProjectManager.remove(projectPath);
		assert(!removedAgain, "remove() returns false for missing");
	} finally {
		teardown();
	}
	console.log("✓ testRemove");
}

function testFind() {
	setup();
	try {
		const p1 = path.join(testDir, "alpha");
		const p2 = path.join(testDir, "beta");
		fs.mkdirSync(p1, { recursive: true });
		fs.mkdirSync(p2, { recursive: true });

		ProjectManager.add(p1, "Alpha Project");
		ProjectManager.add(p2, "Beta Project");

		// Find by exact path
		const byPath = ProjectManager.find(p1);
		assertEqual(byPath?.name, "Alpha Project", "find by path");

		// Find by name (case-insensitive)
		const byName = ProjectManager.find("beta project");
		assertEqual(byName?.name, "Beta Project", "find by name case-insensitive");

		// Not found
		const notFound = ProjectManager.find("nonexistent");
		assertEqual(notFound, undefined, "find returns undefined for unknown");
	} finally {
		teardown();
	}
	console.log("✓ testFind");
}

function testTouch() {
	setup();
	try {
		const projectPath = path.join(testDir, "touchable");
		fs.mkdirSync(projectPath, { recursive: true });

		ProjectManager.add(projectPath);
		const before = ProjectManager.get(projectPath)!;

		// Small delay to ensure timestamp differs
		const beforeActive = before.lastActiveAt;

		ProjectManager.touch(projectPath);
		const after = ProjectManager.get(projectPath)!;
		assert(typeof after.lastActiveAt === "string", "lastActiveAt is set after touch");
		if (beforeActive) {
			assert(after.lastActiveAt! >= beforeActive, "lastActiveAt updated");
		}
	} finally {
		teardown();
	}
	console.log("✓ testTouch");
}

function testGetStatus() {
	setup();
	try {
		const projectPath = path.join(testDir, "status-project");
		fs.mkdirSync(projectPath, { recursive: true });

		const entry = ProjectManager.add(projectPath);
		const status = ProjectManager.getStatus(entry);

		assertEqual(status.name, entry.name, "status name matches");
		assertEqual(status.path, entry.path, "status path matches");
		assert(status.exists, "project dir exists");
		assert(!status.hasPlanning, "no .planning dir");
		assert(!status.isLocked, "not locked");
		assertEqual(status.queue.total, 0, "no queue tasks");

		// Create .planning dir
		fs.mkdirSync(path.join(projectPath, ".planning"), { recursive: true });
		const status2 = ProjectManager.getStatus(entry);
		assert(status2.hasPlanning, "has .planning dir");
	} finally {
		teardown();
	}
	console.log("✓ testGetStatus");
}

function testGetStatusWithQueue() {
	setup();
	try {
		const projectPath = path.join(testDir, "queue-project");
		const planningDir = path.join(projectPath, ".planning");
		fs.mkdirSync(planningDir, { recursive: true });

		// Write a QUEUE.json
		const queueData = {
			tasks: [
				{ id: "q_1", goal: "task 1", status: "done", options: {} },
				{ id: "q_2", goal: "task 2", status: "running", options: {} },
				{ id: "q_3", goal: "task 3", status: "pending", options: {} },
				{ id: "q_4", goal: "task 4", status: "failed", options: {} },
			],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		fs.writeFileSync(path.join(planningDir, "QUEUE.json"), JSON.stringify(queueData));

		const entry = ProjectManager.add(projectPath);
		const status = ProjectManager.getStatus(entry);

		assertEqual(status.queue.total, 4, "total queue tasks");
		assertEqual(status.queue.done, 1, "done count");
		assertEqual(status.queue.running, 1, "running count");
		assertEqual(status.queue.pending, 1, "pending count");
		assertEqual(status.queue.failed, 1, "failed count");
	} finally {
		teardown();
	}
	console.log("✓ testGetStatusWithQueue");
}

function testScan() {
	setup();
	try {
		// Create some project-like dirs
		const p1 = path.join(testDir, "scan-root", "project-a");
		const p2 = path.join(testDir, "scan-root", "nested", "project-b");
		const p3 = path.join(testDir, "scan-root", "has-git");
		fs.mkdirSync(path.join(p1, ".planning"), { recursive: true });
		fs.mkdirSync(path.join(p2, ".planning"), { recursive: true });
		fs.mkdirSync(path.join(p3, ".git"), { recursive: true });

		const scanRoot = path.join(testDir, "scan-root");
		const results = ProjectManager.scan(scanRoot, 3);

		// Should find at least p1, p2, p3
		assert(results.length >= 3, `scan found ${results.length} projects, expected >= 3`);
		const normalized = results.map(r => path.resolve(path.normalize(r)));
		assert(normalized.includes(path.resolve(path.normalize(p1))), "found project-a");
		assert(normalized.includes(path.resolve(path.normalize(p3))), "found has-git");
	} finally {
		teardown();
	}
	console.log("✓ testScan");
}

function testGetAllStatuses() {
	setup();
	try {
		const p1 = path.join(testDir, "proj-1");
		const p2 = path.join(testDir, "proj-2");
		fs.mkdirSync(p1, { recursive: true });
		// p2 does NOT exist — should fail soft

		ProjectManager.add(p1, "Proj 1");
		ProjectManager.add(p2, "Proj 2");

		const statuses = ProjectManager.getAllStatuses();
		assertEqual(statuses.length, 2, "2 statuses returned");
		// p1 exists, p2 doesn't
		const s1 = statuses.find(s => s.name === "Proj 1")!;
		const s2 = statuses.find(s => s.name === "Proj 2")!;
		assert(s1.exists, "proj-1 exists");
		assert(!s2.exists, "proj-2 does not exist");
	} finally {
		teardown();
	}
	console.log("✓ testGetAllStatuses");
}

// ─── Run all tests ───────────────────────────────────────────

const tests = [
	testLoadEmpty,
	testAddAndGet,
	testAddDefaultName,
	testRemove,
	testFind,
	testTouch,
	testGetStatus,
	testGetStatusWithQueue,
	testScan,
	testGetAllStatuses,
];

let passed = 0;
let failed = 0;
for (const test of tests) {
	try {
		test();
		passed++;
	} catch (e: any) {
		console.error(`✗ ${test.name}: ${e.message}`);
		failed++;
	}
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
process.exit(failed > 0 ? 1 : 0);
