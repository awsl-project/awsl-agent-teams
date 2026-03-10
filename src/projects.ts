/**
 * ProjectManager — global project registry at ~/.awsl/projects.json.
 *
 * Tracks all projects that have used AWSL, providing a unified view
 * across directories. Used by the dashboard Projects page.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { log } from "./log.js";

// ─── Data Models ─────────────────────────────────────────────

export interface ProjectEntry {
	name: string;
	path: string;          // absolute, normalized — unique key
	addedAt: string;       // ISO timestamp
	lastActiveAt?: string; // ISO timestamp
	tags?: string[];
	engine?: string;
}

export interface ProjectRegistry {
	projects: ProjectEntry[];
	updatedAt: string;
}

export interface ProjectStatus {
	name: string;
	path: string;
	exists: boolean;
	hasPlanning: boolean;
	isLocked: boolean;
	queue: {
		pending: number;
		running: number;
		done: number;
		failed: number;
		total: number;
	};
	lastRun?: {
		date: string;
		status: string;
		goal: string;
		duration: number;
	};
}

// ─── Path normalization helper ───────────────────────────────

function normalizePath(p: string): string {
	return path.resolve(path.normalize(p));
}

// ─── ProjectManager ──────────────────────────────────────────

export class ProjectManager {
	/**
	 * Path to the global registry file.
	 * Testable: set (ProjectManager as any)._testRegistryPath to override.
	 */
	static registryPath(): string {
		if ((ProjectManager as any)._testRegistryPath) {
			return (ProjectManager as any)._testRegistryPath as string;
		}
		return path.join(os.homedir(), ".awsl", "projects.json");
	}

	/**
	 * Load registry from disk. Returns empty registry if file is missing.
	 * Auto-creates ~/.awsl/ directory.
	 */
	static load(): ProjectRegistry {
		const regPath = ProjectManager.registryPath();
		try {
			if (fs.existsSync(regPath)) {
				const content = fs.readFileSync(regPath, "utf-8");
				const parsed = JSON.parse(content);
				if (parsed && Array.isArray(parsed.projects)) {
					return parsed as ProjectRegistry;
				}
			}
		} catch {
			log.debug("projects", `Could not load ${regPath}, returning empty registry`);
		}
		return { projects: [], updatedAt: new Date().toISOString() };
	}

	/**
	 * Atomic write: write to temp file, then rename.
	 */
	static save(registry: ProjectRegistry): void {
		const regPath = ProjectManager.registryPath();
		const dir = path.dirname(regPath);
		fs.mkdirSync(dir, { recursive: true });

		registry.updatedAt = new Date().toISOString();
		const content = JSON.stringify(registry, null, 2);
		const tmpPath = regPath + `.tmp.${process.pid}`;

		try {
			fs.writeFileSync(tmpPath, content, "utf-8");
			fs.renameSync(tmpPath, regPath);
		} catch (e) {
			// Cleanup temp file on failure
			try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
			throw e;
		}
	}

	/**
	 * Add a project to the registry. Idempotent — returns existing entry if
	 * the same path is already registered.
	 */
	static add(projectPath: string, name?: string, tags?: string[]): ProjectEntry {
		const normalized = normalizePath(projectPath);
		const registry = ProjectManager.load();

		// Check for existing entry
		const existing = registry.projects.find(p => p.path === normalized);
		if (existing) {
			return existing;
		}

		const entry: ProjectEntry = {
			name: name ?? path.basename(normalized),
			path: normalized,
			addedAt: new Date().toISOString(),
		};
		if (tags && tags.length > 0) entry.tags = tags;

		registry.projects.push(entry);
		ProjectManager.save(registry);
		log.info("projects", `Registered project: ${entry.name} (${entry.path})`);
		return entry;
	}

	/**
	 * Remove a project by path.
	 */
	static remove(projectPath: string): boolean {
		const normalized = normalizePath(projectPath);
		const registry = ProjectManager.load();
		const idx = registry.projects.findIndex(p => p.path === normalized);
		if (idx === -1) return false;

		registry.projects.splice(idx, 1);
		ProjectManager.save(registry);
		log.info("projects", `Removed project: ${normalized}`);
		return true;
	}

	/**
	 * List all registered projects.
	 */
	static list(): ProjectEntry[] {
		return ProjectManager.load().projects;
	}

	/**
	 * Get a project by exact path.
	 */
	static get(projectPath: string): ProjectEntry | undefined {
		const normalized = normalizePath(projectPath);
		return ProjectManager.load().projects.find(p => p.path === normalized);
	}

	/**
	 * Fuzzy find — try exact path match first, then name match (case-insensitive).
	 */
	static find(nameOrPath: string): ProjectEntry | undefined {
		const registry = ProjectManager.load();

		// Try exact path match
		const normalized = normalizePath(nameOrPath);
		const byPath = registry.projects.find(p => p.path === normalized);
		if (byPath) return byPath;

		// Try name match (case-insensitive)
		const lower = nameOrPath.toLowerCase();
		return registry.projects.find(p => p.name.toLowerCase() === lower);
	}

	/**
	 * Get status for a single project entry.
	 * Reads .planning/QUEUE.json for queue counts, .planning/.lock for isLocked,
	 * .planning/HISTORY.json for lastRun.
	 */
	static getStatus(entry: ProjectEntry): ProjectStatus {
		const exists = fs.existsSync(entry.path);
		const planningDir = path.join(entry.path, ".planning");
		const hasPlanning = fs.existsSync(planningDir);

		// Lock check
		let isLocked = false;
		if (hasPlanning) {
			try {
				const lockFile = path.join(planningDir, ".lock");
				isLocked = fs.existsSync(lockFile);
			} catch { /* ignore */ }
		}

		// Queue counts
		const queue = { pending: 0, running: 0, done: 0, failed: 0, total: 0 };
		if (hasPlanning) {
			try {
				const queuePath = path.join(planningDir, "QUEUE.json");
				if (fs.existsSync(queuePath)) {
					const raw = fs.readFileSync(queuePath, "utf-8");
					const data = JSON.parse(raw);
					if (data && Array.isArray(data.tasks)) {
						for (const task of data.tasks) {
							queue.total++;
							if (task.status === "pending") queue.pending++;
							else if (task.status === "running") queue.running++;
							else if (task.status === "done") queue.done++;
							else if (task.status === "failed") queue.failed++;
						}
					}
				}
			} catch { /* ignore corrupt queue */ }
		}

		// Last run from history
		let lastRun: ProjectStatus["lastRun"];
		if (hasPlanning) {
			try {
				const historyPath = path.join(planningDir, "HISTORY.json");
				if (fs.existsSync(historyPath)) {
					const raw = fs.readFileSync(historyPath, "utf-8");
					const data = JSON.parse(raw);
					if (data && Array.isArray(data.entries) && data.entries.length > 0) {
						const last = data.entries[data.entries.length - 1];
						lastRun = {
							date: last.date ?? last.completedAt ?? "",
							status: last.status ?? "unknown",
							goal: last.goal ?? "",
							duration: last.duration ?? 0,
						};
					}
				}
			} catch { /* ignore corrupt history */ }
		}

		return {
			name: entry.name,
			path: entry.path,
			exists,
			hasPlanning,
			isLocked,
			queue,
			lastRun,
		};
	}

	/**
	 * Get statuses for all registered projects. Fails soft per project.
	 */
	static getAllStatuses(): ProjectStatus[] {
		const entries = ProjectManager.list();
		return entries.map(entry => {
			try {
				return ProjectManager.getStatus(entry);
			} catch (e) {
				log.debug("projects", `Failed to get status for ${entry.path}: ${e}`);
				return {
					name: entry.name,
					path: entry.path,
					exists: false,
					hasPlanning: false,
					isLocked: false,
					queue: { pending: 0, running: 0, done: 0, failed: 0, total: 0 },
				};
			}
		});
	}

	/**
	 * Update lastActiveAt timestamp for a project.
	 */
	static touch(projectPath: string): void {
		const normalized = normalizePath(projectPath);
		const registry = ProjectManager.load();
		const entry = registry.projects.find(p => p.path === normalized);
		if (!entry) return;

		entry.lastActiveAt = new Date().toISOString();
		ProjectManager.save(registry);
	}

	/**
	 * Recursively scan a directory for projects (directories containing .planning/ or .git).
	 */
	static scan(dir: string, depth: number = 2): string[] {
		const results: string[] = [];
		const resolvedDir = normalizePath(dir);

		function walk(current: string, currentDepth: number): void {
			if (currentDepth > depth) return;

			try {
				const entries = fs.readdirSync(current, { withFileTypes: true });
				const hasPlanning = entries.some(e => e.isDirectory() && e.name === ".planning");
				const hasGit = entries.some(e => e.isDirectory() && e.name === ".git");

				if (hasPlanning || hasGit) {
					results.push(current);
				}

				// Recurse into subdirectories (skip node_modules, .git, etc.)
				for (const entry of entries) {
					if (!entry.isDirectory()) continue;
					if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
					walk(path.join(current, entry.name), currentDepth + 1);
				}
			} catch {
				// Skip unreadable directories
			}
		}

		walk(resolvedDir, 0);
		return results;
	}
}
