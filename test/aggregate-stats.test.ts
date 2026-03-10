/**
 * Tests for aggregated stats across all machines (task_1).
 *
 * When no client is selected and remote clients exist,
 * the render() function should aggregate history entries
 * and queue tasks from ALL sources (local + all remote clients).
 *
 * Run with: npx tsx --test test/aggregate-stats.test.ts
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as path from "node:path"

const HTML_PATH = path.join(process.cwd(), "public", "dashboard.html")
const html = fs.readFileSync(HTML_PATH, "utf-8")

// Extract the <script> block content
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/)
const script = scriptMatch ? scriptMatch[1] : ""

// Extract just the render() function body
const renderStart = script.indexOf("function render()")
const renderBody = script.slice(renderStart, renderStart + 1200)

describe("Aggregate stats from all machines", () => {
	it("render() checks clients.length when no client is selected", () => {
		// After the selectedClient block, there must be an else-if checking clients.length
		assert.ok(
			/clients\.length\s*>\s*0/.test(renderBody),
			"render() must check clients.length > 0 for aggregation"
		)
	})

	it("aggregates history entries from all remote clients", () => {
		// Must iterate over clients and concat their history
		assert.ok(
			/\.concat\(/.test(renderBody) || /allEntries/.test(renderBody),
			"render() must concatenate entries from multiple sources"
		)
		// Must access client status history
		assert.ok(
			/cs\.history|status\.history/.test(renderBody),
			"render() must access each client's status.history"
		)
	})

	it("aggregates queue tasks from all remote clients", () => {
		// Must concat queue tasks from remote clients
		assert.ok(
			/allQt/.test(renderBody) || /\.concat\(.*queue/.test(renderBody),
			"render() must aggregate queue tasks into allQt"
		)
		// Must access client status queue
		assert.ok(
			/cs\.queue|status\.queue/.test(renderBody),
			"render() must access each client's status.queue"
		)
	})

	it("assigns aggregated entries back for stats()", () => {
		// The aggregated allEntries must be assigned to entries
		assert.ok(
			/entries\s*=\s*allEntries/.test(renderBody),
			"render() must assign allEntries to entries"
		)
		assert.ok(
			/qt\s*=\s*allQt/.test(renderBody),
			"render() must assign allQt to qt"
		)
	})

	it("preserves existing selectedClient logic", () => {
		// The existing selectedClient block should still be there
		assert.ok(
			/if\s*\(\s*selectedClient\s*\)/.test(renderBody),
			"render() must still check selectedClient"
		)
		assert.ok(
			/clients\.find/.test(renderBody),
			"render() must still use clients.find for selected client"
		)
	})

	it("includes local hist.entries in aggregation", () => {
		// Must start with local entries: hist.entries
		assert.ok(
			/hist\.entries\s*\|\|\s*\[\]/.test(renderBody),
			"aggregation must start from local hist.entries || []"
		)
	})
})
