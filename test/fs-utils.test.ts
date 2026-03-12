import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { atomicWriteFileSync, withFileLock, withFileLockAsync } from "../src/fs-utils.js";

const tmpDir = path.join(os.tmpdir(), `fs-utils-test-${process.pid}`);

beforeEach(() => {
	fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("atomicWriteFileSync", () => {
	it("writes file with correct content", () => {
		const f = path.join(tmpDir, "test.json");
		atomicWriteFileSync(f, '{"ok":true}');
		assert.strictEqual(fs.readFileSync(f, "utf-8"), '{"ok":true}');
	});

	it("creates parent directories", () => {
		const f = path.join(tmpDir, "deep", "nested", "file.txt");
		atomicWriteFileSync(f, "hello");
		assert.strictEqual(fs.readFileSync(f, "utf-8"), "hello");
	});

	it("does not leave temp file on success", () => {
		const f = path.join(tmpDir, "clean.txt");
		atomicWriteFileSync(f, "data");
		const files = fs.readdirSync(tmpDir);
		assert.deepStrictEqual(files, ["clean.txt"]);
	});

	it("overwrites existing file atomically", () => {
		const f = path.join(tmpDir, "overwrite.txt");
		atomicWriteFileSync(f, "v1");
		atomicWriteFileSync(f, "v2");
		assert.strictEqual(fs.readFileSync(f, "utf-8"), "v2");
	});
});

describe("withFileLock", () => {
	it("executes function and returns result", () => {
		const lockPath = path.join(tmpDir, "test.lock");
		const result = withFileLock(lockPath, () => 42);
		assert.strictEqual(result, 42);
	});

	it("removes lock file after completion", () => {
		const lockPath = path.join(tmpDir, "test.lock");
		withFileLock(lockPath, () => {});
		assert.strictEqual(fs.existsSync(lockPath), false);
	});

	it("removes lock file after error", () => {
		const lockPath = path.join(tmpDir, "test.lock");
		assert.throws(() => {
			withFileLock(lockPath, () => { throw new Error("fail"); });
		}, /fail/);
		assert.strictEqual(fs.existsSync(lockPath), false);
	});

	it("cleans up stale lock from dead PID", () => {
		const lockPath = path.join(tmpDir, "stale.lock");
		// Write a lock with a PID that doesn't exist
		fs.writeFileSync(lockPath, "999999", { flag: "wx" });
		// Should acquire despite existing lock (stale detection)
		const result = withFileLock(lockPath, () => "acquired");
		assert.strictEqual(result, "acquired");
		assert.strictEqual(fs.existsSync(lockPath), false);
	});
});

describe("withFileLockAsync", () => {
	it("executes async function and returns result", async () => {
		const lockPath = path.join(tmpDir, "async.lock");
		const result = await withFileLockAsync(lockPath, async () => 99);
		assert.strictEqual(result, 99);
	});

	it("removes lock file after async completion", async () => {
		const lockPath = path.join(tmpDir, "async.lock");
		await withFileLockAsync(lockPath, async () => {});
		assert.strictEqual(fs.existsSync(lockPath), false);
	});

	it("cleans up stale lock from dead PID (async)", async () => {
		const lockPath = path.join(tmpDir, "stale-async.lock");
		fs.writeFileSync(lockPath, "999999", { flag: "wx" });
		const result = await withFileLockAsync(lockPath, async () => "ok");
		assert.strictEqual(result, "ok");
	});
});
