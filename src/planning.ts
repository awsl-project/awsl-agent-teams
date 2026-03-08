/**
 * Conductor planning infrastructure.
 *
 * Externalizes state to .planning/ directory so context stays fresh
 * and project knowledge survives across sessions.
 */

import * as fs from "node:fs";
import * as path from "node:path";

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

export function atomicCommit(cwd: string, taskId: string, message: string): boolean {
	try {
		// Stage all changes
		execSync("git add -A", { cwd, stdio: "pipe" });
		// Check if there's anything to commit
		const status = execSync("git status --porcelain", { cwd, encoding: "utf-8" }).trim();
		if (!status) return false;
		// Commit
		const commitMsg = `${taskId}: ${message}`;
		execSync(`git commit -m ${JSON.stringify(commitMsg)}`, {
			cwd,
			stdio: "pipe",
		});
		return true;
	} catch {
		return false;
	}
}
