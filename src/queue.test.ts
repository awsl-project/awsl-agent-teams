import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TaskQueue, type QueueTask, type PlannedTask } from "./queue.js";

function makeTmpDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "queue-test-"));
	fs.mkdirSync(path.join(dir, ".planning"), { recursive: true });
	return dir;
}

test("QueueTask interface accepts mode field", () => {
	const task: QueueTask = {
		id: "q_1",
		goal: "test discuss",
		options: { discussRounds: 2 },
		status: "pending",
		mode: "discuss",
	};
	assert.equal(task.mode, "discuss");
	assert.equal(task.options.discussRounds, 2);
});

test("QueueTask mode defaults to undefined (build behavior)", () => {
	const task: QueueTask = {
		id: "q_2",
		goal: "build something",
		options: {},
		status: "pending",
	};
	assert.equal(task.mode, undefined);
});

test("add() sets mode when provided in extra", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const task = queue.add("Discuss architecture", {}, { mode: "discuss" });
		assert.equal(task.mode, "discuss");

		// Verify persistence
		const loaded = queue.get(task.id);
		assert.equal(loaded?.mode, "discuss");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("add() does not set mode when not provided", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const task = queue.add("Build a feature", {});
		assert.equal(task.mode, undefined);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("add() sets discussRounds in options", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const task = queue.add("Discuss testing", { discussRounds: 3 }, { mode: "discuss" });
		assert.equal(task.options.discussRounds, 3);
		assert.equal(task.mode, "discuss");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ─── planCommit tests ──────────────────────────────────────

test("planCommit() adds tasks to queue from PlannedTask array", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const planned: PlannedTask[] = [
			{ goal: "Build auth module", dependsOn: [], quick: false },
			{ goal: "Build payment module", dependsOn: ["1"], quick: true },
		];
		const added = queue.planCommit(planned);
		assert.equal(added.length, 2);
		assert.equal(added[0].goal, "Build auth module");
		assert.equal(added[1].goal, "Build payment module");
		assert.equal(added[1].options.quick, true);

		// Second task depends on first
		assert.ok(added[1].dependsOn);
		assert.equal(added[1].dependsOn!.length, 1);
		assert.equal(added[1].dependsOn![0], added[0].id);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("planCommit() resolves 'all' dependency reference", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const planned: PlannedTask[] = [
			{ goal: "Task A", dependsOn: [] },
			{ goal: "Task B", dependsOn: [] },
			{ goal: "Task C", dependsOn: ["all"] },
		];
		const added = queue.planCommit(planned);
		assert.equal(added.length, 3);
		assert.deepEqual(added[2].dependsOn, ["all"]);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("planCommit() applies defaults (engine, quick, concurrency, model)", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const planned: PlannedTask[] = [
			{ goal: "Task with defaults", dependsOn: [] },
		];
		const added = queue.planCommit(planned, {
			engine: "builtin",
			quick: true,
			concurrency: 4,
			model: "test-model",
		});
		assert.equal(added.length, 1);
		assert.equal(added[0].options.quick, true);
		assert.equal(added[0].options.concurrency, 4);
		assert.equal(added[0].options.model, "test-model");
		assert.equal(added[0].engine, "builtin");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("planCommit() task-level quick overrides defaults", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const planned: PlannedTask[] = [
			{ goal: "Quick task", quick: true },
			{ goal: "Not quick task", quick: false },
		];
		const added = queue.planCommit(planned, { quick: false });
		// Task-level quick=true should win (via ??)
		assert.equal(added[0].options.quick, true);
		assert.equal(added[1].options.quick, false);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("planCommit() persists tasks to queue file", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const planned: PlannedTask[] = [
			{ goal: "Persistent task", dependsOn: [] },
		];
		queue.planCommit(planned);

		// Verify via list()
		const allTasks = queue.list();
		assert.equal(allTasks.length, 1);
		assert.equal(allTasks[0].goal, "Persistent task");
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

// ─── Additional planCommit edge-case tests ──────────────────

test("planCommit adds tasks with no dependencies", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const planned: PlannedTask[] = [
			{ goal: "Build auth module", quick: false },
			{ goal: "Build payment module", quick: true },
		];
		const added = queue.planCommit(planned);
		assert.equal(added.length, 2);
		assert.equal(added[0].goal, "Build auth module");
		assert.equal(added[1].goal, "Build payment module");
		assert.equal(added[1].options.quick, true);
		// Verify persisted
		const all = queue.list();
		assert.equal(all.length, 2);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("planCommit resolves position-based dependencies", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const planned: PlannedTask[] = [
			{ goal: "First task", dependsOn: [] },
			{ goal: "Second task", dependsOn: ["1"] },
			{ goal: "Third task", dependsOn: ["all"] },
		];
		const added = queue.planCommit(planned);
		assert.equal(added.length, 3);
		assert.equal(added[0].dependsOn, undefined);
		assert.deepEqual(added[1].dependsOn, [added[0].id]);
		assert.deepEqual(added[2].dependsOn, ["all"]);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("planCommit applies defaults", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const planned: PlannedTask[] = [{ goal: "A task", quick: false }];
		const added = queue.planCommit(planned, { model: "test-model", concurrency: 4 });
		assert.equal(added[0].options.model, "test-model");
		assert.equal(added[0].options.concurrency, 4);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test("planCommit with empty array returns empty", () => {
	const dir = makeTmpDir();
	try {
		const queue = new TaskQueue(dir);
		const added = queue.planCommit([]);
		assert.equal(added.length, 0);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
