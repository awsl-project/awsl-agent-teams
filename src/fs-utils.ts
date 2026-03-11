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

/**
 * Synchronous file-based mutex. Creates lockPath with flag "wx" (exclusive
 * create — fails if file already exists). Retries every 500ms for up to 10s.
 * The lock file is always removed in the finally block.
 */
export function withFileLock<T>(lockPath: string, fn: () => T): T {
	let acquired = false;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
			acquired = true;
			break;
		} catch (e: any) {
			if (e.code === "EEXIST") {
				// Lock held by another process — spin-wait synchronously
				const start = Date.now();
				while (Date.now() - start < RETRY_INTERVAL_MS) {
					// busy-wait (sync context, no setTimeout available)
				}
				continue;
			}
			throw e; // unexpected error
		}
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
 */
export async function withFileLockAsync<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
	let acquired = false;
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
			acquired = true;
			break;
		} catch (e: any) {
			if (e.code === "EEXIST") {
				await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS));
				continue;
			}
			throw e; // unexpected error
		}
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
