/**
 * Tests for timeline collapse state persistence (task_1).
 *
 * Verifies that public/dashboard.html contains the required
 * code patterns for collapse state tracking across re-renders.
 *
 * Run with: npx tsx --test test/timeline-collapse.test.ts
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

describe("Timeline collapse state tracking", () => {
	it("declares collapsedDates global variable", () => {
		assert.ok(
			/var\s+collapsedDates\s*=\s*\{\s*\}/.test(script),
			"should declare 'var collapsedDates = {}' in <script> block"
		)
	})

	it("saves collapse state before clearing innerHTML in renderTimeline", () => {
		// The state-saving logic must appear BEFORE el.innerHTML = ''
		const innerHTMLIdx = script.indexOf("el.innerHTML = ''")
		assert.ok(innerHTMLIdx > 0, "el.innerHTML = '' must exist")

		// viewKey must be defined before innerHTML clear
		const viewKeyPattern = /var\s+viewKey\s*=\s*selectedClient\s*\|\|\s*'_local'/
		const viewKeyMatch = script.match(viewKeyPattern)
		assert.ok(viewKeyMatch, "viewKey = selectedClient || '_local' must exist in renderTimeline")

		// collapsedDates save logic must appear before innerHTML clear
		const savePattern = /\.querySelectorAll\(['"]\.date-group\.collapsed['"]\)/
		const saveMatch = script.match(savePattern)
		assert.ok(saveMatch, "must query .date-group.collapsed elements to save state")

		// Verify save logic is before innerHTML clear in renderTimeline
		const renderFnStart = script.indexOf("function renderTimeline")
		const renderSection = script.slice(renderFnStart)
		const saveIdx = renderSection.search(savePattern)
		const clearIdx = renderSection.indexOf("el.innerHTML = ''")
		assert.ok(
			saveIdx < clearIdx,
			"collapse state saving must happen BEFORE el.innerHTML = ''"
		)
	})

	it("sets data-date attribute on date groups", () => {
		assert.ok(
			/group\.setAttribute\(['"]data-date['"],\s*ds\)/.test(script),
			"must set data-date attribute on group element"
		)
	})

	it("restores collapse state when creating date groups", () => {
		assert.ok(
			/collapsedDates\[viewKey\s*\+\s*'\|'\s*\+\s*ds\]/.test(script),
			"must check collapsedDates[viewKey + '|' + ds] to restore state"
		)
	})

	it("tracks collapse state in onclick handler", () => {
		// The onclick handler should reference collapsedDates and dateStr/ds
		const onclickPattern = /hd\.onclick\s*=\s*function/
		assert.ok(onclickPattern.test(script), "hd.onclick handler must exist")

		// Must track state in collapsedDates within the closure
		assert.ok(
			/collapsedDates\[vk\]\s*=\s*true/.test(script),
			"onclick handler must set collapsedDates[vk] = true when collapsing"
		)
		assert.ok(
			/delete\s+collapsedDates\[vk\]/.test(script),
			"onclick handler must delete collapsedDates[vk] when expanding"
		)
	})

	it("toggleAllDays updates collapsedDates", () => {
		// Find toggleAllDays function
		const toggleFnMatch = script.match(/function\s+toggleAllDays[\s\S]*?^}/m)
		assert.ok(toggleFnMatch, "toggleAllDays function must exist")
		const toggleFn = toggleFnMatch[0]

		assert.ok(
			/collapsedDates\[/.test(toggleFn),
			"toggleAllDays must update collapsedDates"
		)
		assert.ok(
			/viewKey/.test(toggleFn),
			"toggleAllDays must use viewKey"
		)
	})

	it("clearHistory blocks remote clients", () => {
		// Find clearHistory function
		const clearIdx = script.indexOf("function clearHistory")
		assert.ok(clearIdx >= 0, "clearHistory function must exist")

		const clearFn = script.slice(clearIdx, script.indexOf("}", clearIdx + 200) + 1)

		// selectedClient check must appear before fetch call
		assert.ok(
			/selectedClient/.test(clearFn),
			"clearHistory must check selectedClient"
		)
		assert.ok(
			/alert\(/.test(clearFn),
			"clearHistory must show alert for remote clients"
		)

		// The selectedClient check must appear before the fetch call
		const selectedIdx = clearFn.indexOf("selectedClient")
		const fetchIdx = clearFn.indexOf("fetch(")
		assert.ok(
			selectedIdx < fetchIdx,
			"selectedClient check must come before fetch call"
		)
	})
})
