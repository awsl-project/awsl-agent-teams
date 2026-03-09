/**
 * Plan validator — pure code logic, no LLM needed.
 *
 * Reads .planning/PLAN.md, parses structured tasks, validates,
 * computes topological waves, and outputs WAVES.md.
 *
 * This is the "code brain" of the hybrid architecture:
 * - CC writes the plan (creative LLM work)
 * - This code validates it (deterministic logic)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "./log.js";

export interface ValidatedTask {
	id: string;
	name: string;
	role: string;
	assignee: string;
	dependencies: string[];
	files: string[];
	action: string;
	verify: string;
	done: string;
}

export interface FileConflict {
	taskA: string;
	taskB: string;
	files: string[];
}

export interface ValidationResult {
	success: boolean;
	tasks: ValidatedTask[];
	waves: string[][];
	errors: string[];
	warnings: string[];
	fileConflicts: FileConflict[];
}

// ── Parse PLAN.md ──────────────────────────────────────────────

function parsePlanMarkdown(content: string): ValidatedTask[] {
	const tasks: ValidatedTask[] = [];
	// Match ## task-id: name sections
	const sections = content.split(/^## /m).slice(1);

	for (const section of sections) {
		const lines = section.trim().split("\n");
		const headerMatch = lines[0].match(/^([\w-]+):\s*(.+)/);
		if (!headerMatch) continue;

		const id = headerMatch[1];
		const name = headerMatch[2].trim();
		const body = lines.slice(1).join("\n");

		const getField = (label: string): string => {
			const match = body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, "i"));
			return match ? match[1].trim() : "";
		};

		const getSection = (label: string): string => {
			const match = body.match(new RegExp(`### ${label}\\s*\\n([\\s\\S]*?)(?=###|$)`, "i"));
			return match ? match[1].trim() : "";
		};

		const role = getField("Role") || getField("Assignee") || "coder";
		const depsStr = getField("Dependencies");
		const filesStr = getField("Files");

		tasks.push({
			id,
			name,
			role: role.toLowerCase(),
			assignee: role.toLowerCase(),
			dependencies: depsStr && depsStr !== "(none)" && depsStr !== "none"
				? depsStr.split(",").map(s => s.trim()).filter(Boolean)
				: [],
			files: filesStr
				? filesStr.split(",").map(s => s.trim()).filter(Boolean)
				: [],
			action: getSection("Action") || "",
			verify: getSection("Verify") || "",
			done: getSection("Done") || "",
		});
	}

	return tasks;
}

// Also try JSON format (from CC or planner)
function parsePlanJSON(content: string): ValidatedTask[] {
	try {
		const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || [null, content];
		const parsed = JSON.parse((jsonMatch[1] ?? content).trim());
		const arr = parsed.tasks ?? parsed;
		if (!Array.isArray(arr)) return [];

		return arr.map((t: any, i: number) => ({
			id: t.id ?? `task_${i + 1}`,
			name: t.name ?? t.description ?? "",
			role: t.role ?? t.assignee ?? "coder",
			assignee: t.assignee ?? t.role ?? "coder",
			dependencies: t.dependencies ?? [],
			files: t.files ? (Array.isArray(t.files) ? t.files : [t.files]) : [],
			action: t.action ?? t.description ?? "",
			verify: t.verify ?? "",
			done: t.done ?? "",
		}));
	} catch {
		return [];
	}
}

// ── Topological Sort ───────────────────────────────────────────

function computeWaves(tasks: ValidatedTask[]): { waves: string[][]; errors: string[] } {
	const errors: string[] = [];
	const waves: string[][] = [];
	const done = new Set<string>();
	const taskIds = new Set(tasks.map(t => t.id));
	let remaining = [...tasks];

	while (remaining.length > 0) {
		const wave = remaining.filter(t =>
			t.dependencies.every(d => done.has(d))
		);

		if (wave.length === 0) {
			// Cycle detected
			const cycleIds = remaining.map(t => t.id);
			errors.push(`Dependency cycle detected: ${cycleIds.join(", ")}`);
			// Break cycle by forcing first task
			const forced = remaining[0];
			errors.push(`Breaking cycle: forcing ${forced.id} into current wave`);
			wave.push(forced);
		}

		waves.push(wave.map(t => t.id));
		for (const t of wave) done.add(t.id);
		remaining = remaining.filter(t => !done.has(t.id));
	}

	return { waves, errors };
}

// ── File Conflict Resolution ───────────────────────────────────

function resolveFileConflicts(
	_waves: string[][],
	tasks: ValidatedTask[],
): { waves: string[][]; conflicts: FileConflict[] } {
	const taskMap = new Map(tasks.map(t => [t.id, t]));
	const conflicts: FileConflict[] = [];

	// Stage 1: detect file conflicts and add dependency edges
	const fileOwners = new Map<string, string[]>(); // file -> taskIds that touch it
	for (const task of tasks) {
		for (const file of task.files) {
			const owners = fileOwners.get(file) ?? [];
			owners.push(task.id);
			fileOwners.set(file, owners);
		}
	}

	for (const [file, owners] of fileOwners) {
		if (owners.length < 2) continue;
		// Chain: each later task depends on the one before it
		for (let i = 1; i < owners.length; i++) {
			const prev = owners[i - 1];
			const curr = owners[i];
			const task = taskMap.get(curr)!;
			if (!task.dependencies.includes(prev)) {
				task.dependencies.push(prev);
				// Find all shared files between this pair for reporting
				const prevTask = taskMap.get(prev)!;
				const sharedFiles = task.files.filter(f => prevTask.files.includes(f));
				conflicts.push({ taskA: prev, taskB: curr, files: sharedFiles });
				log.warn("validate", `File conflict: ${prev} and ${curr} both touch ${sharedFiles.join(", ")} — serializing`);
			}
		}
	}

	// Stage 2: re-run topo-sort with the new edges
	const { waves } = computeWaves(tasks);

	return { waves, conflicts };
}

// ── Validation Logic ───────────────────────────────────────────

const VALID_ROLES = new Set(["coder", "reviewer", "tester", "architect", "planner", "custom"]);

function validate(tasks: ValidatedTask[]): { errors: string[]; warnings: string[] } {
	const errors: string[] = [];
	const warnings: string[] = [];
	const taskIds = new Set(tasks.map(t => t.id));

	if (tasks.length === 0) {
		errors.push("No tasks found in plan");
		return { errors, warnings };
	}

	for (const task of tasks) {
		// ID check
		if (!task.id) {
			errors.push(`Task missing id`);
		}

		// Role check
		if (!VALID_ROLES.has(task.role)) {
			warnings.push(`${task.id}: unknown role "${task.role}", defaulting to "coder"`);
			task.role = "coder";
			task.assignee = "coder";
		}

		// Planner check
		if (task.role === "planner" || task.assignee === "planner") {
			warnings.push(`${task.id}: assigned to "planner", reassigning to "coder"`);
			task.role = "coder";
			task.assignee = "coder";
		}

		// Dependency check
		for (const dep of task.dependencies) {
			if (!taskIds.has(dep)) {
				warnings.push(`${task.id}: removing invalid dependency "${dep}"`);
			}
		}
		task.dependencies = task.dependencies.filter(d => taskIds.has(d));

		// Self-dependency check
		if (task.dependencies.includes(task.id)) {
			warnings.push(`${task.id}: removing self-dependency`);
			task.dependencies = task.dependencies.filter(d => d !== task.id);
		}

		// Action check
		if (!task.action) {
			warnings.push(`${task.id}: missing action description`);
		}

		// File count check
		if (task.files.length > 5) {
			warnings.push(`${task.id}: touches ${task.files.length} files, consider splitting`);
		}
	}

	// File overlap detection
	const fileOwners = new Map<string, string[]>();
	for (const task of tasks) {
		for (const file of task.files) {
			const owners = fileOwners.get(file) ?? [];
			owners.push(task.id);
			fileOwners.set(file, owners);
		}
	}
	for (const [file, owners] of fileOwners) {
		if (owners.length > 1) {
			warnings.push(`File "${file}" is touched by multiple tasks: ${owners.join(", ")}`);
		}
	}

	// Duplicate ID check
	const seen = new Set<string>();
	for (const task of tasks) {
		if (seen.has(task.id)) {
			errors.push(`Duplicate task id: ${task.id}`);
		}
		seen.add(task.id);
	}

	return { errors, warnings };
}

// ── Public API ─────────────────────────────────────────────────

export function validatePlan(cwd: string): ValidationResult {
	log.section("Plan Validation");

	const planPath = path.join(cwd, ".planning", "PLAN.md");
	if (!fs.existsSync(planPath)) {
		return { success: false, tasks: [], waves: [], errors: ["No .planning/PLAN.md found"], warnings: [], fileConflicts: [] };
	}

	const content = fs.readFileSync(planPath, "utf-8");

	// Try markdown format first, then JSON
	let tasks = parsePlanMarkdown(content);
	if (tasks.length === 0) {
		tasks = parsePlanJSON(content);
	}

	if (tasks.length === 0) {
		return { success: false, tasks: [], waves: [], errors: ["Could not parse any tasks from PLAN.md"], warnings: [], fileConflicts: [] };
	}

	log.info("validate", `Parsed ${tasks.length} tasks`);

	// Validate
	const { errors, warnings } = validate(tasks);
	for (const e of errors) log.warn("validate", `ERROR: ${e}`);
	for (const w of warnings) log.info("validate", `WARN: ${w}`);

	if (errors.length > 0) {
		return { success: false, tasks, waves: [], errors, warnings, fileConflicts: [] };
	}

	// Compute waves
	const { waves: rawWaves, errors: waveErrors } = computeWaves(tasks);
	errors.push(...waveErrors);

	// Resolve file conflicts
	const { waves, conflicts: fileConflicts } = resolveFileConflicts(rawWaves, tasks);
	for (const c of fileConflicts) {
		warnings.push(`File conflict resolved: ${c.taskA} and ${c.taskB} serialized due to shared files: ${c.files.join(", ")}`);
	}

	// Log waves
	for (let i = 0; i < waves.length; i++) {
		const waveTasks = waves[i].map(id => {
			const t = tasks.find(t => t.id === id)!;
			return `${t.id}(${t.role})`;
		});
		log.info("validate", `Wave ${i + 1}: ${waveTasks.join(", ")}`);
	}

	// Write WAVES.md
	const wavesContent = formatWaves(waves, tasks, fileConflicts);
	const wavesPath = path.join(cwd, ".planning", "WAVES.md");
	fs.writeFileSync(wavesPath, wavesContent);
	log.info("validate", `Waves saved to .planning/WAVES.md`);

	const success = errors.length === 0;
	return { success, tasks, waves, errors, warnings, fileConflicts };
}

function formatWaves(waves: string[][], tasks: ValidatedTask[], fileConflicts: FileConflict[] = []): string {
	const lines = ["# Execution Waves\n"];

	for (let i = 0; i < waves.length; i++) {
		lines.push(`## Wave ${i + 1}`);
		lines.push("");
		for (const id of waves[i]) {
			const task = tasks.find(t => t.id === id)!;
			lines.push(`### ${task.id}: ${task.name}`);
			lines.push(`- **Role:** ${task.role}`);
			if (task.dependencies.length) lines.push(`- **After:** ${task.dependencies.join(", ")}`);
			if (task.files.length) lines.push(`- **Files:** ${task.files.join(", ")}`);
			lines.push("");
		}
	}

	if (fileConflicts.length > 0) {
		lines.push(`## File Conflict Resolutions\n`);
		for (const c of fileConflicts) {
			lines.push(`- **${c.taskA}** and **${c.taskB}** serialized due to shared files: ${c.files.join(", ")}`);
		}
		lines.push("");
	}

	lines.push(`---`);
	lines.push(`Total: ${tasks.length} tasks in ${waves.length} waves`);
	lines.push(`Parallel tasks per wave: ${waves.map(w => w.length).join(", ")}`);

	return lines.join("\n");
}
