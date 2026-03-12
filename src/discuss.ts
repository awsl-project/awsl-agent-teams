/**
 * AWSL Discussion Mode — multi-agent discussion orchestration.
 *
 * Runs agents in parallel to analyze a question from their role's perspective,
 * then optionally debates across rounds, and synthesizes a final answer.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { runAgent, runParallel, detectEngine, type RunResult, type Engine } from "./runner.js";
import type { TeamAgentDef } from "./agents.js";
import { SharedMemory } from "./memory.js";
import { log } from "./log.js";

// ─── Interfaces ──────────────────────────────────────────────

export interface DiscussionRound {
	agent: string;
	role: string;
	perspective: string;
}

export interface DiscussionResult {
	question: string;
	rounds: DiscussionRound[];
	answer: string;
	duration: number;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
	agents: string[];
}

export interface DiscussOptions {
	rounds?: number;
	engine?: Engine;
	agents?: string[];
}

// ─── Cost Estimation (Sonnet rates) ──────────────────────────

const INPUT_COST_PER_M = 3;
const OUTPUT_COST_PER_M = 15;

function estimateCost(inputTokens: number, outputTokens: number): number {
	return (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;
}

// ─── Helpers ─────────────────────────────────────────────────

function buildRoster(agents: TeamAgentDef[]): string {
	return agents
		.map(a => `- **${a.name}** (${a.role}): ${a.description}`)
		.join("\n");
}

function formatPerspectives(rounds: DiscussionRound[]): string {
	return rounds
		.map(r => `### ${r.agent} (${r.role})\n${r.perspective}`)
		.join("\n\n");
}

function accumulateTokens(
	result: RunResult,
	totals: { inputTokens: number; outputTokens: number; costUsd: number },
): void {
	totals.inputTokens += result.inputTokens ?? 0;
	totals.outputTokens += result.outputTokens ?? 0;
	totals.costUsd += result.costUsd ?? 0;
}

// ─── Main Function ───────────────────────────────────────────

export async function discussTeam(
	question: string,
	agents: TeamAgentDef[],
	cwd: string,
	model: string,
	options?: DiscussOptions,
): Promise<DiscussionResult> {
	// ── Validation ──
	if (question.length < 10) {
		throw new Error("Discussion question must be at least 10 characters long");
	}
	if (agents.length < 2) {
		throw new Error("Discussion requires at least 2 agents");
	}

	const startTime = Date.now();
	const numRounds = Math.min(options?.rounds ?? 1, 3);
	const engine = detectEngine(options?.engine);
	const memory = new SharedMemory();
	const teamRoster = buildRoster(agents);
	const agentNames = agents.map(a => a.name);
	const totals = { inputTokens: 0, outputTokens: 0, costUsd: 0 };
	const allRounds: DiscussionRound[] = [];

	log.section(`Discussion: ${question.slice(0, 60)}${question.length > 60 ? "..." : ""}`);

	// ── Round 1: Parallel Perspectives ──
	log.info("discuss", `Round 1: Gathering perspectives from ${agents.length} agents...`);

	const round1Results = await runParallel(agents, agents.length, async (agentDef) => {
		const prompt = `You are a ${agentDef.role}. Analyze this question deeply from your perspective:

Question: ${question}

Think step by step. Consider trade-offs, risks, and alternatives. Provide your analysis in a structured format with clear reasoning. Call "report" with your analysis when done.`;

		return runAgent(agentDef, prompt, cwd, memory, teamRoster, model, 15, undefined, engine);
	});

	for (const result of round1Results) {
		accumulateTokens(result, totals);
		const agentDef = agents.find(a => a.name === result.agent);
		allRounds.push({
			agent: result.agent,
			role: agentDef?.role ?? "unknown",
			perspective: result.result,
		});
	}

	// ── Debate Rounds (2..N) ──
	for (let round = 2; round <= numRounds; round++) {
		log.info("discuss", `Round ${round}: Debate — agents respond to each other...`);

		const priorPerspectives = formatPerspectives(allRounds);

		const roundResults = await runParallel(agents, agents.length, async (agentDef) => {
			const prompt = `You are a ${agentDef.role}. This is round ${round} of a team discussion.

## Original Question
${question}

## Prior Perspectives
${priorPerspectives}

Review what other team members have said. Respond to their points:
- Where do you agree or disagree?
- What did they miss?
- What new insights can you add from your role's perspective?

Provide your updated analysis. Call "report" with your response when done.`;

			return runAgent(agentDef, prompt, cwd, memory, teamRoster, model, 15, undefined, engine);
		});

		for (const result of roundResults) {
			accumulateTokens(result, totals);
			const agentDef = agents.find(a => a.name === result.agent);
			allRounds.push({
				agent: result.agent,
				role: agentDef?.role ?? "unknown",
				perspective: result.result,
			});
		}
	}

	// ── Synthesis ──
	log.info("discuss", "Synthesizing final answer...");

	const allPerspectives = formatPerspectives(allRounds);
	const synthesizer = agents[0];

	const synthesisResult = await runAgent(
		synthesizer,
		`You are synthesizing a multi-agent team discussion into a final coherent answer.

## Original Question
${question}

## All Perspectives (${numRounds} round${numRounds > 1 ? "s" : ""})
${allPerspectives}

## Your Task
Synthesize all perspectives into a comprehensive, coherent answer:
1. **Key Insights** — What are the most important findings across all perspectives?
2. **Consensus** — Where do all agents agree?
3. **Disagreements** — Where do they differ, and what is the best resolution?
4. **Recommendation** — What is the actionable recommendation?
5. **Open Questions** — What remains unresolved?

Provide a well-structured final answer. Call "report" with the synthesis when done.`,
		cwd,
		memory,
		teamRoster,
		model,
		15,
		undefined,
		engine,
	);

	accumulateTokens(synthesisResult, totals);

	const finalAnswer = synthesisResult.result;
	const duration = Date.now() - startTime;

	// ── Estimate cost if not reported by engine ──
	if (totals.costUsd === 0 && (totals.inputTokens > 0 || totals.outputTokens > 0)) {
		totals.costUsd = estimateCost(totals.inputTokens, totals.outputTokens);
	}

	// ── Persist transcript ──
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const planningDir = path.join(cwd, ".planning");
	if (!fs.existsSync(planningDir)) {
		fs.mkdirSync(planningDir, { recursive: true });
	}

	const transcript = `# Discussion: ${question}

**Date:** ${new Date().toISOString()}
**Agents:** ${agentNames.join(", ")}
**Rounds:** ${numRounds}
**Duration:** ${(duration / 1000).toFixed(1)}s
**Tokens:** ${totals.inputTokens} input, ${totals.outputTokens} output
**Cost:** $${totals.costUsd.toFixed(4)}

---

## Perspectives

${allPerspectives}

---

## Final Answer

${finalAnswer}
`;

	const transcriptPath = path.join(planningDir, `DISCUSSION-${timestamp}.md`);
	fs.writeFileSync(transcriptPath, transcript, "utf-8");
	log.info("discuss", `Transcript saved: ${transcriptPath}`);
	log.info("discuss", `Done in ${(duration / 1000).toFixed(1)}s (${totals.inputTokens} in / ${totals.outputTokens} out, $${totals.costUsd.toFixed(4)})`);

	return {
		question,
		rounds: allRounds,
		answer: finalAnswer,
		duration,
		inputTokens: totals.inputTokens,
		outputTokens: totals.outputTokens,
		costUsd: totals.costUsd,
		agents: agentNames,
	};
}
