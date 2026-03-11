/**
 * Summary — night session summary module.
 *
 * Aggregates HISTORY.json entries + git commits for a time range
 * (default: 22:00 → 06:00) to summarize what was accomplished.
 */

import { execSync } from "node:child_process";
import { log } from "./log.js";
import { loadHistory, type HistoryEntry } from "./history.js";
import { ProjectManager } from "./projects.js";

// ─── Interfaces ──────────────────────────────────────────────

export interface TimeRange {
	from: Date;
	to: Date;
}

export interface CommitInfo {
	hash: string;
	message: string;
	date: string;
	author: string;
}

export interface SessionSummary {
	timeRange: TimeRange;
	tasks: {
		total: number;
		done: number;
		failed: number;
		entries: HistoryEntry[];
	};
	git: {
		commitCount: number;
		commits: CommitInfo[];
	};
	totalDuration: number;
	totalCostUsd: number;
	totalInputTokens: number;
	totalOutputTokens: number;
	agentBreakdown: Record<string, number>;
	projects: string[];
}

export interface SummaryOptions {
	from?: string;
	to?: string;
	date?: string;
	allProjects?: boolean;
	cwd?: string;
}

// ─── Time helpers ────────────────────────────────────────────

function parseHHMM(timeStr: string): { hours: number; minutes: number } {
	const parts = timeStr.split(":");
	return { hours: parseInt(parts[0], 10), minutes: parseInt(parts[1], 10) };
}

/**
 * Compute the time range for a night session.
 *
 * Cross-midnight logic:
 * - If --date given: from = dateT{fromHH:MM}, to = date+1T{toHH:MM}
 * - If no date and now < 06:00: from = yesterday {fromHH:MM}, to = today {toHH:MM}
 * - If no date and now >= 22:00: from = today {fromHH:MM}, to = tomorrow {toHH:MM}
 * - Otherwise (06:00-22:00): from = yesterday {fromHH:MM}, to = today {toHH:MM}
 *
 * @param nowOverride — injectable "now" for testing
 */
export function computeTimeRange(options: SummaryOptions, nowOverride?: Date): TimeRange {
	const fromTime = parseHHMM(options.from ?? "22:00");
	const toTime = parseHHMM(options.to ?? "06:00");

	if (options.date) {
		// Explicit date: from = dateT22:00, to = date+1T06:00
		const parts = options.date.split("-");
		const year = parseInt(parts[0], 10);
		const month = parseInt(parts[1], 10) - 1;
		const day = parseInt(parts[2], 10);

		const from = new Date(year, month, day, fromTime.hours, fromTime.minutes, 0, 0);
		const to = new Date(year, month, day + 1, toTime.hours, toTime.minutes, 0, 0);
		return { from, to };
	}

	const now = nowOverride ?? new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const day = now.getDate();

	if (now.getHours() < 6) {
		// Before 6 AM → last night: yesterday fromHH → today toHH
		const from = new Date(year, month, day - 1, fromTime.hours, fromTime.minutes, 0, 0);
		const to = new Date(year, month, day, toTime.hours, toTime.minutes, 0, 0);
		return { from, to };
	}

	if (now.getHours() >= 22) {
		// After 10 PM → tonight: today fromHH → tomorrow toHH
		const from = new Date(year, month, day, fromTime.hours, fromTime.minutes, 0, 0);
		const to = new Date(year, month, day + 1, toTime.hours, toTime.minutes, 0, 0);
		return { from, to };
	}

	// Daytime (06:00-22:00) → last night: yesterday fromHH → today toHH
	const from = new Date(year, month, day - 1, fromTime.hours, fromTime.minutes, 0, 0);
	const to = new Date(year, month, day, toTime.hours, toTime.minutes, 0, 0);
	return { from, to };
}

// ─── Git helper ──────────────────────────────────────────────

function getGitCommits(cwd: string, from: Date, to: Date): CommitInfo[] {
	try {
		const fromISO = from.toISOString();
		const toISO = to.toISOString();
		const format = "%H|%s|%aI|%an";
		const output = execSync(
			`git log --after="${fromISO}" --before="${toISO}" --format="${format}"`,
			{ cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
		).trim();

		if (!output) return [];

		return output.split("\n").map((line) => {
			const [hash, message, date, author] = line.split("|");
			return { hash, message, date, author };
		});
	} catch {
		log.debug("summary", `git log failed in ${cwd}, skipping git dimension`);
		return [];
	}
}

// ─── Core function ───────────────────────────────────────────

/**
 * Generate a session summary by aggregating HISTORY.json entries
 * and git commits within the computed time range.
 */
export function generateSummary(options: SummaryOptions): SessionSummary {
	const cwd = options.cwd ?? process.cwd();
	const timeRange = computeTimeRange(options);
	const fromMs = timeRange.from.getTime();
	const toMs = timeRange.to.getTime();

	// Collect history entries
	const allEntries: HistoryEntry[] = [];

	if (options.allProjects) {
		const projects = ProjectManager.list();
		for (const proj of projects) {
			try {
				const data = loadHistory(proj.path);
				allEntries.push(...data.entries);
			} catch {
				log.warn("summary", `Skipping project ${proj.name}: could not load history`);
			}
		}
	} else {
		const data = loadHistory(cwd);
		allEntries.push(...data.entries);
	}

	// Filter entries within time range
	const filtered = allEntries.filter((entry) => {
		const startedAt = new Date(entry.startedAt).getTime();
		const completedAt = new Date(entry.completedAt).getTime();
		return (startedAt >= fromMs && startedAt <= toMs) ||
			(completedAt >= fromMs && completedAt <= toMs);
	});

	// Collect git commits
	let allCommits: CommitInfo[] = [];
	if (options.allProjects) {
		const projects = ProjectManager.list();
		for (const proj of projects) {
			allCommits.push(...getGitCommits(proj.path, timeRange.from, timeRange.to));
		}
	} else {
		allCommits = getGitCommits(cwd, timeRange.from, timeRange.to);
	}

	// Aggregate metrics
	let totalDuration = 0;
	let totalCostUsd = 0;
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	const agentBreakdown: Record<string, number> = {};
	const projectSet = new Set<string>();

	for (const entry of filtered) {
		totalDuration += entry.duration ?? 0;
		totalCostUsd += entry.costUsd ?? 0;
		totalInputTokens += entry.inputTokens ?? 0;
		totalOutputTokens += entry.outputTokens ?? 0;

		if (entry.agents) {
			for (const agent of entry.agents) {
				agentBreakdown[agent] = (agentBreakdown[agent] ?? 0) + 1;
			}
		}

		if (entry.project) {
			projectSet.add(entry.project);
		}
	}

	const done = filtered.filter((e) => e.status === "done").length;
	const failed = filtered.filter((e) => e.status === "failed").length;

	return {
		timeRange,
		tasks: {
			total: filtered.length,
			done,
			failed,
			entries: filtered,
		},
		git: {
			commitCount: allCommits.length,
			commits: allCommits,
		},
		totalDuration,
		totalCostUsd,
		totalInputTokens,
		totalOutputTokens,
		agentBreakdown,
		projects: [...projectSet],
	};
}

// ─── Formatting helpers ─────────────────────────────────────

function formatDuration(ms: number): string {
	if (ms <= 0) return "0m";
	const totalMinutes = Math.floor(ms / 60000);
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

function formatTokens(count: number): string {
	if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
	if (count >= 1000) return `${Math.round(count / 1000)}K`;
	return String(count);
}

function formatDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const h = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${day} ${h}:${min}`;
}

function formatTimeOnly(d: Date): string {
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Format a SessionSummary into a pretty CLI string with box-drawing chars.
 */
export function formatSummary(summary: SessionSummary): string {
	const { timeRange, tasks, git, totalDuration, totalCostUsd, totalInputTokens, totalOutputTokens, agentBreakdown, projects } = summary;

	if (tasks.total === 0 && git.commitCount === 0) {
		return "No activity found in this time range.";
	}

	const fromStr = formatDate(timeRange.from);
	const toStr = formatDate(timeRange.to);
	const header = `Night Summary: ${fromStr} → ${toStr}`;

	const lines: string[] = [];
	const width = 52;
	const top = `╔${"═".repeat(width)}╗`;
	const mid = `╠${"═".repeat(width)}╣`;
	const bot = `╚${"═".repeat(width)}╝`;

	lines.push(top);
	lines.push(`║  ${header.padEnd(width - 2)}║`);
	lines.push(mid);
	lines.push("");

	// Stats
	const successRate = tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0;
	if (tasks.total > 0) {
		lines.push(`  Tasks:    ${tasks.done} done, ${tasks.failed} failed (${successRate}% success)`);
	}
	lines.push(`  Duration: ${formatDuration(totalDuration)} (active execution time)`);
	lines.push(`  Cost:     $${totalCostUsd.toFixed(2)}`);
	lines.push(`  Tokens:   ${formatTokens(totalInputTokens)} in / ${formatTokens(totalOutputTokens)} out`);
	lines.push(`  Commits:  ${git.commitCount}`);
	lines.push("");

	// Agent breakdown
	const agentEntries = Object.entries(agentBreakdown).sort((a, b) => b[1] - a[1]);
	if (agentEntries.length > 0) {
		lines.push("  Agent Breakdown:");
		for (const [agent, count] of agentEntries) {
			const label = count === 1 ? "task" : "tasks";
			lines.push(`    ${agent.padEnd(10)}${count} ${label}`);
		}
		lines.push("");
	}

	// Timeline
	if (tasks.entries.length > 0) {
		const sorted = [...tasks.entries].sort(
			(a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
		);
		lines.push("  Timeline:");
		for (const entry of sorted) {
			const startTime = formatTimeOnly(new Date(entry.startedAt));
			const status = entry.status === "done" ? "[done]" : "[failed]";
			const dur = formatDuration(entry.duration ?? 0);
			const cost = `$${(entry.costUsd ?? 0).toFixed(2)}`;
			lines.push(`    ${startTime}  ${status.padEnd(8)} ${entry.goal} (${dur}, ${cost})`);
		}
		lines.push("");
	}

	// Projects
	if (projects.length > 0) {
		lines.push(`  Projects: ${projects.join(", ")}`);
		lines.push("");
	}

	lines.push(bot);

	return lines.join("\n");
}
