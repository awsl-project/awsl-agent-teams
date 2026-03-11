/**
 * Tests for queue plan engine routing.
 *
 * Verifies that TaskQueue.plan() uses the Codex path when
 * defaults.engine === "codex", instead of the Claude path.
 *
 * Run with: npx tsx --test test/queue-plan-codex.test.ts
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { TaskQueue } from "../src/queue.js"

describe("TaskQueue.plan engine routing", () => {
	it("uses callCodex when engine is codex", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-queue-plan-test-"))

		try {
			const queue = new TaskQueue(tmpDir) as any

			let codexCalled = 0
			let claudeCalled = 0

			queue.callCodex = async () => {
				codexCalled++
				return '[{"goal":"Task A","dependsOn":[],"quick":false}]'
			}

			queue.callClaude = async () => {
				claudeCalled++
				return '[{"goal":"Task B","dependsOn":[],"quick":false}]'
			}

			const tasks = await queue.plan("first do A", { engine: "codex" })

			assert.equal(codexCalled, 1, "callCodex should be called exactly once")
			assert.equal(claudeCalled, 0, "callClaude should not be called when engine=codex")
			assert.equal(tasks.length, 1, "should create one queue task from codex plan")
			assert.equal(tasks[0].goal, "Task A", "should use codex result content")
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})

	it("uses callClaude when engine is claude-code", async () => {
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-queue-plan-test-"))

		try {
			const queue = new TaskQueue(tmpDir) as any

			let codexCalled = 0
			let claudeCalled = 0

			queue.callCodex = async () => {
				codexCalled++
				return '[{"goal":"Task A","dependsOn":[],"quick":false}]'
			}

			queue.callClaude = async () => {
				claudeCalled++
				return '[{"goal":"Task B","dependsOn":[],"quick":false}]'
			}

			const tasks = await queue.plan("do B", { engine: "claude-code" })

			assert.equal(claudeCalled, 1, "callClaude should be called exactly once")
			assert.equal(codexCalled, 0, "callCodex should not be called when engine=claude-code")
			assert.equal(tasks.length, 1, "should create one queue task from claude plan")
			assert.equal(tasks[0].goal, "Task B", "should use claude result content")
		} finally {
			fs.rmSync(tmpDir, { recursive: true, force: true })
		}
	})
})
