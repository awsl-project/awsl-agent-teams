/**
 * System-level task scheduler — registers one-shot jobs to trigger
 * queue execution at a specified time.
 *
 * Windows: schtasks (Task Scheduler)
 * Unix: at command
 */

import { execFileSync, spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";

const JOB_PREFIX = "awsl-";

/** Resolve path to the compiled CLI entry point (dist/cli.js). */
function getCliPath(): string {
	const thisFile = fileURLToPath(import.meta.url);
	return path.join(path.dirname(thisFile), "cli.js");
}

/**
 * Schedule a one-shot system job to run `queue start --once` at the given time.
 */
export function scheduleQueueRun(taskId: string, runAt: Date, cwd: string): void {
	const jobName = `${JOB_PREFIX}${taskId}`;
	const cliPath = getCliPath();
	const nodePath = process.execPath;

	if (process.platform === "win32") {
		scheduleWindows(jobName, runAt, nodePath, cliPath, cwd);
	} else {
		scheduleUnix(runAt, nodePath, cliPath, cwd);
	}
}

/**
 * Cancel a previously scheduled job.
 */
export function cancelScheduledRun(taskId: string): void {
	const jobName = `${JOB_PREFIX}${taskId}`;

	if (process.platform === "win32") {
		try {
			execFileSync("schtasks", ["/delete", "/tn", jobName, "/f"], { stdio: "pipe" });
			log.info("scheduler", `Cancelled scheduled job: ${taskId}`);
		} catch {
			// Job might not exist, that's fine
		}
	}
	// Unix `at` jobs require tracking job IDs — best-effort only
}

/**
 * List scheduled awsl jobs (Windows only).
 * Returns task names that match the awsl- prefix.
 */
export function listScheduledRuns(): string[] {
	if (process.platform !== "win32") return [];

	try {
		const result = execFileSync("schtasks", [
			"/query", "/fo", "CSV", "/nh",
		], { stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" });

		const lines = (result as string).split("\n");
		const jobs: string[] = [];
		for (const line of lines) {
			const match = line.match(/"([^"]*awsl-[^"]*)"/);
			if (match) jobs.push(match[1]);
		}
		return jobs;
	} catch {
		return [];
	}
}

// ─── Platform-specific implementations ──────────────────

function scheduleWindows(
	jobName: string, runAt: Date, nodePath: string, cliPath: string, cwd: string,
): void {
	const hours = String(runAt.getHours()).padStart(2, "0");
	const minutes = String(runAt.getMinutes()).padStart(2, "0");
	const timeStr = `${hours}:${minutes}`;

	const month = String(runAt.getMonth() + 1).padStart(2, "0");
	const day = String(runAt.getDate()).padStart(2, "0");
	const year = runAt.getFullYear();
	const dateStr = `${month}/${day}/${year}`;

	// Build command for Task Scheduler
	const command = `"${nodePath}" "${cliPath}" queue start --cwd "${cwd}" --once`;

	try {
		execFileSync("schtasks", [
			"/create",
			"/tn", jobName,
			"/tr", command,
			"/sc", "once",
			"/st", timeStr,
			"/sd", dateStr,
			"/f",
		], { stdio: "pipe" });
		log.info("scheduler", `Scheduled ${jobName} at ${runAt.toLocaleString()}`);
	} catch (e: any) {
		const msg = e.stderr?.toString().trim() ?? e.message;
		log.warn("scheduler", `Failed to create scheduled task: ${msg}`);
	}
}

function scheduleUnix(
	runAt: Date, nodePath: string, cliPath: string, cwd: string,
): void {
	const command = `"${nodePath}" "${cliPath}" queue start --cwd "${cwd}" --once`;

	// Format for `at`: HH:MM MM/DD/YYYY
	const hours = String(runAt.getHours()).padStart(2, "0");
	const minutes = String(runAt.getMinutes()).padStart(2, "0");
	const timeStr = `${hours}:${minutes}`;

	const month = String(runAt.getMonth() + 1).padStart(2, "0");
	const day = String(runAt.getDate()).padStart(2, "0");
	const year = runAt.getFullYear();
	const dateStr = `${month}/${day}/${year}`;

	try {
		const result = spawnSync("at", [timeStr, dateStr], {
			input: command + "\n",
			stdio: ["pipe", "pipe", "pipe"],
			encoding: "utf-8",
		});
		if (result.status === 0) {
			log.info("scheduler", `Scheduled via 'at' at ${runAt.toLocaleString()}`);
		} else {
			log.warn("scheduler", `'at' command failed: ${result.stderr}`);
		}
	} catch (e: any) {
		log.warn("scheduler", `Failed to schedule with 'at': ${e.message}`);
	}
}
