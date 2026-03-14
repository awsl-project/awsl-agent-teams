import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parseStructuredTasks, parseStructuredTasksChecked, detectDependencyCycles, type StructuredTask } from "./planning.js";

test("detectDependencyCycles returns no cycles for valid DAG", () => {
	const tasks: StructuredTask[] = [
		{ id: "task_1", name: "A", assignee: "coder", dependencies: [], files: [], action: "", verify: "", done: "" },
		{ id: "task_2", name: "B", assignee: "coder", dependencies: ["task_1"], files: [], action: "", verify: "", done: "" },
		{ id: "task_3", name: "C", assignee: "coder", dependencies: ["task_1"], files: [], action: "", verify: "", done: "" },
		{ id: "task_4", name: "D", assignee: "coder", dependencies: ["task_2", "task_3"], files: [], action: "", verify: "", done: "" },
	];
	const result = detectDependencyCycles(tasks);
	assert.equal(result.hasCycle, false);
	assert.deepEqual(result.cycles, []);
});

test("detectDependencyCycles detects simple cycle A -> B -> A", () => {
	const tasks: StructuredTask[] = [
		{ id: "task_1", name: "A", assignee: "coder", dependencies: ["task_2"], files: [], action: "", verify: "", done: "" },
		{ id: "task_2", name: "B", assignee: "coder", dependencies: ["task_1"], files: [], action: "", verify: "", done: "" },
	];
	const result = detectDependencyCycles(tasks);
	assert.equal(result.hasCycle, true);
	assert.ok(result.cycles.length > 0);
});

test("detectDependencyCycles detects longer cycle A -> B -> C -> A", () => {
	const tasks: StructuredTask[] = [
		{ id: "task_1", name: "A", assignee: "coder", dependencies: ["task_3"], files: [], action: "", verify: "", done: "" },
		{ id: "task_2", name: "B", assignee: "coder", dependencies: ["task_1"], files: [], action: "", verify: "", done: "" },
		{ id: "task_3", name: "C", assignee: "coder", dependencies: ["task_2"], files: [], action: "", verify: "", done: "" },
	];
	const result = detectDependencyCycles(tasks);
	assert.equal(result.hasCycle, true);
	assert.ok(result.cycles.length > 0);
});

test("detectDependencyCycles handles self-dependency", () => {
	const tasks: StructuredTask[] = [
		{ id: "task_1", name: "A", assignee: "coder", dependencies: ["task_1"], files: [], action: "", verify: "", done: "" },
	];
	const result = detectDependencyCycles(tasks);
	assert.equal(result.hasCycle, true);
	assert.ok(result.cycles.length > 0);
});

test("detectDependencyCycles handles mixed valid and cyclic tasks", () => {
	const tasks: StructuredTask[] = [
		{ id: "task_1", name: "A", assignee: "coder", dependencies: [], files: [], action: "", verify: "", done: "" },
		{ id: "task_2", name: "B", assignee: "coder", dependencies: ["task_1"], files: [], action: "", verify: "", done: "" },
		{ id: "task_3", name: "C", assignee: "coder", dependencies: ["task_4"], files: [], action: "", verify: "", done: "" },
		{ id: "task_4", name: "D", assignee: "coder", dependencies: ["task_3"], files: [], action: "", verify: "", done: "" },
	];
	const result = detectDependencyCycles(tasks);
	assert.equal(result.hasCycle, true);
});

test("parseStructuredTasksChecked returns cycle info", () => {
	const json = JSON.stringify({
		tasks: [
			{ id: "task_1", name: "A", assignee: "coder", dependencies: ["task_2"] },
			{ id: "task_2", name: "B", assignee: "coder", dependencies: ["task_1"] },
		],
	});
	const result = parseStructuredTasksChecked(json);
	assert.equal(result.hasCycle, true);
	assert.ok(result.cycles.length > 0);
	assert.equal(result.tasks.length, 2);
});

test("parseStructuredTasksChecked returns no cycles for valid plan", () => {
	const json = JSON.stringify({
		tasks: [
			{ id: "task_1", name: "A", assignee: "coder", dependencies: [] },
			{ id: "task_2", name: "B", assignee: "coder", dependencies: ["task_1"] },
		],
	});
	const result = parseStructuredTasksChecked(json);
	assert.equal(result.hasCycle, false);
	assert.deepEqual(result.cycles, []);
	assert.equal(result.tasks.length, 2);
});

test("parseStructuredTasks handles empty input", () => {
	const result = parseStructuredTasks("");
	assert.deepEqual(result, []);
});

test("parseStructuredTasksChecked handles empty input", () => {
	const result = parseStructuredTasksChecked("");
	assert.equal(result.hasCycle, false);
	assert.deepEqual(result.cycles, []);
	assert.deepEqual(result.tasks, []);
});