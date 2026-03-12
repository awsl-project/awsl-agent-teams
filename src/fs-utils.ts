/**
 * Filesystem utilities — shared atomic write helpers and file-based mutex.
 *
 * Extracted from projects.ts to provide a reusable atomic write
 * that prevents partial/corrupt files on crash or power loss.
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Write a file atomically: write to a temp file first, then rename.
 * Ensures the parent directory exists (created recursively if needed).
 *
 * On failure the temp file is cleaned up and the original error is re-thrown.
 */
export function atomicWriteFileSync(filePath: string, content: string): void {
	const dir = path.dirname(filePath);
	fs.mkdirSync(dir, { recursive: true });

	const tmpPath = filePath + `.tmp.${process.pid}`;
	try {
		fs.writeFileSync(tmpPath, content, "utf-8");
		fs.renameSync(tmpPath, filePath);
	} catch (e) {
		try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
		throw e;
	}
}

// ─── File-based mutex ────────────────────────────────────────

const MAX_RETRIES = 20;
const RETRY_INTERVAL_MS = 500;

/** Check if the process that holds the lock is still alive. */
function isLockStale(lockPath: string): boolean {
	try {
		const content = fs.readFileSync(lockPath, "utf-8");
		const pid = parseInt(content, 10);
		if (isNaN(pid)) return true;
		try {
			process.kill(pid, 0); // signal 0 = check existence
			return false; // alive
		} catch (e: any) {
			if (e.code === "EPERM") return false; // alive but no permission
			return true; // ESRCH = dead
		}
	} catch {
		return true; // can't read = treat as stale
	}
}

/** Try to acquire lock. If held by a dead process, remove stale lock. */
function tryAcquireLock(lockPath: string): boolean {
	try {
		fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
		return true;
	} catch (e: any) {
		if (e.code === "EEXIST") {
			if (isLockStale(lockPath)) {
				try { fs.unlinkSync(lockPath); } catch { /* race: another process took it */ }
			}
			return false;
		}
		throw e;
	}
}

/**
 * Synchronous file-based mutex. Creates lockPath with flag "wx" (exclusive
 * create — fails if file already exists). Retries every 500ms for up to 10s.
 * Stale locks (owner PID dead) are automatically cleaned up.
 * Uses Atomics.wait for non-busy sleep in sync context.
 */
export function withFileLock<T>(lockPath: string, fn: () => T): T {
	let acquired = false;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		if (tryAcquireLock(lockPath)) {
			acquired = true;
			break;
		}
		// Non-busy sync sleep using Atomics.wait
		Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_INTERVAL_MS);
	}
	if (!acquired) {
		throw new Error(`Failed to acquire file lock ${lockPath} after ${MAX_RETRIES} retries`);
	}
	try {
		return fn();
	} finally {
		try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
	}
}

/**
 * Async file-based mutex. Same semantics as withFileLock but uses
 * non-blocking sleep between retries, suitable for async contexts.
 * Stale locks (owner PID dead) are automatically cleaned up.
 */
export async function withFileLockAsync<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
	let acquired = false;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		if (tryAcquireLock(lockPath)) {
			acquired = true;
			break;
		}
		await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
	}
	if (!acquired) {
		throw new Error(`Failed to acquire file lock ${lockPath} after ${MAX_RETRIES} retries`);
	}
	try {
		return await fn();
	} finally {
		try { fs.unlinkSync(lockPath); } catch { /* ignore */ }
	}
}
