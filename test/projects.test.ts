/**
 * Tests for ProjectManager — global project registry.
 *
 * Covers: CRUD, status reading, scan, edge cases.
 * Run with: npx tsx --test test/projects.test.ts
 */

import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { ProjectManager } from "../src/projects.js"

// ─── Test helpers ────────────────────────────────────────────

let testDir: string

beforeEach(() => {
	testDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-proj-test-"))
	;(ProjectManager as any)._testRegistryPath = path.join(testDir, "registry", "projects.json")
})

afterEach(() => {
	delete (ProjectManager as any)._testRegistryPath
	fs.rmSync(testDir, { recursive: true, force: true })
})

// ─── 1. registryPath ────────────────────────────────────────

describe("registryPath()", () => {
	it("returns ~/.awsl/projects.json by default", () => {
		// Temporarily remove override
		delete (ProjectManager as any)._testRegistryPath
		const result = ProjectManager.registryPath()
		const expected = path.join(os.homedir(), ".awsl", "projects.json")
		assert.equal(result, expected)
		// Restore for afterEach cleanup
		;(ProjectManager as any)._testRegistryPath = path.join(testDir, "registry", "projects.json")
	})
})

// ─── 2. load() empty ────────────────────────────────────────

describe("load()", () => {
	it("returns empty registry when file does not exist", () => {
		const reg = ProjectManager.load()
		assert.ok(Array.isArray(reg.projects))
		assert.equal(reg.projects.length, 0)
		assert.equal(typeof reg.updatedAt, "string")
	})
})

// ─── 3. add() creates entry with correct fields ─────────────

describe("add()", () => {
	it("creates entry with correct fields, name defaults to basename", () => {
		const projectPath = path.join(testDir, "cool-app")
		fs.mkdirSync(projectPath, { recursive: true })

		const entry = ProjectManager.add(projectPath)
		assert.equal(entry.name, "cool-app")
		assert.equal(entry.path, path.resolve(path.normalize(projectPath)))
		assert.equal(typeof entry.addedAt, "string")
		// Verify ISO timestamp format
		assert.ok(!isNaN(Date.parse(entry.addedAt)))
	})

	it("uses provided name and tags when given", () => {
		const projectPath = path.join(testDir, "my-proj")
		fs.mkdirSync(projectPath, { recursive: true })

		const entry = ProjectManager.add(projectPath, "Custom Name", ["web", "api"])
		assert.equal(entry.name, "Custom Name")
		assert.deepEqual(entry.tags, ["web", "api"])
	})

	// ─── 4. add() idempotent ─────────────────────────────────

	it("is idempotent — same path returns existing entry", () => {
		const projectPath = path.join(testDir, "idempotent")
		fs.mkdirSync(projectPath, { recursive: true })

		const first = ProjectManager.add(projectPath, "First Name")
		const second = ProjectManager.add(projectPath, "Different Name")

		assert.equal(second.name, "First Name")
		assert.equal(ProjectManager.list().length, 1)
	})

	// ─── 5. add() normalizes paths ──────────────────────────

	it("normalizes paths to absolute", () => {
		const projectPath = path.join(testDir, "sub", "..", "normalized-proj")
		fs.mkdirSync(path.join(testDir, "normalized-proj"), { recursive: true })

		const entry = ProjectManager.add(projectPath)
		const expected = path.resolve(path.normalize(projectPath))
		assert.equal(entry.path, expected)
		// No ".." in the stored path
		assert.ok(!entry.path.includes(".."))
	})
})

// ─── 6–7. remove() ──────────────────────────────────────────

describe("remove()", () => {
	it("removes existing entry and returns true", () => {
		const projectPath = path.join(testDir, "to-remove")
		fs.mkdirSync(projectPath, { recursive: true })

		ProjectManager.add(projectPath)
		assert.equal(ProjectManager.list().length, 1)

		const result = ProjectManager.remove(projectPath)
		assert.equal(result, true)
		assert.equal(ProjectManager.list().length, 0)
	})

	it("returns false for non-existent path", () => {
		const result = ProjectManager.remove(path.join(testDir, "never-added"))
		assert.equal(result, false)
	})
})

// ─── 8. list() ──────────────────────────────────────────────

describe("list()", () => {
	it("returns all entries", () => {
		const p1 = path.join(testDir, "proj-a")
		const p2 = path.join(testDir, "proj-b")
		const p3 = path.join(testDir, "proj-c")
		fs.mkdirSync(p1, { recursive: true })
		fs.mkdirSync(p2, { recursive: true })
		fs.mkdirSync(p3, { recursive: true })

		ProjectManager.add(p1, "A")
		ProjectManager.add(p2, "B")
		ProjectManager.add(p3, "C")

		const all = ProjectManager.list()
		assert.equal(all.length, 3)
		const names = all.map(e => e.name).sort()
		assert.deepEqual(names, ["A", "B", "C"])
	})
})

// ─── 9. get() by exact path ─────────────────────────────────

describe("get()", () => {
	it("finds by exact path", () => {
		const projectPath = path.join(testDir, "exact-match")
		fs.mkdirSync(projectPath, { recursive: true })

		ProjectManager.add(projectPath, "Exact")
		const found = ProjectManager.get(projectPath)
		assert.ok(found)
		assert.equal(found.name, "Exact")
	})

	it("returns undefined for unknown path", () => {
		const found = ProjectManager.get(path.join(testDir, "nope"))
		assert.equal(found, undefined)
	})
})

// ─── 10–11. find() ──────────────────────────────────────────

describe("find()", () => {
	it("finds by name (case-insensitive)", () => {
		const projectPath = path.join(testDir, "findable")
		fs.mkdirSync(projectPath, { recursive: true })

		ProjectManager.add(projectPath, "My Cool Project")

		const found = ProjectManager.find("my cool project")
		assert.ok(found)
		assert.equal(found.name, "My Cool Project")

		const upper = ProjectManager.find("MY COOL PROJECT")
		assert.ok(upper)
		assert.equal(upper.name, "My Cool Project")
	})

	it("finds by path", () => {
		const projectPath = path.join(testDir, "path-find")
		fs.mkdirSync(projectPath, { recursive: true })

		ProjectManager.add(projectPath, "PathFind")
		const found = ProjectManager.find(projectPath)
		assert.ok(found)
		assert.equal(found.name, "PathFind")
	})

	it("returns undefined for unknown name or path", () => {
		assert.equal(ProjectManager.find("nonexistent"), undefined)
	})
})

// ─── 12. getStatus() reads queue counts ─────────────────────

describe("getStatus()", () => {
	it("reads queue counts from .planning/QUEUE.json", () => {
		const projectPath = path.join(testDir, "queue-proj")
		const planningDir = path.join(projectPath, ".planning")
		fs.mkdirSync(planningDir, { recursive: true })

		const queueData = {
			tasks: [
				{ id: "q_1", goal: "task 1", status: "done", options: {} },
				{ id: "q_2", goal: "task 2", status: "running", options: {} },
				{ id: "q_3", goal: "task 3", status: "pending", options: {} },
				{ id: "q_4", goal: "task 4", status: "pending", options: {} },
				{ id: "q_5", goal: "task 5", status: "failed", options: {} },
			],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		}
		fs.writeFileSync(path.join(planningDir, "QUEUE.json"), JSON.stringify(queueData))

		const entry = ProjectManager.add(projectPath)
		const status = ProjectManager.getStatus(entry)

		assert.equal(status.queue.total, 5)
		assert.equal(status.queue.done, 1)
		assert.equal(status.queue.running, 1)
		assert.equal(status.queue.pending, 2)
		assert.equal(status.queue.failed, 1)
		assert.equal(status.hasPlanning, true)
	})

	it("reads lastRun from .planning/HISTORY.json", () => {
		const projectPath = path.join(testDir, "history-proj")
		const planningDir = path.join(projectPath, ".planning")
		fs.mkdirSync(planningDir, { recursive: true })

		const historyData = {
			entries: [
				{ date: "2026-03-09T10:00:00Z", status: "done", goal: "first run", duration: 120 },
				{ date: "2026-03-10T14:30:00Z", status: "done", goal: "second run", duration: 85 },
			],
		}
		fs.writeFileSync(path.join(planningDir, "HISTORY.json"), JSON.stringify(historyData))

		const entry = ProjectManager.add(projectPath)
		const status = ProjectManager.getStatus(entry)

		assert.ok(status.lastRun)
		assert.equal(status.lastRun.date, "2026-03-10T14:30:00Z")
		assert.equal(status.lastRun.status, "done")
		assert.equal(status.lastRun.goal, "second run")
		assert.equal(status.lastRun.duration, 85)
	})

	it("detects .lock file as isLocked", () => {
		const projectPath = path.join(testDir, "locked-proj")
		const planningDir = path.join(projectPath, ".planning")
		fs.mkdirSync(planningDir, { recursive: true })
		fs.writeFileSync(path.join(planningDir, ".lock"), "locked")

		const entry = ProjectManager.add(projectPath)
		const status = ProjectManager.getStatus(entry)
		assert.equal(status.isLocked, true)
	})

	// ─── 13. getStatus() handles missing .planning/ ─────────

	it("handles missing .planning/ gracefully", () => {
		const projectPath = path.join(testDir, "no-planning")
		fs.mkdirSync(projectPath, { recursive: true })

		const entry = ProjectManager.add(projectPath)
		const status = ProjectManager.getStatus(entry)

		assert.equal(status.exists, true)
		assert.equal(status.hasPlanning, false)
		assert.equal(status.isLocked, false)
		assert.equal(status.queue.total, 0)
		assert.equal(status.queue.pending, 0)
		assert.equal(status.queue.running, 0)
		assert.equal(status.queue.done, 0)
		assert.equal(status.queue.failed, 0)
		assert.equal(status.lastRun, undefined)
	})

	it("handles non-existent project directory", () => {
		const projectPath = path.join(testDir, "ghost-project")
		// Do NOT create the directory
		const entry = ProjectManager.add(projectPath)
		const status = ProjectManager.getStatus(entry)

		assert.equal(status.exists, false)
		assert.equal(status.hasPlanning, false)
		assert.equal(status.queue.total, 0)
	})
})

// ─── 14. scan() ─────────────────────────────────────────────

describe("scan()", () => {
	it("finds directories with .planning/ or .git", () => {
		const scanRoot = path.join(testDir, "scan-root")
		const p1 = path.join(scanRoot, "project-a")
		const p2 = path.join(scanRoot, "nested", "project-b")
		const p3 = path.join(scanRoot, "has-git")
		const p4 = path.join(scanRoot, "empty-dir")

		fs.mkdirSync(path.join(p1, ".planning"), { recursive: true })
		fs.mkdirSync(path.join(p2, ".planning"), { recursive: true })
		fs.mkdirSync(path.join(p3, ".git"), { recursive: true })
		fs.mkdirSync(p4, { recursive: true })

		const results = ProjectManager.scan(scanRoot, 3)
		const normalized = results.map(r => path.resolve(path.normalize(r)))

		// Should find p1, p2, p3 but not p4
		assert.ok(normalized.includes(path.resolve(p1)), "found project-a with .planning/")
		assert.ok(normalized.includes(path.resolve(p3)), "found has-git with .git/")
		assert.ok(!normalized.includes(path.resolve(p4)), "did not find empty-dir")
		assert.ok(results.length >= 3, `expected at least 3 results, got ${results.length}`)
	})

	it("respects depth limit", () => {
		const scanRoot = path.join(testDir, "depth-root")
		const shallow = path.join(scanRoot, "shallow")
		const deep = path.join(scanRoot, "a", "b", "c", "deep")

		fs.mkdirSync(path.join(shallow, ".planning"), { recursive: true })
		fs.mkdirSync(path.join(deep, ".planning"), { recursive: true })

		// depth=1 should find shallow but not deep
		const results = ProjectManager.scan(scanRoot, 1)
		const normalized = results.map(r => path.resolve(path.normalize(r)))

		assert.ok(normalized.includes(path.resolve(shallow)), "found shallow project")
		assert.ok(!normalized.includes(path.resolve(deep)), "did not find deep project at depth > 1")
	})

	it("skips node_modules and .dot directories", () => {
		const scanRoot = path.join(testDir, "skip-root")
		const nmProj = path.join(scanRoot, "node_modules", "some-pkg")
		const dotProj = path.join(scanRoot, ".hidden", "proj")
		const realProj = path.join(scanRoot, "real")

		fs.mkdirSync(path.join(nmProj, ".git"), { recursive: true })
		fs.mkdirSync(path.join(dotProj, ".planning"), { recursive: true })
		fs.mkdirSync(path.join(realProj, ".planning"), { recursive: true })

		const results = ProjectManager.scan(scanRoot, 3)
		const normalized = results.map(r => path.resolve(path.normalize(r)))

		assert.ok(normalized.includes(path.resolve(realProj)), "found real project")
		assert.ok(!normalized.includes(path.resolve(nmProj)), "skipped node_modules")
		assert.ok(!normalized.includes(path.resolve(dotProj)), "skipped .hidden dir")
	})
})

// ─── 15. touch() ────────────────────────────────────────────

describe("touch()", () => {
	it("updates lastActiveAt", () => {
		const projectPath = path.join(testDir, "touchable")
		fs.mkdirSync(projectPath, { recursive: true })

		ProjectManager.add(projectPath)
		const before = ProjectManager.get(projectPath)!
		assert.equal(before.lastActiveAt, undefined)

		ProjectManager.touch(projectPath)
		const after = ProjectManager.get(projectPath)!
		assert.ok(after.lastActiveAt, "lastActiveAt is set after touch")
		assert.ok(!isNaN(Date.parse(after.lastActiveAt!)), "lastActiveAt is valid ISO timestamp")
	})

	it("is a no-op for unregistered path", () => {
		// Should not throw
		ProjectManager.touch(path.join(testDir, "unregistered"))
		assert.equal(ProjectManager.list().length, 0)
	})
})
