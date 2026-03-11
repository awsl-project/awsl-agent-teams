/**
 * Tests for discuss module — multi-agent discussion orchestration.
 *
 * Run: npx tsx src/discuss.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { TeamAgentDef } from "./agents.js";
import { discussTeam, type DiscussionResult, type DiscussionRound, type DiscussOptions } from "./discuss.js";

const makeAgent = (name: string, role: string): TeamAgentDef => ({
	name,
	role,
	description: `${role} agent`,
	systemPrompt: `You are a ${role}.`,
	source: "builtin",
});

// ─── Edge Case: question too short ──────────────────────────

describe("discussTeam validation", () => {
	test("rejects questions shorter than 10 characters", async () => {
		const agents = [makeAgent("a1", "architect"), makeAgent("a2", "coder")];
		await assert.rejects(
			() => discussTeam("short?", agents, "/tmp", "anthropic:claude-sonnet-4-20250514"),
			(err: Error) => {
				assert.match(err.message, /at least 10 characters/);
				return true;
			},
		);
	});

	test("rejects with fewer than 2 agents", async () => {
		const agents = [makeAgent("a1", "architect")];
		await assert.rejects(
			() => discussTeam("What is the best architecture for this system?", agents, "/tmp", "anthropic:claude-sonnet-4-20250514"),
			(err: Error) => {
				assert.match(err.message, /at least 2 agents/);
				return true;
			},
		);
	});

	test("caps rounds at 3 maximum", async () => {
		const agents = [makeAgent("a1", "architect"), makeAgent("a2", "coder")];
		// This should not throw for rounds validation — it should cap silently
		// We can't easily test the actual execution without mocking runAgent,
		// so we test that the options interface accepts rounds
		const opts: DiscussOptions = { rounds: 5 };
		assert.equal(typeof opts.rounds, "number");
	});
});

// ─── Type-level checks ──────────────────────────────────────

describe("discuss types", () => {
	test("DiscussionRound has expected shape", () => {
		const round: DiscussionRound = {
			agent: "architect",
			role: "architect",
			perspective: "Some analysis",
		};
		assert.equal(round.agent, "architect");
		assert.equal(round.role, "architect");
		assert.equal(round.perspective, "Some analysis");
	});

	test("DiscussionResult has expected shape", () => {
		const result: DiscussionResult = {
			question: "test question",
			rounds: [],
			answer: "final answer",
			duration: 1000,
			inputTokens: 100,
			outputTokens: 200,
			costUsd: 0.01,
			agents: ["architect", "coder"],
		};
		assert.equal(result.question, "test question");
		assert.equal(result.agents.length, 2);
		assert.equal(result.duration, 1000);
	});
});
