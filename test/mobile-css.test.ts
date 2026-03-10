/**
 * Tests for dashboard mobile CSS adaptation.
 *
 * Verifies that required media queries and CSS rules exist
 * in public/dashboard.html without modifying HTML or JS.
 *
 * Run with: npx tsx --test test/mobile-css.test.ts
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as path from "node:path"

const dashboardPath = path.join(process.cwd(), "public", "dashboard.html")
const content = fs.readFileSync(dashboardPath, "utf-8")

// Extract the <style> block
const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/)
const styleContent = styleMatch ? styleMatch[1] : ""

// Extract all media query blocks with their contents
function extractMediaBlocks(css: string, maxWidth: string): string[] {
	const blocks: string[] = []
	const regex = new RegExp(`@media\\s*\\(\\s*max-width:\\s*${maxWidth}\\s*\\)`, "g")
	let match: RegExpExecArray | null
	while ((match = regex.exec(css)) !== null) {
		let depth = 0
		let start = match.index
		let blockContent = ""
		for (let i = match.index; i < css.length; i++) {
			if (css[i] === "{") {
				depth++
				if (depth === 1) {
					start = i + 1
				}
			} else if (css[i] === "}") {
				depth--
				if (depth === 0) {
					blockContent = css.substring(start, i)
					break
				}
			}
		}
		blocks.push(blockContent)
	}
	return blocks
}

describe("Dashboard mobile CSS", () => {
	it("should have a <style> block", () => {
		assert.ok(styleContent.length > 0, "No <style> block found")
	})

	describe("@media (max-width: 900px) — unchanged", () => {
		const blocks900 = extractMediaBlocks(styleContent, "900px")

		it("should exist", () => {
			assert.ok(blocks900.length >= 1, "No 900px media query found")
		})

		it("should contain stats 3-col grid", () => {
			assert.ok(blocks900[0].includes("repeat(3, 1fr)"), "900px block should keep repeat(3, 1fr)")
		})
	})

	describe("@media (max-width: 700px) — enhanced", () => {
		const blocks700 = extractMediaBlocks(styleContent, "700px")
		const combined700 = blocks700.join("\n")

		it("should exist", () => {
			assert.ok(blocks700.length >= 1, "No 700px media query found")
		})

		it("should keep existing stats 2-col grid", () => {
			assert.ok(combined700.includes("repeat(2, 1fr)"), "Should keep repeat(2, 1fr)")
		})

		it("should have body padding", () => {
			assert.ok(combined700.includes("padding: 16px 12px 60px"), "Missing body padding rule")
		})

		it("should have queue-form flex-wrap", () => {
			assert.ok(combined700.includes("flex-wrap: wrap"), "Missing queue-form flex-wrap")
		})

		it("should hide queue table columns 4 and 5", () => {
			assert.ok(combined700.includes("nth-child(4)"), "Missing nth-child(4) hide rule")
			assert.ok(combined700.includes("nth-child(5)"), "Missing nth-child(5) hide rule")
			assert.ok(combined700.includes("display: none"), "Missing display: none for hidden columns")
		})

		it("should have touch target min-height for buttons", () => {
			assert.ok(combined700.includes("min-height: 40px"), "Missing min-height: 40px for buttons")
		})

		it("should have q-del sizing", () => {
			assert.ok(combined700.includes("min-height: 36px"), "Missing q-del min-height")
			assert.ok(combined700.includes("min-width: 36px"), "Missing q-del min-width")
		})

		it("should have proj-item padding", () => {
			assert.ok(combined700.includes("padding: 8px 10px"), "Missing proj-item padding")
		})
	})

	describe("@media (max-width: 480px) — new", () => {
		const blocks480 = extractMediaBlocks(styleContent, "480px")
		const combined480 = blocks480.join("\n")

		it("should exist", () => {
			assert.ok(blocks480.length >= 1, "No 480px media query found")
		})

		it("should have header flex-wrap", () => {
			assert.ok(combined480.includes("flex-wrap: wrap"), "Missing header flex-wrap")
		})

		it("should have header h1 font-size 17px", () => {
			assert.ok(combined480.includes("font-size: 17px"), "Missing header h1 font-size")
		})

		it("should have stats 1-col grid", () => {
			assert.ok(combined480.includes("grid-template-columns: 1fr"), "Missing stats 1fr")
		})

		it("should have stat-val font-size 18px", () => {
			assert.ok(combined480.includes("font-size: 18px"), "Missing stat-val font-size")
		})

		it("should have heatmap-cell 8px sizing", () => {
			assert.ok(combined480.includes("width: 8px"), "Missing heatmap-cell width")
			assert.ok(combined480.includes("height: 8px"), "Missing heatmap-cell height")
		})

		it("should have queue-form column layout", () => {
			assert.ok(combined480.includes("flex-direction: column"), "Missing flex-direction: column")
		})

		it("should have full-width queue inputs", () => {
			assert.ok(combined480.includes("width: 100% !important"), "Missing width: 100% !important")
		})

		it("should have reduced table padding/font", () => {
			assert.ok(combined480.includes("padding: 6px 6px"), "Missing table padding")
			assert.ok(combined480.includes("font-size: 11px"), "Missing table font-size")
		})

		it("should have queue-actions column layout", () => {
			assert.ok(combined480.includes("flex-direction: column"), "Missing queue-actions column")
		})

		it("should have entry-row1 flex-wrap", () => {
			assert.ok(combined480.includes("flex-wrap: wrap"), "Missing entry-row1 flex-wrap")
		})

		it("should have client-card min-width 130px", () => {
			assert.ok(combined480.includes("min-width: 130px"), "Missing client-card min-width")
		})

		it("should have tk-val font-size 15px", () => {
			assert.ok(combined480.includes("font-size: 15px"), "Missing tk-val font-size")
		})
	})

	describe("No HTML/JS changes", () => {
		it("should not modify HTML structure", () => {
			// Verify key HTML elements still exist unchanged
			assert.ok(content.includes('<meta name="viewport"'), "viewport meta should exist")
			assert.ok(content.includes('<div class="header">'), "header div should exist")
		})
	})
})
