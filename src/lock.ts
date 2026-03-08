/**
 * Simple file-based lock to prevent concurrent AWSL runs on the same project.
 *
 * Lock file: .planning/.lock
 * Contains: { pid, sessionId, startedAt, description }
 * Stale after: 30 minutes (configurable)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "./log.js";

export interface LockInfo {
	pid: number;
	sessionId: string;
	startedAt: string;
	description: string;
}

const LOCK_FILE = ".lock";
const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function lockPath(cwd: string): string {
	return path.join(cwd, ".planning", LOCK_FILE);
}

/**
 * Check if a lock exists and is still valid (not stale).
 */
export function checkLock(cwd: string): LockInfo | null {
	const lp = lockPath(cwd);
	if (!fs.existsSync(lp)) return null;

	try {
		const content = fs.readFileSync(lp, "utf-8");
		const info: LockInfo = JSON.parse(content);

		// Check if stale
		const elapsed = Date.now() - new Date(info.startedAt).getTime();
		if (elapsed > STALE_TIMEOUT_MS) {
			log.warn("lock", `Stale lock found (${Math.round(elapsed / 60000)}min old), removing`);
			fs.unlinkSync(lp);
			return null;
		}

		// Check if process is still alive (only works for same-machine PIDs)
		if (info.pid && !isProcessAlive(info.pid)) {
			log.warn("lock", `Lock owner (PID ${info.pid}) is dead, removing stale lock`);
			fs.unlinkSync(lp);
			return null;
		}

		return info;
	} catch {
		// Corrupt lock file, remove it
		try { fs.unlinkSync(lp); } catch { /* ignore */ }
		return null;
	}
}

/**
 * Acquire lock. Returns true if acquired, false if already locked.
 */
export function acquireLock(cwd: string, description: string): { acquired: boolean; existingLock?: LockInfo } {
	const existing = checkLock(cwd);
	if (existing) {
		return { acquired: false, existingLock: existing };
	}

	const planningDir = path.join(cwd, ".planning");
	fs.mkdirSync(planningDir, { recursive: true });

	const info: LockInfo = {
		pid: process.pid,
		sessionId: generateSessionId(),
		startedAt: new Date().toISOString(),
		description,
	};

	try {
		// Use wx flag for atomic create (fails if file exists — race-safe)
		fs.writeFileSync(lockPath(cwd), JSON.stringify(info, null, 2), { flag: "wx" });
		log.info("lock", `Acquired lock: ${description} (PID ${process.pid})`);
		return { acquired: true };
	} catch (e: any) {
		if (e.code === "EEXIST") {
			// Another process created the lock between our check and write
			const existing = checkLock(cwd);
			return { acquired: false, existingLock: existing ?? undefined };
		}
		throw e;
	}
}

/**
 * Release lock. Only releases if we own it (matching PID).
 */
export function releaseLock(cwd: string): boolean {
	const lp = lockPath(cwd);
	if (!fs.existsSync(lp)) return true;

	try {
		const content = fs.readFileSync(lp, "utf-8");
		const info: LockInfo = JSON.parse(content);

		// Only release our own lock
		if (info.pid !== process.pid) {
			log.warn("lock", `Lock owned by PID ${info.pid}, not releasing`);
			return false;
		}

		fs.unlinkSync(lp);
		log.info("lock", "Lock released");
		return true;
	} catch {
		// If we can't read it, try to remove anyway
		try { fs.unlinkSync(lp); } catch { /* ignore */ }
		return true;
	}
}

/**
 * Force remove lock regardless of owner.
 */
export function forceReleaseLock(cwd: string): boolean {
	const lp = lockPath(cwd);
	try {
		if (fs.existsSync(lp)) {
			fs.unlinkSync(lp);
			log.info("lock", "Lock force-released");
		}
		return true;
	} catch {
		return false;
	}
}

/**
 * Format lock info for display.
 */
export function formatLockInfo(info: LockInfo): string {
	const elapsed = Date.now() - new Date(info.startedAt).getTime();
	const minutes = Math.round(elapsed / 60000);
	return `AWSL is already running on this project.
  Description: ${info.description}
  PID: ${info.pid}
  Started: ${info.startedAt} (${minutes}min ago)
  Session: ${info.sessionId}

Use --force to override, or wait for the other session to finish.`;
}

// ── Helpers ──

function generateSessionId(): string {
	return `awsl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0); // Signal 0 = check existence
		return true;
	} catch (e: any) {
		// ESRCH = no such process (Unix). EPERM = exists but no permission.
		// On Windows, process.kill(pid, 0) throws if process doesn't exist.
		if (e.code === "EPERM") return true; // exists but no permission
		return false;
	}
}
