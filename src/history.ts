/**
 * History — tracks task queue execution history for the dashboard.
 *
 * Persists history entries to .planning/HISTORY.json.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "./log.js";

// ─── Interfaces ──────────────────────────────────────────────

export interface WaveInfo {
	wave: number;
	taskIds: string[];
	agents: string[];
	parallel: number;
}

export interface HistoryEntry {
	id: string;
	date: string;
	project: string;
	projectPath: string;
	queueTaskId: string;
	goal: string;
	status: "done" | "failed";
	startedAt: string;
	completedAt: string;
	duration: number;
	tasksCompleted: number;
	tasksTotal: number;
	summary: string;
	engine?: string;
	commits?: number;
	inputTokens?: number;
	outputTokens?: number;
	costUsd?: number;
	/** Wave breakdown — which tasks ran in parallel */
	waves?: WaveInfo[];
	/** Unique agent roles used */
	agents?: string[];
	/** Peak parallel agents across all waves */
	maxConcurrency?: number;
	/** Task mode: build (default) or discuss */
	mode?: "build" | "discuss";
	/** Final answer text — only set for discuss mode */
	answer?: string;
}

export interface HistoryData {
	entries: HistoryEntry[];
	updatedAt: string;
}

export interface HistoryStats {
	totalRuns: number;
	totalDone: number;
	totalFailed: number;
	totalDuration: number;
	successRate: number;
	byDate: Record<string, HistoryEntry[]>;
	byProject: Record<string, HistoryEntry[]>;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalCostUsd: number;
	tokensByProject: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
}

// ─── Constants ───────────────────────────────────────────────

const HISTORY_FILE = "HISTORY.json";

function historyPath(cwd: string): string {
	return path.join(cwd, ".planning", HISTORY_FILE);
}

// ─── Functions ───────────────────────────────────────────────

/**
 * Load history data from .planning/HISTORY.json.
 * Returns empty history if the file is missing or invalid.
 */
export function loadHistory(cwd: string): HistoryData {
	const filePath = historyPath(cwd);
	try {
		if (fs.existsSync(filePath)) {
			const content = fs.readFileSync(filePath, "utf-8");
			const parsed = JSON.parse(content);
			if (parsed && Array.isArray(parsed.entries)) {
				return parsed as HistoryData;
			}
		}
	} catch {
		log.debug("history", `Could not load ${filePath}, returning empty history`);
	}
	return { entries: [], updatedAt: new Date().toISOString() };
}

/**
 * Append a history entry to .planning/HISTORY.json.
 * Auto-generates the entry ID (h_1, h_2, ...).
 */
export function appendHistory(cwd: string, entry: Omit<HistoryEntry, "id">): void {
	const data = loadHistory(cwd);
	const id = `h_${data.entries.length + 1}`;
	const fullEntry: HistoryEntry = { id, ...entry };
	data.entries.push(fullEntry);
	data.updatedAt = new Date().toISOString();

	const filePath = historyPath(cwd);
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");

	log.debug("history", `Appended ${id}: ${entry.status} — ${entry.goal}`);
}

/**
 * Delete the HISTORY.json file. Silently ignores errors.
 */
export function clearHistory(cwd: string): void {
	try {
		const filePath = historyPath(cwd);
		if (fs.existsSync(filePath)) {
			fs.unlinkSync(filePath);
		}
	} catch {
		/* ignore */
	}
}

/**
 * Compute aggregate stats from history data.
 */
export function getHistoryStats(data: HistoryData): HistoryStats {
	const totalRuns = data.entries.length;
	const totalDone = data.entries.filter(e => e.status === "done").length;
	const totalFailed = data.entries.filter(e => e.status === "failed").length;
	const totalDuration = data.entries.reduce((sum, e) => sum + e.duration, 0);
	const successRate = totalRuns > 0 ? Math.round((totalDone / totalRuns) * 100) : 0;

	const byDate: Record<string, HistoryEntry[]> = {};
	const byProject: Record<string, HistoryEntry[]> = {};

	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalCostUsd = 0;
	const tokensByProject: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }> = {};

	for (const entry of data.entries) {
		// Group by YYYY-MM-DD
		const dateKey = entry.date.slice(0, 10);
		if (!byDate[dateKey]) byDate[dateKey] = [];
		byDate[dateKey].push(entry);

		// Group by project name
		const proj = entry.project;
		if (!byProject[proj]) byProject[proj] = [];
		byProject[proj].push(entry);

		// Accumulate token usage
		totalInputTokens += entry.inputTokens ?? 0;
		totalOutputTokens += entry.outputTokens ?? 0;
		totalCostUsd += entry.costUsd ?? 0;

		if (!tokensByProject[proj]) tokensByProject[proj] = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
		tokensByProject[proj].inputTokens += entry.inputTokens ?? 0;
		tokensByProject[proj].outputTokens += entry.outputTokens ?? 0;
		tokensByProject[proj].costUsd += entry.costUsd ?? 0;
	}

	return {
		totalRuns,
		totalDone,
		totalFailed,
		totalDuration,
		successRate,
		byDate,
		byProject,
		totalInputTokens,
		totalOutputTokens,
		totalCostUsd,
		tokensByProject,
	};
}
