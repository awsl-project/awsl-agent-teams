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
import { SharedMemory } from "./memory.js";
import { log } from "./log.js";
import { type RunResult, type Engine, runAgent, runParallel, detectEngine } from "./runner.js";
import { createPlanningDir, parseStructuredTasks, atomicCommit, type StructuredTask, type PlanningDir } from "./planning.js";
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
	let remaining = tasks.filter(t => t.status !== "failed");

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
	const memory = new SharedMemory();
	const roster = buildRoster(agents);
	const planning = createPlanningDir(cwd);
	planning.init();

	const planner = agents.find(a => a.name === "planner");
	if (!planner) throw new Error("No planner agent found");
	const available = agents.filter(a => a.name !== "planner").map(a => a.name);

	// ── Phase 0a: Brainstorm (Guardian) ──────────────────────
	if (brainstormEnabled) {
		log.section("Phase 0a: Brainstorming");
		const brainstormer = agents.find(a => a.role === "architect") ?? planner;

		const brainstormResult = await runAgent(
			brainstormer,
			`## Goal\n${goal}\n\n## Team\n${roster}\n\nConduct a Socratic brainstorming session about this goal. Explore requirements, alternatives, trade-offs, and constraints. Produce a design document with key decisions and rationale. Store it in shared memory as "design". Call report when done.`,
			cwd, memory, roster, defaultModel, 20, skills, engine,
		);

		if (brainstormResult.status === "done" || brainstormResult.status === "no_report") {
			planning.write("DESIGN.md", brainstormResult.result);
			memory.set("design", brainstormResult.result, brainstormer.name);
			log.info("conductor", "Design document saved to .planning/DESIGN.md");
		}
	}

	// ── Phase 0b: Research (Conductor) ───────────────────────
	const needsResearch = options?.research ?? goal.length > 200;
	if (needsResearch) {
		log.section("Phase 0: Research");
		await emit(hooks, { type: "research_start", memory });

		const researchTopics = [
			{ name: "architecture", prompt: `Analyze the codebase architecture in ${cwd}. Document: file structure, module boundaries, key patterns, frameworks used. Be concise and specific.` },
			{ name: "conventions", prompt: `Analyze coding conventions in ${cwd}. Document: naming, style, error handling, testing patterns. Be concise.` },
		];

		// Use architect or first available agent for research
		const researcher = agents.find(a => a.role === "architect") ?? agents.find(a => a.name !== "planner");
		if (researcher) {
			await runParallel(researchTopics, maxConcurrency, async (topic) => {
				const result = await runAgent(researcher, topic.prompt, cwd, memory, roster, defaultModel, 15, skills, engine);
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

	// ── Phase 1: Plan ─────────────────────────────────────────
	log.section("Phase 1: Planning");

	// Build rich context for planner
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

Create a structured task plan. Each task MUST include:
- id: unique identifier
- name: short task name
- assignee: one of [${available.join(", ")}]
- dependencies: array of task ids this depends on
- files: array of files this task will touch
- action: detailed implementation instructions
- verify: how to verify this task succeeded (test command, manual check, etc.)
- done: definition of done — what must be true when complete

Rules:
- Keep each task focused — ONE deliverable, max 2-3 files
- No dependencies = can run in parallel
- Do NOT assign to "planner"

Call the report tool with your JSON plan:
{
  "summary": "...",
  "tasks": [ { id, name, assignee, dependencies, files, action, verify, done } ]
}`;

	const planResult = await runAgent(planner, planPrompt, cwd, memory, roster, defaultModel, 30, skills, engine);

	if (planResult.status === "failed") {
		return { success: false, tasks: [], summary: `Planning failed: ${planResult.error}`, memory, planning };
	}

	// Parse structured tasks from planner result, fallback to PLAN.md file
	let structuredTasks = parseStructuredTasks(planResult.result);
	if (structuredTasks.length === 0) {
		// Planner may have written tasks to PLAN.md file instead of returning them in result
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
		return { success: false, tasks: [], summary: `Planner produced no parseable tasks:\n${planResult.result.slice(0, 300)}`, memory, planning };
	}

	// Convert to Task objects
	const tasks: Task[] = structuredTasks.map(st => ({
		id: st.id,
		description: st.action || st.name,
		assignee: st.assignee,
		dependencies: st.dependencies,
		files: st.files,
		verify: st.verify,
		doneCriteria: st.done,
		status: "pending" as const,
	}));

	// Validate assignees
	const agentNames = new Set(agents.map(a => a.name));
	for (const task of tasks) {
		if (!agentNames.has(task.assignee)) {
			log.warn("conductor", `Task ${task.id}: unknown agent "${task.assignee}"`);
			task.status = "failed";
			task.error = `Unknown agent: ${task.assignee}`;
		}
	}

	// Save plan
	log.info("conductor", `Plan: ${tasks.length} tasks`);
	for (const t of tasks) {
		const deps = t.dependencies.length > 0 ? ` (after: ${t.dependencies.join(", ")})` : "";
		const files = t.files?.length ? ` [${t.files.join(", ")}]` : "";
		log.info("conductor", `  [${t.id}] ${t.assignee}: ${t.description.slice(0, 60)}${deps}${files}`);
	}

	planning.write("PLAN.md", formatPlanMarkdown(structuredTasks));
	memory.set("plan", JSON.stringify(structuredTasks, null, 2), "planner");
	await emit(hooks, { type: "plan_ready", tasks, memory });

	// ── Phase 2: Execute ──────────────────────────────────────
	const waves = topologicalSort(tasks);
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
			const result = await runAgent(agentDef, prompt, cwd, memory, roster, defaultModel, 30, skills, engine);

			if (result.status === "done" || result.status === "no_report") {
				task.status = "done";
				task.result = result.result;
				memory.set(`result:${task.id}`, result.result, task.assignee);

				// Conductor: atomic git commit per task
				if (autoCommit) {
					const committed = atomicCommit(cwd, task.id, task.description.slice(0, 50));
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

		await emit(hooks, { type: "wave_end", wave: wi, tasks: wave, memory });

		// Git checkpoint after each successful wave
		if (autoCommit) {
			const waveSuccess = wave.every(t => t.status === "done" || t.status === "verified");
			if (waveSuccess) {
				atomicCommit(cwd, `wave_${wi + 1}`, `Wave ${wi + 1}: ${wave.map(t => t.id).join(", ")}`);
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
				cwd, memory, roster, defaultModel, 30, skills, engine,
			);

			if (verifyResult.status === "done" || verifyResult.status === "no_report") {
				planning.write("VERIFICATION.md", verifyResult.result);
				memory.set("verification", verifyResult.result, verifier.name);

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
	{
		let fixAttempt = 0;
		let verifyPassed = false;
		while (fixAttempt < maxFixAttempts && !verifyPassed) {
			const codeVerify = runFullVerification(cwd);
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

			const fixPrompt = "Read .planning/VERIFICATION.md. Fix all FAIL items. Then re-run the failing commands to confirm they pass.";
			await runAgent(coder, fixPrompt, cwd, memory, roster, defaultModel, 30, skills, engine);

			// Re-run verification after fix attempt
			const reVerify = runFullVerification(cwd);
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
			const result = await runAgent(agentDef, retryPrompt, cwd, memory, roster, defaultModel, 30, skills, engine);

			if (result.status === "done" || result.status === "no_report") {
				task.status = "done";
				task.result = result.result;
				task.error = undefined;
				memory.set(`result:${task.id}`, result.result, task.assignee);
				if (autoCommit) atomicCommit(cwd, task.id, `retry: ${task.description.slice(0, 50)}`);
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
			`## Original Goal\n${goal}\n\n## Completed\n${doneSummary}\n\n## Failed\n${failedSummary}\n\n## Team\n${roster}\n\nCreate a recovery plan. Use different approaches where the original failed. Each task needs: id, name, assignee, dependencies, files, action, verify, done. Assign only to: ${available.join(", ")}. Call the report tool with your JSON plan.`,
			cwd, memory, roster, defaultModel, 30, skills, engine,
		);

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
							return { agent: task.assignee, status: "failed" as const, result: "", turns: 0 };
						}
						const result = await runAgent(agentDef, task.description, cwd, memory, roster, defaultModel, 30, skills, engine);
						if (result.status === "done" || result.status === "no_report") {
							task.status = "done";
							task.result = result.result;
							memory.set(`result:${task.id}`, result.result, task.assignee);
							if (autoCommit) atomicCommit(cwd, task.id, task.description.slice(0, 50));
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

	const summary = success
		? `All ${tasks.length} tasks completed.`
		: `${doneCount}/${tasks.length} tasks completed.`;

	return { success, tasks, summary, memory, planning };
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
	options?: { brainstorm?: boolean; research?: boolean; engine?: Engine },
): Promise<PlanOnlyResult> {
	const skills = new SkillRegistry();
	const engine = detectEngine(options?.engine ?? "builtin");
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
			cwd, memory, roster, defaultModel, 20, skills, engine,
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
				const result = await runAgent(researcher, topic.prompt, cwd, memory, roster, defaultModel, 15, skills, engine);
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

	const planPrompt = `## Team Members\n${roster}\n\n## Goal\n${goal}\n\n${researchContext ? `## Research Findings\n${researchContext}\n` : ""}${existingState !== "(no state file)" ? `## Project State\n${existingState}\n` : ""}## Instructions\n\nCreate a structured task plan. Each task MUST include:\n- id: unique identifier (e.g. task_1, task_2)\n- name: short task name\n- assignee: one of [${available.join(", ")}]\n- dependencies: array of task ids this depends on\n- files: array of files this task will touch\n- action: detailed implementation instructions\n- verify: how to verify (runnable command preferred, e.g. npm test)\n- done: definition of done\n\nRules:\n- ONE deliverable per task, max 2-3 files\n- No dependencies = can run in parallel\n- Do NOT assign to "planner"\n- verify should be a runnable command when possible\n\nCall the report tool with JSON:\n{\n  "summary": "...",\n  "tasks": [ { id, name, assignee, dependencies, files, action, verify, done } ]\n}`;

	const planResult = await runAgent(planner, planPrompt, cwd, memory, roster, defaultModel, 30, skills, engine);

	if (planResult.status === "failed") {
		return { success: false, planPath: "", tasks: [], waves: [], summary: `Planning failed: ${planResult.error}` };
	}

	// ── Code-controlled validation ──────────────────────────
	const structuredTasks = parseStructuredTasks(planResult.result);
	if (structuredTasks.length === 0) {
		return { success: false, planPath: "", tasks: [], waves: [], summary: `No parseable tasks from planner output` };
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
