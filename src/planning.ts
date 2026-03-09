/**
 * Conductor planning infrastructure.
 *
 * Externalizes state to .planning/ directory so context stays fresh
 * and project knowledge survives across sessions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "./log.js";

export interface PlanningDir {
	root: string;
	/** Ensure .planning/ exists */
	init(): void;
	/** Write a planning file */
	write(filename: string, content: string): void;
	/** Read a planning file */
	read(filename: string): string | null;
	/** List all planning files */
	list(): string[];
	/** Load context for a phase */
	phaseContext(phase: number): string;
	/** Get current state summary */
	stateSummary(): string;
}

export function createPlanningDir(cwd: string): PlanningDir {
	const root = path.join(cwd, ".planning");

	return {
		root,

		init() {
			fs.mkdirSync(root, { recursive: true });
			fs.mkdirSync(path.join(root, "research"), { recursive: true });

			// Create STATE.md if missing
			if (!fs.existsSync(path.join(root, "STATE.md"))) {
				fs.writeFileSync(path.join(root, "STATE.md"), `# Project State

## Decisions
(none yet)

## Blockers
(none)

## Position
- Current: initialization
`);
			}
		},

		write(filename: string, content: string) {
			const filePath = path.join(root, filename);
			fs.mkdirSync(path.dirname(filePath), { recursive: true });
			fs.writeFileSync(filePath, content);
		},

		read(filename: string): string | null {
			const filePath = path.join(root, filename);
			try {
				return fs.readFileSync(filePath, "utf-8");
			} catch {
				return null;
			}
		},

		list(): string[] {
			if (!fs.existsSync(root)) return [];
			return fs.readdirSync(root, { recursive: true })
				.map(f => String(f))
				.filter(f => f.endsWith(".md"));
		},

		phaseContext(phase: number): string {
			const parts: string[] = [];
			const project = this.read("PROJECT.md");
			if (project) parts.push(`## Project\n${project}`);

			const context = this.read(`${phase}-CONTEXT.md`);
			if (context) parts.push(`## Phase ${phase} Context\n${context}`);

			const research = this.read(`${phase}-RESEARCH.md`);
			if (research) parts.push(`## Phase ${phase} Research\n${research}`);

			const state = this.read("STATE.md");
			if (state) parts.push(`## State\n${state}`);

			return parts.join("\n\n") || "(no planning context)";
		},

		stateSummary(): string {
			return this.read("STATE.md") ?? "(no state file)";
		},
	};
}

// ─── Structured Task Format (GSD-inspired XML) ──────────────

export interface StructuredTask {
	id: string;
	name: string;
	assignee: string;
	dependencies: string[];
	files: string[];
	action: string;
	verify: string;
	done: string;
}

/**
 * Parse structured task plan from planner output.
 * Accepts both JSON and XML-like formats.
 */
export function parseStructuredTasks(raw: string): StructuredTask[] {
	// Helper to convert parsed JSON to StructuredTask[]
	const fromJson = (parsed: any): StructuredTask[] | null => {
		const arr = parsed.tasks ?? parsed;
		if (!Array.isArray(arr) || arr.length === 0) return null;
		// Verify at least one item looks like a task
		if (!arr.some((t: any) => t.id || t.name || t.action || t.assignee)) return null;
		return arr.map((t: any, i: number) => ({
			id: t.id ?? `task_${i + 1}`,
			name: t.name ?? t.description ?? "",
			assignee: t.assignee ?? "",
			dependencies: t.dependencies ?? [],
			files: t.files ? (Array.isArray(t.files) ? t.files : [t.files]) : [],
			action: t.action ?? t.description ?? "",
			verify: t.verify ?? "",
			done: t.done ?? "",
		}));
	};

	// Strategy 1: Extract AWSL_RESULT section and parse JSON from it
	const awslSection = raw.match(/##\s*AWSL_RESULT[\s\S]*$/i);
	if (awslSection) {
		const section = awslSection[0];
		// Try code fence within AWSL_RESULT section
		const fenceMatch = section.match(/```(?:json)?\s*\r?\n([\s\S]*?)\r?\n\s*```/);
		if (fenceMatch) {
			try {
				const result = fromJson(JSON.parse(fenceMatch[1].trim()));
				if (result) return result;
			} catch { /* continue */ }
		}
		// Try bare JSON in AWSL_RESULT section
		const jsonBare = section.match(/\{[\s\S]*"tasks"\s*:\s*\[[\s\S]*\]\s*\}/);
		if (jsonBare) {
			try {
				const result = fromJson(JSON.parse(jsonBare[0]));
				if (result) return result;
			} catch { /* continue */ }
		}
	}

	// Strategy 2: Try ALL code fence blocks (not just the first one)
	const fenceRegex = /```(?:json)?\s*\r?\n([\s\S]*?)\r?\n\s*```/g;
	let fenceMatch;
	while ((fenceMatch = fenceRegex.exec(raw)) !== null) {
		try {
			const result = fromJson(JSON.parse(fenceMatch[1].trim()));
			if (result) return result;
		} catch { /* try next fence */ }
	}

	// Strategy 3: Try parsing the entire raw string as JSON
	try {
		const result = fromJson(JSON.parse(raw.trim()));
		if (result) return result;
	} catch { /* not raw JSON */ }

	// Strategy 4: Try extracting any JSON object with "tasks" array
	const jsonObjMatch = raw.match(/\{[\s\S]*"tasks"\s*:\s*\[[\s\S]*\]\s*\}/);
	if (jsonObjMatch) {
		try {
			const result = fromJson(JSON.parse(jsonObjMatch[0]));
			if (result) return result;
		} catch { /* continue */ }
	}

	// Strategy 5: Try extracting a bare JSON array
	const jsonArrMatch = raw.match(/\[[\s\S]*\]/);
	if (jsonArrMatch) {
		try {
			const result = fromJson(JSON.parse(jsonArrMatch[0]));
			if (result) return result;
		} catch { /* continue */ }
	}

	// Strategy 6: Parse XML-like <task> blocks
	const xmlTasks: StructuredTask[] = [];
	const taskRegex = /<task[^>]*>([\s\S]*?)<\/task>/gi;
	let xmlMatch;
	let xmlIdx = 0;
	while ((xmlMatch = taskRegex.exec(raw)) !== null) {
		const block = xmlMatch[1];
		const get = (tag: string) => {
			const m = block.match(new RegExp(`<${tag}>([\s\S]*?)<\/${tag}>`, "i"));
			return m ? m[1].trim() : "";
		};
		xmlTasks.push({
			id: `task_${++xmlIdx}`,
			name: get("name"),
			assignee: get("assignee"),
			dependencies: get("dependencies").split(",").map(s => s.trim()).filter(Boolean),
			files: get("files").split(",").map(s => s.trim()).filter(Boolean),
			action: get("action"),
			verify: get("verify"),
			done: get("done"),
		});
	}
	if (xmlTasks.length > 0) return xmlTasks;

	// Strategy 7: Parse markdown task headings
	// Handles formats like:
	//   ## task-1: Create user model
	//   - **Role:** coder
	//   - **Assignee:** coder
	//   - **Dependencies:** task-2, task-3
	//   - **Files:** src/foo.ts, src/bar.ts
	//   - **Action:** Do something...
	//   - **Verify:** npm test
	//   - **Done:** Tests pass
	const mdTasks = parseMarkdownTasks(raw);
	if (mdTasks.length > 0) return mdTasks;

	return [];
}

/**
 * Parse markdown-formatted task plans into StructuredTask[].
 *
 * Supports headings like:
 *   ## task-1: Name          ## 1. Name (coder)
 *   ### task_1: Name         ### Name
 *
 * And fields as bold-label list items:
 *   - **Role:** coder        - **Assignee:** coder
 *   - **Files:** a.ts, b.ts  - **Action:** ...
 */
function parseMarkdownTasks(raw: string): StructuredTask[] {
	// Split on markdown headings (## or ###) that look like task boundaries
	const sections = raw.split(/^(?=#{2,3}\s+)/m).filter(s => s.trim());

	const tasks: StructuredTask[] = [];
	let fallbackIdx = 0;

	for (const section of sections) {
		// Match heading: ## task-1: Name  OR  ## 1. Name (role)  OR  ### Name
		const headingMatch = section.match(/^#{2,3}\s+(.+)/m);
		if (!headingMatch) continue;

		const heading = headingMatch[1].trim();

		// Extract field values from "- **Label:** value" patterns
		const getField = (labels: string[]): string => {
			for (const label of labels) {
				const re = new RegExp(`[-*]\\s*\\*\\*${label}:?\\*\\*:?\\s*(.+)`, "i");
				const m = section.match(re);
				if (m) return m[1].trim();
			}
			return "";
		};

		const assignee = getField(["Role", "Assignee", "Agent", "角色", "负责"]);
		const action = getField(["Action", "Task", "Description", "操作", "行动", "任务"]);
		const verify = getField(["Verify", "Verification", "Test", "验证", "测试"]);
		const done = getField(["Done", "Definition of Done", "完成条件", "完成"]);
		const filesRaw = getField(["Files", "File", "文件"]);
		const depsRaw = getField(["Dependencies", "Deps", "Depends", "依赖"]);

		// Need at least an assignee or action to consider it a task
		if (!assignee && !action) continue;

		// Parse task id and name from heading
		// Patterns: "task-1: Name", "task_1: Name", "1. Name", "1. Name (role)", "Name"
		let id = "";
		let name = heading;
		const idMatch = heading.match(/^(task[-_]\d+)\s*[:：]\s*(.*)/i);
		if (idMatch) {
			id = idMatch[1].replace("-", "_");
			name = idMatch[2].trim();
		} else {
			const numMatch = heading.match(/^(\d+)[\.\)]\s*(.*)/);
			if (numMatch) {
				id = `task_${numMatch[1]}`;
				name = numMatch[2].replace(/\s*\([^)]*\)\s*$/, "").trim();
			}
		}
		if (!id) {
			id = `task_${++fallbackIdx}`;
		}

		// Strip trailing "(role)" from name if present
		name = name.replace(/\s*\([^)]*\)\s*$/, "").trim() || heading;

		const deps = depsRaw
			.split(/[,，]/)
			.map(s => s.trim().replace("-", "_"))
			.filter(s => s && s !== "(none)" && s !== "none" && s !== "无");

		const files = filesRaw
			.split(/[,，]/)
			.map(s => s.trim())
			.filter(Boolean);

		tasks.push({ id, name, assignee, dependencies: deps, files, action: action || name, verify, done });
	}

	return tasks;
}

// ─── Git Commit Helper ──────────────────────────────────────

import { execSync } from "node:child_process";

/**
 * Collect files that actually changed in the working tree (staged + unstaged + untracked).
 */
function changedFiles(cwd: string): string[] {
	try {
		// --porcelain gives "XY filename" lines; strip status prefix
		const out = execSync("git status --porcelain", { cwd, encoding: "utf-8" }).trim();
		if (!out) return [];
		return out.split("\n").map(l => l.slice(3).trim()).filter(Boolean);
	} catch {
		return [];
	}
}

/**
 * Atomic commit scoped to task-declared files.
 *
 * Staging strategy (from safest to broadest):
 *   1. If `taskFiles` is provided and non-empty, only stage those files
 *      (intersected with actual working-tree changes to avoid errors).
 *   2. Otherwise fall back to staging every changed file (`git add` each).
 *
 * This replaces the old `git add -A` which could capture unrelated dirty files.
 */
export function atomicCommit(cwd: string, taskId: string, message: string, taskFiles?: string[]): boolean {
	try {
		const dirty = changedFiles(cwd);
		if (dirty.length === 0) return false;

		let toStage: string[];

		if (taskFiles && taskFiles.length > 0) {
			// Normalize declared paths and intersect with actual changes
			const declared = new Set(taskFiles.map(f => f.replace(/\\/g, "/")));
			toStage = dirty.filter(f => {
				const norm = f.replace(/\\/g, "/");
				// Exact match or the dirty file is under a declared directory
				return declared.has(norm) || [...declared].some(d => norm.startsWith(d + "/") || d.startsWith(norm + "/"));
			});
			// Always include .planning/ files produced by the orchestrator itself
			for (const f of dirty) {
				const norm = f.replace(/\\/g, "/");
				if (norm.startsWith(".planning/") && !toStage.includes(f)) {
					toStage.push(f);
				}
			}
		} else {
			// No declared files — stage all changed files (still per-file, not -A)
			toStage = dirty;
		}

		if (toStage.length === 0) return false;

		// Stage files individually
		for (const f of toStage) {
			execSync(`git add -- ${JSON.stringify(f)}`, { cwd, stdio: "pipe" });
		}

		// Check if anything actually staged
		const staged = execSync("git diff --cached --name-only", { cwd, encoding: "utf-8" }).trim();
		if (!staged) return false;

		const commitMsg = `${taskId}: ${message}`;
		execSync(`git commit -m ${JSON.stringify(commitMsg)}`, {
			cwd,
			stdio: "pipe",
		});
		log.info("git", `Committed ${toStage.length} file(s): ${toStage.slice(0, 5).join(", ")}${toStage.length > 5 ? "..." : ""}`);
		return true;
	} catch {
		return false;
	}
}

// ─── Checkpoint Persistence ─────────────────────────────────

export interface CheckpointData {
	wave: number;
	completedTasks: string[];
	taskResults: Record<string, string>;
	failedTasks: string[];
	/** Error messages for failed tasks */
	taskErrors: Record<string, string>;
	rateLimitRetries: number;
	savedAt: string;
	/** Serialized SharedMemory (research, design, plan, task results) */
	memory?: Record<string, { value: string; author: string; timestamp: number }>;
	/** Original goal for sanity-check on resume */
	goal?: string;
}

export function saveCheckpoint(cwd: string, data: CheckpointData): void {
	const dir = path.join(cwd, ".planning");
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "CHECKPOINT.json"),
		JSON.stringify(data, null, 2),
	);
	log.info("checkpoint", "Checkpoint saved");
}

export function loadCheckpoint(cwd: string): CheckpointData | null {
	const filePath = path.join(cwd, ".planning", "CHECKPOINT.json");
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		const data: CheckpointData = JSON.parse(raw);
		log.info("checkpoint", "Checkpoint loaded");
		return data;
	} catch {
		log.info("checkpoint", "No checkpoint found");
		return null;
	}
}

export function clearCheckpoint(cwd: string): void {
	try {
		fs.unlinkSync(path.join(cwd, ".planning", "CHECKPOINT.json"));
	} catch {
		// silently ignore if file doesn't exist
	}
}
