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
	// Try JSON first
	try {
		const jsonMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || [null, raw];
		const parsed = JSON.parse((jsonMatch[1] ?? raw).trim());
		const arr = parsed.tasks ?? parsed;
		if (Array.isArray(arr)) {
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
		}
	} catch { /* not JSON, try XML */ }

	// Parse XML-like <task> blocks
	const tasks: StructuredTask[] = [];
	const taskRegex = /<task[^>]*>([\s\S]*?)<\/task>/gi;
	let match;
	let idx = 0;
	while ((match = taskRegex.exec(raw)) !== null) {
		const block = match[1];
		const get = (tag: string) => {
			const m = block.match(new RegExp(`<${tag}>([\s\S]*?)<\/${tag}>`, "i"));
			return m ? m[1].trim() : "";
		};
		tasks.push({
			id: `task_${++idx}`,
			name: get("name"),
			assignee: get("assignee"),
			dependencies: get("dependencies").split(",").map(s => s.trim()).filter(Boolean),
			files: get("files").split(",").map(s => s.trim()).filter(Boolean),
			action: get("action"),
			verify: get("verify"),
			done: get("done"),
		});
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
	rateLimitRetries: number;
	savedAt: string;
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
