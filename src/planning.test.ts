import { test } from "node:test";
import * as assert from "node:assert/strict";
import { parseStructuredTasks, parseStructuredTasksChecked, detectDependencyCycles, sanitizeCommitMessage, type StructuredTask } from "./planning.js";

test("sanitizeCommitMessage strips Co-Authored-By: Claude trailer", () => {
	const raw = "feat: add login\n\nCo-Authored-By: Claude <noreply@anthropic.com>";
	const out = sanitizeCommitMessage(raw);
	assert.equal(out, "feat: add login");
	assert.ok(!/claude/i.test(out));
	assert.ok(!/anthropic/i.test(out));
});

test("sanitizeCommitMessage strips Generated with Claude Code + robot emoji", () => {
	const raw = "fix: handle empty input\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)";
	const out = sanitizeCommitMessage(raw);
	assert.equal(out, "fix: handle empty input");
	assert.ok(!/claude/i.test(out));
	assert.ok(!/🤖/.test(out));
});

test("sanitizeCommitMessage keeps a clean human message untouched", () => {
	const raw = "refactor(store): extract validation helper";
	assert.equal(sanitizeCommitMessage(raw), raw);
});

test("sanitizeCommitMessage keeps legitimate human co-authors", () => {
	const raw = "feat: pairing work\n\nCo-Authored-By: Alice <alice@example.com>";
	const out = sanitizeCommitMessage(raw);
	assert.ok(out.includes("Co-Authored-By: Alice <alice@example.com>"));
});

test("sanitizeCommitMessage collapses blank lines left by stripping", () => {
	const raw = "feat: thing\n\n\n🤖 Generated with Claude Code\n\n";
	const out = sanitizeCommitMessage(raw);
	assert.equal(out, "feat: thing");
});

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