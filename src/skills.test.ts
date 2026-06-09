/**
 * Tests for SkillRegistry and the browser-verify Guardian skill.
 *
 * Run: npx tsx src/skills.test.ts
 */

import { SkillRegistry, SKILL_BROWSER_VERIFY, SKILL_FRONTEND, SKILL_BACKEND, SKILL_CLEAN_GIT } from "./skills.js";

// ─── Test helpers ────────────────────────────────────────────

function assert(condition: boolean, msg: string) {
	if (!condition) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
	if (actual !== expected) throw new Error(`${msg}: expected ${String(expected)}, got ${String(actual)}`);
}

// ─── Tests ───────────────────────────────────────────────────

function testBrowserVerifyShape() {
	assertEqual(SKILL_BROWSER_VERIFY.name, "browser-verify", "skill name");
	assert(SKILL_BROWSER_VERIFY.activatesFor.includes("tester"), "activates for tester");
	assert(SKILL_BROWSER_VERIFY.activatesFor.includes("reviewer"), "activates for reviewer");
	assert(SKILL_BROWSER_VERIFY.instructions.includes("browser-bridge-cli"), "instructions mention browser-bridge-cli");
	console.log("✓ testBrowserVerifyShape");
}

function testRegistryIncludesBrowserVerify() {
	const reg = new SkillRegistry();
	assert(reg.get("browser-verify") !== undefined, "registry has browser-verify");
	assert(reg.all().some(s => s.name === "browser-verify"), "all() lists browser-verify");
	console.log("✓ testRegistryIncludesBrowserVerify");
}

function testActivatesForTesterAndReviewer() {
	const reg = new SkillRegistry();
	assert(reg.forRole("tester").some(s => s.name === "browser-verify"), "tester gets browser-verify");
	assert(reg.forRole("reviewer").some(s => s.name === "browser-verify"), "reviewer gets browser-verify");
	console.log("✓ testActivatesForTesterAndReviewer");
}

function testDoesNotActivateForCoder() {
	const reg = new SkillRegistry();
	assert(!reg.forRole("coder").some(s => s.name === "browser-verify"), "coder does NOT get browser-verify");
	console.log("✓ testDoesNotActivateForCoder");
}

function testBuildInstructionsInjectsForTester() {
	const reg = new SkillRegistry();
	const instr = reg.buildInstructions("tester");
	assert(instr.includes("Browser Verification"), "tester instructions include Browser Verification section");
	assert(instr.includes("preview_url"), "tester instructions mention the preview_url memory key");
	console.log("✓ testBuildInstructionsInjectsForTester");
}

function testExplicitSkillStillWorks() {
	const reg = new SkillRegistry();
	// A role with no auto-activation (architect) can still opt in explicitly.
	const instr = reg.buildInstructions("architect", ["browser-verify"]);
	assert(instr.includes("Browser Verification"), "explicit skill opt-in injects browser-verify");
	console.log("✓ testExplicitSkillStillWorks");
}

function testFrontendBackendActivateForCoder() {
	const reg = new SkillRegistry();
	assertEqual(SKILL_FRONTEND.name, "frontend", "frontend skill name");
	assertEqual(SKILL_BACKEND.name, "backend", "backend skill name");
	assert(reg.forRole("coder").some(s => s.name === "frontend"), "coder gets frontend");
	assert(reg.forRole("coder").some(s => s.name === "backend"), "coder gets backend");
	// Frontend pairs with browser-verify; backend pairs with tdd
	assert(SKILL_FRONTEND.instructions.includes("browser-verify"), "frontend references browser-verify");
	assert(SKILL_BACKEND.instructions.includes("tdd"), "backend references tdd");
	console.log("✓ testFrontendBackendActivateForCoder");
}

function testCleanGitSkill() {
	const reg = new SkillRegistry();
	assertEqual(SKILL_CLEAN_GIT.name, "commit", "clean-git skill name");
	assert(reg.get("commit") !== undefined, "registry has commit skill");
	assert(reg.forRole("coder").some(s => s.name === "commit"), "coder gets commit");
	assert(reg.forRole("reviewer").some(s => s.name === "commit"), "reviewer gets commit");
	// The whole point: it forbids AI attribution in commit messages.
	const i = SKILL_CLEAN_GIT.instructions;
	assert(/Co-Authored-By: Claude/i.test(i), "commit skill names the Co-Authored-By trailer to forbid");
	assert(/Generated with Claude Code/i.test(i), "commit skill names the Generated-with line to forbid");
	assert(/--force/i.test(i), "commit skill forbids force push");
	console.log("✓ testCleanGitSkill");
}

function testNewSkillsInBuildInstructionsForCoder() {
	const reg = new SkillRegistry();
	const instr = reg.buildInstructions("coder");
	assert(instr.includes("Frontend Implementation"), "coder instructions include Frontend Implementation");
	assert(instr.includes("Backend Implementation"), "coder instructions include Backend Implementation");
	assert(instr.includes("Clean Git Hygiene"), "coder instructions include Clean Git Hygiene");
	console.log("✓ testNewSkillsInBuildInstructionsForCoder");
}

// ─── Runner ──────────────────────────────────────────────────

const tests = [
	testBrowserVerifyShape,
	testRegistryIncludesBrowserVerify,
	testActivatesForTesterAndReviewer,
	testDoesNotActivateForCoder,
	testBuildInstructionsInjectsForTester,
	testExplicitSkillStillWorks,
	testFrontendBackendActivateForCoder,
	testCleanGitSkill,
	testNewSkillsInBuildInstructionsForCoder,
];

let passed = 0;
let failed = 0;

for (const test of tests) {
	try {
		test();
		passed++;
	} catch (err: any) {
		console.error(`✗ ${test.name}: ${err.message}`);
		failed++;
	}
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
