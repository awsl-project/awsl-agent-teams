/**
 * Conductor — AWSL's orchestration engine.
 *
 * Conductor manages the macro-level: what to do, when, and in what order.
 * Guardian skills (injected per-agent) handle the micro-level: how to do it well.
 *
 * Phases:
 *   0a. Brainstorm — Socratic exploration (Guardian: brainstorm skill)
 *   0b. Research   — parallel codebase analysis
 *   1.  Plan       — structured task DAG with verify criteria
 *   2.  Execute    — topological waves, fresh context, atomic commits
 *   3.  Verify     — two-stage review + quality gate (Guardian: review skill)
 *   4.  Re-plan    — dynamic recovery on failures
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { TeamAgentDef } from "./agents.js";
import type { SandboxPolicy } from "./sandbox.js";
import { SharedMemory } from "./memory.js";
import { log } from "./log.js";
import { type RunResult, type Engine, runAgent, runParallel, detectEngine } from "./runner.js";
import { createPlanningDir, parseStructuredTasks, atomicCommit, saveCheckpoint, loadCheckpoint, clearCheckpoint, type StructuredTask, type PlanningDir, type CheckpointData } from "./planning.js";
import { SkillRegistry } from "./skills.js";
import { runFullVerification } from "./verify.js";

// ─── Event / Hook System ─────────────────────────────────────

export type TeamEventType =
	| "research_start"
	| "research_done"
	| "plan_ready"
	| "wave_start"
	| "wave_end"
	| "task_start"
	| "task_done"
	| "task_failed"
	| "verify_start"
	| "verify_done"
	| "fix_start"
	| "fix_done"
	| "retry_start"
	| "checkpoint"
	| "rate_limit"
	| "all_done";

export interface TeamEvent {
	type: TeamEventType;
	task?: Task;
	wave?: number;
	tasks?: Task[];
	memory?: SharedMemory;
}

export type TeamHook = (event: TeamEvent) => void | Promise<void>;

export interface Task {
	id: string;
	description: string;
	assignee: string;
	dependencies: string[];
	status: "pending" | "running" | "done" | "failed" | "verified";
	/** Files this task touches */
	files?: string[];
	/** Verification criteria */
	verify?: string;
	/** Definition of done */
	doneCriteria?: string;
	result?: string;
	error?: string;
}

export interface TeamResult {
	success: boolean;
	tasks: Task[];
	summary: string;
	memory: SharedMemory;
	planning: PlanningDir;
	inputTokens: number;
	outputTokens: number;
	costUsd: number;
}

export interface ExecuteOptions {
	hooks?: TeamHook[];
	/** Enable re-planning after failures. Default false. */
	replan?: boolean;
	/** Auto git commit per task. Default false. */
	autoCommit?: boolean;
	/** Enable verification phase. Default true. */
	verify?: boolean;
	/** Enable research phase. Default false (auto-detected). */
	research?: boolean;
	/** Enable brainstorm phase before planning. Default false. */
	brainstorm?: boolean;
	/** Quality gate: critical review findings block task. Default true. */
	qualityGate?: boolean;
	/** Custom skill registry. Default uses built-in skills. */
	skills?: SkillRegistry;
	/** Execution engine: "claude-code" or "builtin". Auto-detected if omitted. */
	engine?: Engine;
	/** Max auto-fix attempts. Default 3. */
	maxFixAttempts?: number;
	/** Max retries per task before re-planning. Default 2. */
	maxRetries?: number;
	/** Max rate-limit retries before giving up. Default 20. */
	maxRateLimitRetries?: number;
	/** Custom backoff schedule in ms. Default [60000, 120000, 300000, 600000, 900000]. */
	rateLimitBackoff?: number[];
	/** Resume from checkpoint if available. Default true. */
	resumeFromCheckpoint?: boolean;
	/** Sandbox policy for builtin engine. true=role defaults (default), false=disabled, or custom SandboxPolicy. */
	sandbox?: boolean | SandboxPolicy;
}

// ─── Helpers ─────────────────────────────────────────────────

function buildRoster(agents: TeamAgentDef[]): string {
	return agents
		.filter(a => a.name !== "planner")
		.map(a => `- **${a.name}** (${a.role}): ${a.description}`)
		.join("\n");
}

function topologicalSort(tasks: Task[]): Task[][] {
	const waves: Task[][] = [];
	const done = new Set<string>();
	// Seed already-completed tasks into the done set for dependency resolution
	for (const t of tasks) {
		if (t.status === "done" || t.status === "verified") done.add(t.id);
	}
	let remaining = tasks.filter(t => t.status !== "failed" && t.status !== "done" && t.status !== "verified");

	while (remaining.length > 0) {
		const wave = remaining.filter(t => t.dependencies.every(d => done.has(d)));
		if (wave.length === 0) {
			for (const t of remaining) {
				t.status = "failed";
				t.error = "Unresolvable dependency";
			}
			break;
		}
		waves.push(wave);
		for (const t of wave) done.add(t.id);
		remaining = remaining.filter(t => !done.has(t.id));
	}
	return waves;
}

async function emit(hooks: TeamHook[], event: TeamEvent) {
	for (const hook of hooks) {
		try { await hook(event); } catch (e) { log.warn("hook", String(e)); }
	}
}

// ─── Review Finding Parser ───────────────────────────────────

interface ReviewFinding {
	taskId: string;
	severity: "critical" | "warning" | "pass";
	message: string;
}

function parseReviewFindings(raw: string): ReviewFinding[] {
	const findings: ReviewFinding[] = [];

	// Try JSON format first: { findings: [{ taskId, severity, message }] }
	try {
		const jsonMatch = raw.match(/\{[\s\S]*"findings"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
		if (jsonMatch) {
			const parsed = JSON.parse(jsonMatch[0]);
			if (Array.isArray(parsed.findings)) {
				for (const f of parsed.findings) {
					if (f.taskId && f.severity && f.message) {
						const sev = String(f.severity).toLowerCase();
						findings.push({
							taskId: String(f.taskId),
							severity: sev === "critical" ? "critical" : sev === "warning" || sev === "warn" ? "warning" : "pass",
							message: String(f.message),
						});
					}
				}
				if (findings.length > 0) return findings;
			}
		}
	} catch { /* fall through to text parsing */ }

	// Text format: [CRITICAL] task_1: message / [PASS] task_1: message / [WARN] task_1: message
	const linePattern = /\[(\w+)\]\s*([\w_.-]+)\s*:\s*(.+)/gi;
	let match: RegExpExecArray | null;
	while ((match = linePattern.exec(raw)) !== null) {
		const sevRaw = match[1].toLowerCase();
		const severity: ReviewFinding["severity"] =
			sevRaw === "critical" || sevRaw === "fail" ? "critical"
			: sevRaw === "warn" || sevRaw === "warning" ? "warning"
			: "pass";
		findings.push({
			taskId: match[2],
			severity,
			message: match[3].trim(),
		});
	}

	return findings;
}

// ─── Rate Limit Backoff ──────────────────────────────────────

// 1min → 2min → 5min → 15min → 30min → 60min (cap)
const DEFAULT_RATE_LIMIT_BACKOFF = [60_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];

function getRateLimitDelay(attempt: number, schedule: number[]): number {
	return schedule[Math.min(attempt, schedule.length - 1)];
}

// ─── Main Orchestrator ───────────────────────────────────────

export async function executeTeam(
	goal: string,
	agents: TeamAgentDef[],
	cwd: string,
	defaultModel: string,
	maxConcurrency: number,
	options?: ExecuteOptions,
): Promise<TeamResult> {
	const hooks = options?.hooks ?? [];
	const replanEnabled = options?.replan ?? false;
	const autoCommit = options?.autoCommit ?? false;
	const verifyEnabled = options?.verify ?? true;
	const brainstormEnabled = options?.brainstorm ?? false;
	const qualityGate = options?.qualityGate ?? true;
	const skills = options?.skills ?? new SkillRegistry();
	const engine = detectEngine(options?.engine);
	const maxFixAttempts = options?.maxFixAttempts ?? 3;
	const maxRetries = options?.maxRetries ?? 2;
	const maxRateLimitRetries = options?.maxRateLimitRetries ?? 20;
	const rateLimitBackoff = options?.rateLimitBackoff ?? DEFAULT_RATE_LIMIT_BACKOFF;
	const sandbox = options?.sandbox ?? true;
	let rateLimitRetryCount = 0;
	const memory = new SharedMemory();
	const roster = buildRoster(agents);
	const planning = createPlanningDir(cwd);
	planning.init();

	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalCostUsd = 0;

	const planner = agents.find(a => a.name === "planner");
	if (!planner) throw new Error("No planner agent found");
	const available = agents.filter(a => a.name !== "planner").map(a => a.name);

	// ── Checkpoint save helper ────────────────────────────────
	function doSaveCheckpoint(wi: number, tasks: Task[]): void {
		const completedTasks = tasks.filter(t => t.status === "done" || t.status === "verified").map(t => t.id);
		const taskResults: Record<string, string> = {};
		const taskErrors: Record<string, string> = {};
		for (const t of tasks) {
			if (t.status === "done" || t.status === "verified") taskResults[t.id] = t.result ?? "";
			if (t.status === "failed" && t.error) taskErrors[t.id] = t.error;
		}
		const failedTasks = tasks.filter(t => t.status === "failed").map(t => t.id);
		saveCheckpoint(cwd, {
			wave: wi,
			completedTasks,
			taskResults,
			failedTasks,
			taskErrors,
			rateLimitRetries: rateLimitRetryCount,
			savedAt: new Date().toISOString(),
			memory: memory.serialize(),
			goal,
		});
	}

	// ── Early checkpoint probe — skip phases 0/1 if resumable ─
	let resumedTasks: Task[] | null = null;

	if (options?.resumeFromCheckpoint !== false) {
		const checkpoint = loadCheckpoint(cwd);
		if (checkpoint) {
			// Restore shared memory first (research, design, plan, prior results)
			if (checkpoint.memory) {
				memory.restore(checkpoint.memory);
				log.info("checkpoint", `Restored ${Object.keys(checkpoint.memory).length} memory entries`);
			}

			// Goal sanity check — if goal changed, don't reuse old checkpoint
			const goalMatch = !checkpoint.goal || checkpoint.goal === goal;
			if (!goalMatch) {
				log.warn("checkpoint", "Goal changed since last checkpoint — starting fresh");
				clearCheckpoint(cwd);
			} else {
				// Try to rebuild tasks from stored plan in memory
				const storedPlan = memory.get("plan");
				if (storedPlan) {
					const structuredTasks = parseStructuredTasks(storedPlan);
					if (structuredTasks.length > 0) {
						resumedTasks = structuredTasks.map(st => ({
							id: st.id,
							description: st.action || st.name,
							assignee: st.assignee,
							dependencies: st.dependencies,
							files: st.files,
							verify: st.verify,
							doneCriteria: st.done,
							status: "pending" as Task["status"],
						}));

						// Restore task statuses
						for (const taskId of checkpoint.completedTasks) {
							const task = resumedTasks.find(t => t.id === taskId);
							if (task) {
								task.status = "done";
								task.result = checkpoint.taskResults[taskId] ?? "(restored from checkpoint)";
							}
						}
						for (const taskId of checkpoint.failedTasks) {
							const task = resumedTasks.find(t => t.id === taskId);
							if (task) {
								task.status = "failed";
								task.error = checkpoint.taskErrors?.[taskId] ?? "Failed in previous run";
							}
						}
						rateLimitRetryCount = checkpoint.rateLimitRetries;

						log.info("conductor", `Full resume: ${checkpoint.completedTasks.length} done, ${checkpoint.failedTasks.length} failed, skipping phases 0-1`);
					}
				}
			}
		}
	}

	let tasks: Task[];

	if (resumedTasks) {
		// ── Fast path: skip brainstorm + research + plan ─────────
		tasks = resumedTasks;

		// Validate assignees
		const agentNames = new Set(agents.map(a => a.name));
		for (const task of tasks) {
			if (task.status === "pending" && !agentNames.has(task.assignee)) {
				log.warn("conductor", `Task ${task.id}: unknown agent "${task.assignee}"`);
				task.status = "failed";
				task.error = `Unknown agent: ${task.assignee}`;
			}
		}

		const pending = tasks.filter(t => t.status === "pending").length;
		log.info("conductor", `Resumed plan: ${tasks.length} tasks (${pending} pending)`);
		await emit(hooks, { type: "plan_ready", tasks, memory });
	} else {
		// ── Full path: brainstorm → research → plan ──────────────

		// Phase 0a: Brainstorm
		if (brainstormEnabled) {
			log.section("Phase 0a: Brainstorming");
			const brainstormer = agents.find(a => a.role === "architect") ?? planner;

			const brainstormResult = await runAgent(
				brainstormer,
				`## Goal\n${goal}\n\n## Team\n${roster}\n\nConduct a Socratic brainstorming session about this goal. Explore requirements, alternatives, trade-offs, and constraints. Produce a design document with key decisions and rationale. Store it in shared memory as "design". Call report when done.`,
				cwd, memory, roster, defaultModel, 20, skills, engine, undefined, sandbox,
			);

			totalInputTokens += brainstormResult.inputTokens ?? 0;
			totalOutputTokens += brainstormResult.outputTokens ?? 0;
			totalCostUsd += brainstormResult.costUsd ?? 0;

			if (brainstormResult.status === "done" || brainstormResult.status === "no_report") {
				planning.write("DESIGN.md", brainstormResult.result);
				memory.set("design", brainstormResult.result, brainstormer.name);
				log.info("conductor", "Design document saved to .planning/DESIGN.md");
			}
		}

		// Phase 0b: Research
		const needsResearch = options?.research ?? goal.length > 200;
		if (needsResearch) {
			log.section("Phase 0: Research");
			await emit(hooks, { type: "research_start", memory });

			const researchTopics = [
				{ name: "architecture", prompt: `Analyze the codebase architecture in ${cwd}. Document: file structure, module boundaries, key patterns, frameworks used. Be concise and specific.` },
				{ name: "conventions", prompt: `Analyze coding conventions in ${cwd}. Document: naming, style, error handling, testing patterns. Be concise.` },
			];

			const researcher = agents.find(a => a.role === "architect") ?? agents.find(a => a.name !== "planner");
			if (researcher) {
				await runParallel(researchTopics, maxConcurrency, async (topic) => {
					const result = await runAgent(researcher, topic.prompt, cwd, memory, roster, defaultModel, 15, skills, engine, undefined, sandbox);
					totalInputTokens += result.inputTokens ?? 0;
					totalOutputTokens += result.outputTokens ?? 0;
					totalCostUsd += result.costUsd ?? 0;
					if (result.status === "done" || result.status === "no_report") {
						planning.write(`research/${topic.name}.md`, result.result);
						memory.set(`research:${topic.name}`, result.result, researcher.name);
					}
					return result;
				});
			}

			await emit(hooks, { type: "research_done", memory });
			log.info("conductor", `Research stored in .planning/research/`);
		}

		// Phase 1: Plan
		log.section("Phase 1: Planning");

		const researchContext = memory.keys()
			.filter(k => k.startsWith("research:"))
			.map(k => `### ${k}\n${memory.get(k)}`)
			.join("\n\n");

		const existingState = planning.stateSummary();

		const planPrompt = `## Team Members
${roster}

## Goal
${goal}

${researchContext ? `## Research Findings\n${researchContext}\n` : ""}
${existingState !== "(no state file)" ? `## Project State\n${existingState}\n` : ""}
## Instructions

Create a structured task plan. Output MUST be a JSON code block and nothing else.

Rules:
- Keep each task focused — ONE deliverable, max 2-3 files
- No dependencies = can run in parallel
- Do NOT assign to "planner"

IMPORTANT: You MUST call the report tool with ONLY a JSON code block in this EXACT format:

\`\`\`json
{
  "summary": "Brief plan description",
  "tasks": [
    {
      "id": "task_1",
      "name": "Short task name",
      "assignee": "one of [${available.join(", ")}]",
      "dependencies": [],
      "files": ["src/example.ts"],
      "action": "Detailed implementation instructions",
      "verify": "npm test or other runnable command",
      "done": "Definition of done"
    }
  ]
}
\`\`\`

Do NOT output any text before or after the JSON. Do NOT use markdown prose format.`;

		const planResult = await runAgent(planner, planPrompt, cwd, memory, roster, defaultModel, 30, skills, engine, undefined, sandbox);
		totalInputTokens += planResult.inputTokens ?? 0;
		totalOutputTokens += planResult.outputTokens ?? 0;
		totalCostUsd += planResult.costUsd ?? 0;

		if (planResult.status === "failed") {
			return { success: false, tasks: [], summary: `Planning failed: ${planResult.error}`, memory, planning, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd };
		}

		let structuredTasks = parseStructuredTasks(planResult.result);
		if (structuredTasks.length === 0) {
			const planMdPath = path.join(cwd, ".planning", "PLAN.md");
			if (fs.existsSync(planMdPath)) {
				const planMdContent = fs.readFileSync(planMdPath, "utf-8");
				structuredTasks = parseStructuredTasks(planMdContent);
				if (structuredTasks.length > 0) {
					log.info("conductor", `Parsed ${structuredTasks.length} tasks from .planning/PLAN.md`);
				}
			}
		}
		if (structuredTasks.length === 0) {
			return { success: false, tasks: [], summary: `Planner produced no parseable tasks:\n${planResult.result.slice(0, 300)}`, memory, planning, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd };
		}

		tasks = structuredTasks.map(st => ({
			id: st.id,
			description: st.action || st.name,
			assignee: st.assignee,
			dependencies: st.dependencies,
			files: st.files,
			verify: st.verify,
			doneCriteria: st.done,
			status: "pending" as const,
		}));

		const agentNames = new Set(agents.map(a => a.name));
		for (const task of tasks) {
			if (!agentNames.has(task.assignee)) {
				log.warn("conductor", `Task ${task.id}: unknown agent "${task.assignee}"`);
				task.status = "failed";
				task.error = `Unknown agent: ${task.assignee}`;
			}
		}

		log.info("conductor", `Plan: ${tasks.length} tasks`);
		for (const t of tasks) {
			const deps = t.dependencies.length > 0 ? ` (after: ${t.dependencies.join(", ")})` : "";
			const files = t.files?.length ? ` [${t.files.join(", ")}]` : "";
			log.info("conductor", `  [${t.id}] ${t.assignee}: ${t.description.slice(0, 60)}${deps}${files}`);
		}

		planning.write("PLAN.md", formatPlanMarkdown(structuredTasks));
		memory.set("plan", JSON.stringify(structuredTasks, null, 2), "planner");
		await emit(hooks, { type: "plan_ready", tasks, memory });
	}

	// ── Phase 2: Execute ──────────────────────────────────────
	let waves = topologicalSort(tasks);

	log.section(`Phase 2: Execution (${waves.length} waves)`);

	for (let wi = 0; wi < waves.length; wi++) {
		const wave = waves[wi];
		log.section(`Wave ${wi + 1}/${waves.length}: ${wave.map(t => t.assignee).join(", ")}`);
		await emit(hooks, { type: "wave_start", wave: wi, tasks: wave, memory });

		await runParallel(wave, maxConcurrency, async (task) => {
			task.status = "running";
			await emit(hooks, { type: "task_start", task, memory });

			const agentDef = agents.find(a => a.name === task.assignee);
			if (!agentDef) {
				task.status = "failed";
				task.error = `Agent not found: ${task.assignee}`;
				await emit(hooks, { type: "task_failed", task, memory });
				return { agent: task.assignee, status: "failed", result: "", turns: 0, error: task.error };
			}

			// Build focused task prompt (GSD: minimal context, clear criteria)
			const depContext = task.dependencies
				.map(id => tasks.find(t => t.id === id))
				.filter((t): t is Task => !!t && !!t.result)
				.map(t => `## Result from [${t.id}] (${t.assignee}):\n${t.result}`)
				.join("\n\n");

			const messages = memory.keys()
				.filter(k => k.startsWith("msg:") && k.includes(`→${task.assignee}:`))
				.map(k => `[Message from ${memory.getEntry(k)?.author}]: ${memory.get(k)}`)
				.join("\n");

			let prompt = `# Task: ${task.id}\n\n## Action\n${task.description}`;
			if (task.files?.length) prompt += `\n\n## Files to modify\n${task.files.map(f => `- ${f}`).join("\n")}`;
			if (task.doneCriteria) prompt += `\n\n## Definition of Done\n${task.doneCriteria}`;
			if (task.verify) prompt += `\n\n## Verification\n${task.verify}`;
			// Cross-wave context: include file contents from dependency tasks
			const depFileContext = task.dependencies
				.map(id => tasks.find(t => t.id === id))
				.filter((t): t is Task => !!t && !!t.files?.length && t.status === "done")
				.flatMap(t => t.files!)
				.slice(0, 5)
				.map(f => {
					try {
						const content = fs.readFileSync(path.resolve(cwd, f), "utf-8");
						return `### File: ${f}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``;
					} catch { return ""; }
				})
				.filter(Boolean)
				.join("\n\n");

			if (depFileContext) prompt = `# Files from prior tasks\n${depFileContext}\n\n${prompt}`;
			if (depContext) prompt = `# Context from prior tasks\n${depContext}\n\n${prompt}`;
			if (messages) prompt = `# Messages from teammates\n${messages}\n\n${prompt}`;

			// Conductor: fresh context per task (new Agent instance)
			// Guardian: skills auto-activate based on agent role
			const result = await runAgent(agentDef, prompt, cwd, memory, roster, defaultModel, 30, skills, engine, undefined, sandbox);
			totalInputTokens += result.inputTokens ?? 0;
			totalOutputTokens += result.outputTokens ?? 0;
			totalCostUsd += result.costUsd ?? 0;

			if (result.status === "rate_limited") {
				task.status = "pending"; // Reset to pending for retry
				task.error = result.error ?? "Rate limited";
				log.warn("conductor", `${task.id}: Rate limited`);
			} else if (result.status === "done" || result.status === "no_report") {
				task.status = "done";
				task.result = result.result;
				memory.set(`result:${task.id}`, result.result, task.assignee);

				// Conductor: atomic git commit per task
				if (autoCommit) {
					const committed = atomicCommit(cwd, task.id, task.description.slice(0, 50), task.files);
					if (committed) log.info("git", `Committed: ${task.id}`);
				}

				// Save task summary to .planning/
				planning.write(`${task.id}-SUMMARY.md`, `# ${task.id}: ${task.description.slice(0, 60)}\n\nAssignee: ${task.assignee}\nStatus: done\n\n## Result\n${task.result}`);

				await emit(hooks, { type: "task_done", task, memory });
			} else {
				task.status = "failed";
				task.error = result.error ?? result.result;
				await emit(hooks, { type: "task_failed", task, memory });
			}

			return result;
		});

		// Check for rate-limited tasks in this wave
		const rateLimitedTasks = wave.filter(t => t.status === "pending" && t.error?.includes("Rate limited"));
		if (rateLimitedTasks.length > 0) {
			rateLimitRetryCount++;
			if (rateLimitRetryCount > maxRateLimitRetries) {
				// Exhausted retries — mark as failed
				for (const t of rateLimitedTasks) {
					t.status = "failed";
					t.error = "Rate limit retries exhausted";
				}
				log.warn("conductor", `Rate limit retries exhausted (${maxRateLimitRetries})`);
			} else {
				// Save full checkpoint (memory + task state)
				doSaveCheckpoint(wi, tasks);

				await emit(hooks, { type: "rate_limit", wave: wi, tasks: rateLimitedTasks, memory });

				const delay = getRateLimitDelay(rateLimitRetryCount - 1, rateLimitBackoff);
				const delayMin = Math.floor(delay / 60000);
				const delaySec = Math.floor((delay % 60000) / 1000);
				log.info("conductor", `Rate limited. Waiting ${delayMin}m ${delaySec}s before retry (attempt ${rateLimitRetryCount}/${maxRateLimitRetries})`);

				await new Promise(resolve => setTimeout(resolve, delay));

				// Clear rate limit error for retry
				for (const t of rateLimitedTasks) {
					t.error = undefined;
				}

				// Retry this wave
				wi--;
				continue;
			}
		}

		await emit(hooks, { type: "wave_end", wave: wi, tasks: wave, memory });

		// Save checkpoint after every wave (enables full resume)
		doSaveCheckpoint(wi, tasks);

		// Git checkpoint after each successful wave
		if (autoCommit) {
			const waveSuccess = wave.every(t => t.status === "done" || t.status === "verified");
			if (waveSuccess) {
				const waveFiles = wave.flatMap(t => t.files ?? []);
				atomicCommit(cwd, `wave_${wi + 1}`, `Wave ${wi + 1}: ${wave.map(t => t.id).join(", ")}`, waveFiles);
				log.info("git", `Checkpoint: wave ${wi + 1}`);
				await emit(hooks, { type: "checkpoint", wave: wi, tasks: wave, memory });
			}
		}
	}

	// ── Phase 3: Verify ───────────────────────────────────────
	const doneTasks = tasks.filter(t => t.status === "done");
	if (verifyEnabled && doneTasks.some(t => t.verify)) {
		log.section("Phase 3: Verification");
		await emit(hooks, { type: "verify_start", tasks: doneTasks, memory });

		const verifier = agents.find(a => a.role === "tester" || a.role === "reviewer")
			?? agents.find(a => a.name !== "planner");

		if (verifier) {
			const verifyItems = doneTasks
				.filter(t => t.verify)
				.map(t => `### [${t.id}] ${t.description.slice(0, 60)}\nVerify: ${t.verify}\nDone criteria: ${t.doneCriteria ?? "(none)"}\nResult: ${(t.result ?? "").slice(0, 200)}`)
				.join("\n\n");

			const verifyResult = await runAgent(
				verifier,
				`# Guardian Verification (Two-Stage Review)\n\nVerify the following completed tasks using two stages:\n\n## Stage 1: Spec Compliance\nDoes each task meet its definition of done?\n\n## Stage 2: Code Quality\nAre there bugs, security issues, or quality problems?\n\n${verifyItems}\n\nFor each task, report PASS, FAIL, or WARN with category and details. Critical findings should be marked [CRITICAL]. Call report with your findings.`,
				cwd, memory, roster, defaultModel, 30, skills, engine, undefined, sandbox,
			);
			totalInputTokens += verifyResult.inputTokens ?? 0;
			totalOutputTokens += verifyResult.outputTokens ?? 0;
			totalCostUsd += verifyResult.costUsd ?? 0;

			if (verifyResult.status === "done" || verifyResult.status === "no_report") {
				planning.write("REVIEW.md", verifyResult.result);
				memory.set("review", verifyResult.result, verifier.name);

				// Parse structured findings from the verifier result
				const findings = parseReviewFindings(verifyResult.result);
				for (const t of doneTasks) {
					const taskFindings = findings.filter(f => f.taskId === t.id);
					const hasCritical = taskFindings.some(f => f.severity === "critical");
					if (qualityGate && hasCritical) {
						t.status = "failed";
						t.error = `Quality gate: ${taskFindings.filter(f => f.severity === "critical").map(f => f.message).join("; ")}`;
						log.warn("guardian", `${t.id} BLOCKED: ${t.error}`);
					} else if (taskFindings.every(f => f.severity === "pass" || f.severity === "warning")) {
						t.status = "verified";
					}
				}
			}
		}

		await emit(hooks, { type: "verify_done", tasks: doneTasks, memory });
	}

	// ── Phase 3b: Auto-Fix Loop ──────────────────────────────
	if (verifyEnabled) {
		let fixAttempt = 0;
		let verifyPassed = false;
		while (fixAttempt < maxFixAttempts && !verifyPassed) {
			const codeVerify = await runFullVerification(cwd);
			if (codeVerify.passed) {
				verifyPassed = true;
				break;
			}

			fixAttempt++;
			log.section(`Phase 3b: Auto-Fix (attempt ${fixAttempt}/${maxFixAttempts})`);
			await emit(hooks, { type: "fix_start", tasks, memory });

			// Find a coder agent to fix issues
			const coder = agents.find(a => a.role === "coder") ?? agents.find(a => a.name !== "planner");
			if (!coder) break;

			const fixPrompt = "Read .planning/VERIFICATION.md and .planning/REVIEW.md. Fix all FAIL and CRITICAL items from both files. Then re-run the failing commands to confirm they pass.";
			const fixResult = await runAgent(coder, fixPrompt, cwd, memory, roster, defaultModel, 30, skills, engine, undefined, sandbox);
			totalInputTokens += fixResult.inputTokens ?? 0;
			totalOutputTokens += fixResult.outputTokens ?? 0;
			totalCostUsd += fixResult.costUsd ?? 0;

			// Re-run verification after fix attempt
			const reVerify = await runFullVerification(cwd);
			verifyPassed = reVerify.passed;

			// Track attempts
			try {
				fs.writeFileSync(path.resolve(cwd, ".planning/.fix-attempts"), String(fixAttempt), "utf-8");
			} catch { /* ignore write errors */ }

			if (autoCommit && verifyPassed) {
				atomicCommit(cwd, `auto-fix-${fixAttempt}`, `Auto-fix attempt ${fixAttempt}`);
			}

			await emit(hooks, { type: "fix_done", tasks, memory });
		}
	}

	// ── Task Auto-Retry ──────────────────────────────────────
	const failedTasks = tasks.filter(t => t.status === "failed");
	{
		const retryableTasks = failedTasks.filter(t => !t.error?.includes("Unresolvable dependency"));
		for (const task of retryableTasks) {
			const retryCount = (task as any)._retries ?? 0;
			if (retryCount >= maxRetries) continue;

			log.info("conductor", `Retrying ${task.id} (attempt ${retryCount + 2})`);
			await emit(hooks, { type: "retry_start", task, memory });
			(task as any)._retries = retryCount + 1;

			const agentDef = agents.find(a => a.name === task.assignee);
			if (!agentDef) continue;

			const retryPrompt = `# Retry: ${task.id}\n\nPrevious attempt failed: ${task.error}\n\n## Action\n${task.description}\n\nFix the issue and complete the task.`;
			const result = await runAgent(agentDef, retryPrompt, cwd, memory, roster, defaultModel, 30, skills, engine, undefined, sandbox);
			totalInputTokens += result.inputTokens ?? 0;
			totalOutputTokens += result.outputTokens ?? 0;
			totalCostUsd += result.costUsd ?? 0;

			if (result.status === "done" || result.status === "no_report") {
				task.status = "done";
				task.result = result.result;
				task.error = undefined;
				memory.set(`result:${task.id}`, result.result, task.assignee);
				if (autoCommit) atomicCommit(cwd, task.id, `retry: ${task.description.slice(0, 50)}`, task.files);
			}
		}
	}

	// ── Re-plan on failures ───────────────────────────────────
	const failedTasksForReplan = tasks.filter(t => t.status === "failed");
	if (replanEnabled && failedTasksForReplan.length > 0 && failedTasksForReplan.length < tasks.length) {
		log.section("Re-planning failed tasks");

		const failedSummary = failedTasksForReplan
			.map(t => `- [${t.id}] ${t.assignee}: ${t.description}\n  Error: ${t.error}`)
			.join("\n");
		const doneSummary = tasks.filter(t => t.status === "done" || t.status === "verified")
			.map(t => `- [${t.id}] ${t.assignee}: ${t.description} → ${t.status}`)
			.join("\n");

		const replanResult = await runAgent(
			planner,
			`## Original Goal\n${goal}\n\n## Completed\n${doneSummary}\n\n## Failed\n${failedSummary}\n\n## Team\n${roster}\n\nCreate a recovery plan. Use different approaches where the original failed. Assign only to: ${available.join(", ")}.\n\nIMPORTANT: Call the report tool with ONLY a JSON code block:\n\`\`\`json\n{ "summary": "...", "tasks": [{ "id": "task_1", "name": "...", "assignee": "...", "dependencies": [], "files": [], "action": "...", "verify": "...", "done": "..." }] }\n\`\`\`\nDo NOT output markdown prose. Output ONLY JSON.`,
			cwd, memory, roster, defaultModel, 30, skills, engine, undefined, sandbox,
		);
		totalInputTokens += replanResult.inputTokens ?? 0;
		totalOutputTokens += replanResult.outputTokens ?? 0;
		totalCostUsd += replanResult.costUsd ?? 0;

		if (replanResult.status !== "failed") {
			const retryStructured = parseStructuredTasks(replanResult.result);
			if (retryStructured.length > 0) {
				const retryTasks: Task[] = retryStructured.map(st => ({
					id: st.id.startsWith("retry_") ? st.id : `retry_${st.id}`,
					description: st.action || st.name,
					assignee: st.assignee,
					dependencies: st.dependencies.filter(d => tasks.some(tt => tt.id === d && (tt.status === "done" || tt.status === "verified"))),
					files: st.files,
					verify: st.verify,
					doneCriteria: st.done,
					status: "pending" as const,
				}));

				const retryWaves = topologicalSort(retryTasks);
				for (let wi = 0; wi < retryWaves.length; wi++) {
					const wave = retryWaves[wi];
					log.section(`Retry Wave ${wi + 1}: ${wave.map(t => t.assignee).join(", ")}`);
					await runParallel(wave, maxConcurrency, async (task) => {
						task.status = "running";
						const agentDef = agents.find(a => a.name === task.assignee);
						if (!agentDef) {
							task.status = "failed";
							return { agent: task.assignee, status: "failed" as const, result: "", turns: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
						}
						const result = await runAgent(agentDef, task.description, cwd, memory, roster, defaultModel, 30, skills, engine, undefined, sandbox);
						totalInputTokens += result.inputTokens ?? 0;
						totalOutputTokens += result.outputTokens ?? 0;
						totalCostUsd += result.costUsd ?? 0;
						if (result.status === "done" || result.status === "no_report") {
							task.status = "done";
							task.result = result.result;
							memory.set(`result:${task.id}`, result.result, task.assignee);
							if (autoCommit) atomicCommit(cwd, task.id, task.description.slice(0, 50), task.files);
						} else {
							task.status = "failed";
							task.error = result.error ?? result.result;
						}
						return result;
					});
				}
				tasks.push(...retryTasks);
			}
		}
	}

	// ── Update State ──────────────────────────────────────────
	const doneCount = tasks.filter(t => t.status === "done" || t.status === "verified").length;
	const success = doneCount === tasks.length;

	// Clear checkpoint only on full success; keep for partial/failed to allow resume
	if (success) {
		clearCheckpoint(cwd);
	} else {
		log.info("checkpoint", "Keeping checkpoint for resume (not all tasks succeeded)");
	}

	planning.write("STATE.md", `# Project State

## Decisions
(see PLAN.md)

## Blockers
${failedTasksForReplan.length > 0 ? failedTasksForReplan.map(t => `- ${t.id}: ${t.error}`).join("\n") : "(none)"}

## Position
- Goal: ${goal}
- Tasks: ${doneCount}/${tasks.length} completed
- Status: ${success ? "SUCCESS" : "PARTIAL"}
`);

	// ── Summary ───────────────────────────────────────────────
	await emit(hooks, { type: "all_done", tasks, memory });
	log.section("Results");

	for (const t of tasks) {
		const icon = t.status === "verified" ? "✓" : t.status === "done" ? "+" : "x";
		log.info("conductor", `  [${icon}] ${t.id} (${t.assignee}): ${t.status}`);
	}

	// Build detailed summary with per-task results
	const taskSummaries = tasks
		.filter(t => t.status === "verified" || t.status === "done")
		.map(t => {
			const brief = t.result ? t.result.slice(0, 200).split("\n")[0] : t.description;
			return `- ${t.id}: ${brief}`;
		})
		.join("\n");
	const headline = success
		? `All ${tasks.length} tasks completed.`
		: `${doneCount}/${tasks.length} tasks completed.`;
	const summary = taskSummaries ? `${headline}\n${taskSummaries}` : headline;

	return { success, tasks, summary, memory, planning, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, costUsd: totalCostUsd };
}

// ─── Plan-Only Mode (for CC hybrid) ──────────────────────────

export interface PlanOnlyResult {
	success: boolean;
	planPath: string;
	tasks: StructuredTask[];
	waves: string[][];
	summary: string;
}

/**
 * Run ONLY the planning phases (brainstorm + research + plan).
 * Outputs structured PLAN.md for CC Agent tool execution.
 *
 * Used by: /awsl skill in CC hybrid mode
 * Code controls: structured prompts, JSON parsing, topological sort,
 *   dependency validation, assignee validation, wave computation.
 * LLM does: creative decomposition via builtin engine.
 */
export async function planOnly(
	goal: string,
	agents: TeamAgentDef[],
	cwd: string,
	defaultModel: string,
	options?: { brainstorm?: boolean; research?: boolean; engine?: Engine; sandbox?: boolean | SandboxPolicy },
): Promise<PlanOnlyResult> {
	const skills = new SkillRegistry();
	const engine = detectEngine(options?.engine ?? "builtin");
	const sandbox = options?.sandbox ?? true;
	const memory = new SharedMemory();
	const roster = buildRoster(agents);
	const planning = createPlanningDir(cwd);
	planning.init();

	const planner = agents.find(a => a.name === "planner");
	if (!planner) throw new Error("No planner agent found");
	const available = agents.filter(a => a.name !== "planner").map(a => a.name);

	// ── Phase 0a: Brainstorm ────────────────────────────────
	if (options?.brainstorm) {
		log.section("Phase 0a: Brainstorming");
		const brainstormer = agents.find(a => a.role === "architect") ?? planner;
		const result = await runAgent(
			brainstormer,
			`## Goal\n${goal}\n\n## Team\n${roster}\n\nConduct a Socratic brainstorming session. Explore requirements, alternatives, trade-offs. Produce a design document. Call report when done.`,
			cwd, memory, roster, defaultModel, 20, skills, engine, undefined, sandbox,
		);
		if (result.status === "done" || result.status === "no_report") {
			planning.write("DESIGN.md", result.result);
			memory.set("design", result.result, brainstormer.name);
			log.info("conductor", "Design saved to .planning/DESIGN.md");
		}
	}

	// ── Phase 0b: Research ──────────────────────────────────
	if (options?.research) {
		log.section("Phase 0b: Research");
		const researcher = agents.find(a => a.role === "architect") ?? agents.find(a => a.name !== "planner");
		if (researcher) {
			const topics = [
				{ name: "architecture", prompt: `Analyze the codebase architecture in ${cwd}. Document: file structure, module boundaries, key patterns. Be concise.` },
				{ name: "conventions", prompt: `Analyze coding conventions in ${cwd}. Document: naming, style, error handling, testing patterns. Be concise.` },
			];
			await runParallel(topics, 2, async (topic) => {
				const result = await runAgent(researcher, topic.prompt, cwd, memory, roster, defaultModel, 15, skills, engine, undefined, sandbox);
				if (result.status === "done" || result.status === "no_report") {
					planning.write(`research/${topic.name}.md`, result.result);
					memory.set(`research:${topic.name}`, result.result, researcher.name);
				}
				return result;
			});
			log.info("conductor", "Research saved to .planning/research/");
		}
	}

	// ── Phase 1: Plan ───────────────────────────────────────
	log.section("Phase 1: Planning");

	const researchContext = memory.keys()
		.filter(k => k.startsWith("research:"))
		.map(k => `### ${k}\n${memory.get(k)}`)
		.join("\n\n");
	const existingState = planning.stateSummary();

	const planPrompt = `## Team Members\n${roster}\n\n## Goal\n${goal}\n\n${researchContext ? `## Research Findings\n${researchContext}\n` : ""}${existingState !== "(no state file)" ? `## Project State\n${existingState}\n` : ""}## Instructions\n\nCreate a structured task plan. Output MUST be a JSON code block and nothing else.\n\nRules:\n- ONE deliverable per task, max 2-3 files\n- No dependencies = can run in parallel\n- Do NOT assign to "planner"\n- verify should be a runnable command when possible\n\nIMPORTANT: Call the report tool with ONLY a JSON code block in this EXACT format:\n\n\`\`\`json\n{\n  "summary": "Brief plan description",\n  "tasks": [\n    {\n      "id": "task_1",\n      "name": "Short task name",\n      "assignee": "one of [${available.join(", ")}]",\n      "dependencies": [],\n      "files": ["src/example.ts"],\n      "action": "Detailed implementation instructions",\n      "verify": "npm test",\n      "done": "Definition of done"\n    }\n  ]\n}\n\`\`\`\n\nDo NOT output any text before or after the JSON. Do NOT use markdown prose format.`;

	const planResult = await runAgent(planner, planPrompt, cwd, memory, roster, defaultModel, 30, skills, engine, undefined, sandbox);

	if (planResult.status === "failed") {
		return { success: false, planPath: "", tasks: [], waves: [], summary: `Planning failed: ${planResult.error}` };
	}

	// ── Code-controlled validation ──────────────────────────
	let structuredTasks = parseStructuredTasks(planResult.result);
	if (structuredTasks.length === 0) {
		// Fallback: try reading PLAN.md (planner may have written it as a file)
		const planMdPath = path.join(cwd, ".planning", "PLAN.md");
		if (fs.existsSync(planMdPath)) {
			const planMdContent = fs.readFileSync(planMdPath, "utf-8");
			structuredTasks = parseStructuredTasks(planMdContent);
			if (structuredTasks.length > 0) {
				log.info("conductor", `Parsed ${structuredTasks.length} tasks from .planning/PLAN.md`);
			}
		}
	}
	if (structuredTasks.length === 0) {
		return { success: false, planPath: "", tasks: [], waves: [], summary: `No parseable tasks from planner output:\n${planResult.result.slice(0, 300)}` };
	}

	// Validate assignees
	const agentNames = new Set(agents.map(a => a.name));
	for (const task of structuredTasks) {
		if (!agentNames.has(task.assignee) && task.assignee !== "planner") {
			log.warn("conductor", `Task ${task.id}: unknown agent "${task.assignee}", reassigning to coder`);
			task.assignee = available.includes("coder") ? "coder" : available[0];
		}
	}

	// Validate dependencies (no cycles, all refs exist)
	const taskIds = new Set(structuredTasks.map(t => t.id));
	for (const task of structuredTasks) {
		task.dependencies = task.dependencies.filter(dep => {
			if (!taskIds.has(dep)) {
				log.warn("conductor", `Task ${task.id}: removing invalid dependency "${dep}"`);
				return false;
			}
			return true;
		});
	}

	// Topological sort → compute waves
	const tempTasks = structuredTasks.map(st => ({
		id: st.id, description: st.action || st.name, assignee: st.assignee,
		dependencies: st.dependencies, status: "pending" as Task["status"], files: st.files,
	}));
	const waves = topologicalSort(tempTasks);
	const waveIds = waves.map(w => w.map(t => t.id));

	// Check for cycle failures
	const failedIds = tempTasks.filter(t => t.status === "failed").map(t => t.id);
	if (failedIds.length > 0) {
		log.warn("conductor", `Dependency cycle detected in: ${failedIds.join(", ")}`);
	}

	// Save plan
	const planPath = planning.root + "/PLAN.md";
	planning.write("PLAN.md", formatPlanMarkdown(structuredTasks));

	// Save wave info for CC execution
	const waveInfo = waveIds.map((ids, i) => `Wave ${i + 1}: ${ids.join(", ")}`).join("\n");
	planning.write("WAVES.md", `# Execution Waves\n\n${waveInfo}\n\nTotal: ${waveIds.length} waves, ${structuredTasks.length} tasks`);

	// Log plan
	log.info("conductor", `Plan: ${structuredTasks.length} tasks in ${waveIds.length} waves`);
	for (let wi = 0; wi < waveIds.length; wi++) {
		const waveTasks = waveIds[wi].map(id => structuredTasks.find(t => t.id === id)!);
		for (const t of waveTasks) {
			log.info("conductor", `  Wave ${wi + 1} [${t.id}] ${t.assignee}: ${t.name}`);
		}
	}

	const summary = `Plan ready: ${structuredTasks.length} tasks in ${waveIds.length} waves. Saved to .planning/PLAN.md`;
	log.info("conductor", summary);

	return { success: true, planPath, tasks: structuredTasks, waves: waveIds, summary };
}

// ─── Utilities ────────────────────────────────────────────────

function formatPlanMarkdown(tasks: StructuredTask[]): string {
	const lines = ["# Execution Plan\n"];
	for (const t of tasks) {
		lines.push(`## ${t.id}: ${t.name}`);
		lines.push(`- **Assignee:** ${t.assignee}`);
		if (t.dependencies.length) lines.push(`- **Dependencies:** ${t.dependencies.join(", ")}`);
		if (t.files.length) lines.push(`- **Files:** ${t.files.join(", ")}`);
		lines.push(`\n### Action\n${t.action}`);
		if (t.verify) lines.push(`\n### Verify\n${t.verify}`);
		if (t.done) lines.push(`\n### Done\n${t.done}`);
		lines.push("");
	}
	return lines.join("\n");
}
