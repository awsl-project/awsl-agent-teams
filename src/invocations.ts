/**
 * Invocations — tracks how many times each skill/command type is invoked.
 *
 * Persists to .planning/STATS.json with per-type counters and timestamps.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "./log.js";
import { atomicWriteFileSync, withFileLock } from "./fs-utils.js";

// ─── Interfaces ──────────────────────────────────────────────

/** Valid invocation source types */
export type InvocationSource = "team" | "plan" | "go" | "quick" | "queue" | "cli" | "discuss";

export interface InvocationEntry {
	timestamp: string;
	source: InvocationSource;
	goal?: string;
}

export interface InvocationStats {
	counts: Record<InvocationSource, number>;
	recent: InvocationEntry[];
	updatedAt: string;
}

export interface StatsData {
	counts: Partial<Record<InvocationSource, number>>;
	recent: InvocationEntry[];
	updatedAt: string;
}

// ─── Constants ───────────────────────────────────────────────

const STATS_FILE = "STATS.json";
const MAX_RECENT = 100;

function statsPath(cwd: string): string {
	return path.join(cwd, ".planning", STATS_FILE);
}

function lockPath(cwd: string): string {
	return path.join(cwd, ".planning", ".stats.lock");
}

// ─── Functions ───────────────────────────────────────────────

/**
 * Load invocation stats from .planning/STATS.json.
 */
export function loadInvocationStats(cwd: string): StatsData {
	const filePath = statsPath(cwd);
	try {
		if (fs.existsSync(filePath)) {
			const content = fs.readFileSync(filePath, "utf-8");
			const parsed = JSON.parse(content);
			if (parsed && typeof parsed.counts === "object") {
				return parsed as StatsData;
			}
		}
	} catch {
		log.debug("invocations", `Could not load ${filePath}, returning empty stats`);
	}
	return { counts: {}, recent: [], updatedAt: new Date().toISOString() };
}

/**
 * Record a new invocation.
 */
export function trackInvocation(cwd: string, source: InvocationSource, goal?: string): void {
	const lp = lockPath(cwd);
	withFileLock(lp, () => {
		const data = loadInvocationStats(cwd);

		// Increment counter
		data.counts[source] = (data.counts[source] ?? 0) + 1;

		// Add to recent list (bounded)
		const entry: InvocationEntry = {
			timestamp: new Date().toISOString(),
			source,
		};
		if (goal) entry.goal = goal.slice(0, 200);
		data.recent.push(entry);
		if (data.recent.length > MAX_RECENT) {
			data.recent = data.recent.slice(-MAX_RECENT);
		}

		data.updatedAt = new Date().toISOString();

		// Write
		const filePath = statsPath(cwd);
		const dir = path.dirname(filePath);
		fs.mkdirSync(dir, { recursive: true });
		atomicWriteFileSync(filePath, JSON.stringify(data, null, 2));

		log.debug("invocations", `Tracked ${source} invocation (total: ${data.counts[source]})`);
	});
}

/**
 * Get aggregated invocation stats for display.
 */
export function getInvocationSummary(cwd: string): InvocationStats {
	const data = loadInvocationStats(cwd);
	const ALL_SOURCES: InvocationSource[] = ["team", "plan", "go", "quick", "queue", "cli", "discuss"];
	const counts = {} as Record<InvocationSource, number>;
	for (const s of ALL_SOURCES) {
		counts[s] = data.counts[s] ?? 0;
	}
	return {
		counts,
		recent: data.recent,
		updatedAt: data.updatedAt,
	};
}

/**
 * Validate a source string.
 */
export function isValidSource(s: string): s is InvocationSource {
	return ["team", "plan", "go", "quick", "queue", "cli", "discuss"].includes(s);
}
