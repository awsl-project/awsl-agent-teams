/**
 * Task Queue — sequential task execution with dependency tracking.
 *
 * Persists tasks to .planning/QUEUE.json and executes them in order,
 * respecting dependency chains. Integrates with the orchestrator for
 * full team execution per task.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync, spawn } from "node:child_process";
import { executeTeam, type ExecuteOptions } from "./orchestrator.js";
import { type Engine, detectEngine } from "./runner.js";
import { loadAgents } from "./agents.js";
import { discussTeam } from "./discuss.js";
import { RunContext } from "./context.js";
import { log } from "./log.js";
import { appendHistory } from "./history.js";
import { atomicCommit } from "./planning.js";
import { atomicWriteFileSync, withFileLock, withFileLockAsync } from "./fs-utils.js";
import { scheduleQueueRun, cancelScheduledRun } from "./scheduler.js";

// ─── Git Push Helper ────────────────────────────────────────

function gitPush(cwd: string): boolean {
	try {
		execSync("git push", { cwd, stdio: "pipe", timeout: 60000 });
		log.info("git", "Pushed to remote");
		return true;
	} catch (e: any) {
		log.warn("git", `Push failed: ${e.message?.slice(0, 200) ?? e}`);
		return false;
	}
}

// ─── Interfaces for queue plan ──────────────────────────────

export interface PlannedTask {
	goal: string;
	dependsOn?: string[];  // references by index: "q_1", "q_2", or "all"
	quick?: boolean;
}

// ─── Interfaces ──────────────────────────────────────────────

export interface QueueTask {
	id: string;
	goal: string;
	engine?: Engine;
	mode?: "build" | "discuss";
	options: {
		model?: string;
		concurrency?: number;
		quick?: boolean;
		agentsDirs?: string[];
		autoCommit?: boolean;
		autoPush?: boolean;
		verify?: boolean;
		replan?: boolean;
		discussRounds?: number;
	};
	status: "pending" | "running" | "done" | "failed" | "paused";
	scheduledAt?: string;
	runAt?: string;       // ISO timestamp — task won't start before this time
	dependsOn?: string[];
	result?: { success: boolean; summary: string };
	startedAt?: string;
	completedAt?: string;
	error?: string;
}

export interface QueueData {
	tasks: QueueTask[];
	createdAt: string;
	updatedAt: string;
}

// ─── TaskQueue ───────────────────────────────────────────────

export class TaskQueue {
	private queuePath: string;
	private cwd: string;
	private onStatusChange?: () => void;

	constructor(cwd: string, options?: { onStatusChange?: () => void }) {
		this.cwd = cwd;
		this.queuePath = path.join(cwd, ".planning", "QUEUE.json");
		this.onStatusChange = options?.onStatusChange;
	}

	/** Path to the file-based mutex lock for queue operations. */
	private get lockPath(): string {
		return path.join(path.dirname(this.queuePath), ".queue.lock");
	}

	/**
	 * Add a new task to the queue.
	 */
	add(goal: string, options?: QueueTask["options"], extra?: { engine?: Engine; dependsOn?: string[]; runAt?: string; mode?: "build" | "discuss" }): QueueTask {
		const task = withFileLock(this.lockPath, () => {
			const data = this.load();
			const id = `q_${this.nextId(data)}`;
			const t: QueueTask = {
				id,
				goal,
				options: options ?? {},
				status: "pending",
				scheduledAt: new Date().toISOString(),
			};
			if (extra?.engine) t.engine = extra.engine;
			if (extra?.dependsOn) t.dependsOn = extra.dependsOn;
			if (extra?.runAt) t.runAt = extra.runAt;
			if (extra?.mode) t.mode = extra.mode;
			data.tasks.push(t);
			this.saveInternal(data);
			return t;
		});

		// Register system scheduled task if runAt is set (outside lock)
		if (extra?.runAt) {
			try {
				scheduleQueueRun(task.id, new Date(extra.runAt), this.cwd);
			} catch (e: any) {
				log.warn("queue", `Failed to register system scheduler: ${e.message}`);
			}
		}

		return task;
	}

	/**
	 * Remove a task by ID.
	 */
	remove(id: string): boolean {
		const result = withFileLock(this.lockPath, () => {
			const data = this.load();
			const idx = data.tasks.findIndex(t => t.id === id);
			if (idx === -1) return { removed: false, hadRunAt: false };
			const task = data.tasks[idx];
			data.tasks.splice(idx, 1);
			this.saveInternal(data);
			return { removed: true, hadRunAt: !!task.runAt };
		});

		// Cancel system scheduled task if it had one (outside lock)
		if (result.hadRunAt) {
			try { cancelScheduledRun(id); } catch { /* best effort */ }
		}

		return result.removed;
	}

	/**
	 * List all tasks in the queue.
	 */
	list(): QueueTask[] {
		return this.load().tasks;
	}

	/**
	 * Clear the entire queue by deleting QUEUE.json.
	 */
	clear(): void {
		withFileLock(this.lockPath, () => {
			try {
				if (fs.existsSync(this.queuePath)) {
					fs.unlinkSync(this.queuePath);
				}
			} catch {
				/* ignore */
			}
		});
	}

	/**
	 * Get a single task by ID.
	 */
	get(id: string): QueueTask | undefined {
		return this.load().tasks.find(t => t.id === id);
	}

	/**
	 * Update the runAt time for a pending task. Pass null to clear.
	 */
	setRunAt(id: string, runAt: string | null): boolean {
		return withFileLock(this.lockPath, () => {
			const data = this.load();
			const task = data.tasks.find(t => t.id === id);
			if (!task || task.status !== "pending") return false;

			// Cancel existing scheduled job
			try { cancelScheduledRun(id); } catch { /* best effort */ }

			if (runAt) {
				task.runAt = runAt;
				// Register new scheduled job
				try {
					scheduleQueueRun(id, new Date(runAt), this.cwd);
				} catch (e: any) {
					log.warn("queue", `Failed to update scheduler: ${e.message}`);
				}
			} else {
				delete task.runAt;
			}
			this.saveInternal(data);
			return true;
		});
	}

	/**
	 * Main daemon loop — execute pending tasks sequentially.
	 */
	async start(defaultEngine?: Engine, options?: { once?: boolean; ignoreRunAt?: boolean; autoPush?: boolean }): Promise<void> {
		log.section("Queue: Starting task execution");

		// Graceful shutdown: on SIGTERM/SIGINT, reset current running task to pending
		let shuttingDown = false;
		const gracefulShutdown = (signal: string) => {
			if (shuttingDown) return;
			shuttingDown = true;
			log.warn("queue", `Received ${signal}, shutting down gracefully...`);
			// Reset any running tasks back to pending
			try {
				withFileLock(this.lockPath, () => {
					const data = this.load();
					for (const t of data.tasks) {
						if (t.status === "running") {
							t.status = "pending";
							t.startedAt = undefined;
						}
					}
					this.saveInternal(data);
				});
				this.onStatusChange?.();
				log.info("queue", "Reset running tasks to pending");
			} catch { /* best effort */ }
		};
		process.on("SIGINT", () => gracefulShutdown("SIGINT"));
		process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

		// Recover from crash: any task left "running" from a prior session is stale
		let didRecover = false;
		await withFileLockAsync(this.lockPath, async () => {
			const recoverData = this.load();
			let recovered = 0;
			for (const t of recoverData.tasks) {
				if (t.status === "running") {
					t.status = "pending";
					t.startedAt = undefined;
					recovered++;
				}
			}
			if (recovered > 0) {
				this.saveInternal(recoverData);
				didRecover = true;
				log.info("queue", `Recovered ${recovered} stale running task(s) to pending`);
			}
		});
		if (didRecover) this.onStatusChange?.();

		while (!shuttingDown) {
			const data = this.load();
			const pendingTasks = data.tasks.filter(t => t.status === "pending");

			if (pendingTasks.length === 0) {
				// Genuinely nothing left to run
				break;
			}

			// Find next runnable pending task (all deps satisfied + runAt check)
			const now = Date.now();
			let earliestRunAt: number | null = null;
			let hasWaitingOnDeps = false;

			const nextTask = data.tasks.find((task, idx) => {
				if (task.status !== "pending") return false;

				// Check scheduled time (skip if ignoreRunAt)
				if (task.runAt && !options?.ignoreRunAt) {
					const runTime = Date.parse(task.runAt);
					if (!isNaN(runTime) && runTime > now) {
						// Not yet time — track earliest for sleep
						if (earliestRunAt === null || runTime < earliestRunAt) {
							earliestRunAt = runTime;
						}
						return false;
					}
				}

				// Check dependency constraints
				if (task.dependsOn && task.dependsOn.length > 0) {
					for (const dep of task.dependsOn) {
						if (dep === "all") {
							const allPriorDone = data.tasks
								.slice(0, idx)
								.every(t => t.status === "done");
							if (!allPriorDone) {
								// Check if any dep is still running/pending (not a deadlock)
								const anyStillActive = data.tasks
									.slice(0, idx)
									.some(t => t.status === "running" || t.status === "pending");
								if (anyStillActive) hasWaitingOnDeps = true;
								return false;
							}
						} else {
							const depTask = data.tasks.find(t => t.id === dep);
							if (!depTask || depTask.status !== "done") {
								if (depTask && (depTask.status === "running" || depTask.status === "pending")) {
									hasWaitingOnDeps = true;
								}
								return false;
							}
						}
					}
				}

				return true;
			});

			if (!nextTask) {
				// In one-shot mode (triggered by scheduler), don't poll — just exit
				if (options?.once) {
					log.info("queue", "One-shot mode: no runnable tasks right now, exiting");
					break;
				}

				// If tasks are waiting on runAt, sleep until the earliest one
				if (earliestRunAt !== null) {
					const waitMs = earliestRunAt - Date.now();
					if (waitMs > 0) {
						const waitMin = Math.ceil(waitMs / 60000);
						const runAtStr = new Date(earliestRunAt).toLocaleTimeString();
						log.info("queue", `Next task scheduled at ${runAtStr}, waiting ${waitMin} min...`);
						await new Promise(r => setTimeout(r, Math.min(waitMs, 30000)));
						continue; // Re-check after sleep (poll every 30s max)
					}
					continue;
				}

				// Tasks waiting on deps that are still active — not a deadlock, just wait
				if (hasWaitingOnDeps) {
					await new Promise(r => setTimeout(r, 5000));
					continue;
				}

				// Genuine deadlock — all deps are failed/missing
				const blocked = pendingTasks.map(t => `${t.id} (deps: ${t.dependsOn?.join(",") ?? "none"})`);
				log.warn("queue", `Dependency deadlock: ${blocked.length} task(s) blocked:\n  ${blocked.join("\n  ")}`);
				for (const t of pendingTasks) {
					await withFileLockAsync(this.lockPath, async () => {
						const freshData = this.load();
						const freshTask = freshData.tasks.find(ft => ft.id === t.id);
						if (freshTask && freshTask.status === "pending") {
							freshTask.status = "failed";
							freshTask.completedAt = new Date().toISOString();
							freshTask.error = "Dependency deadlock: required dependency failed or missing";
							this.saveInternal(freshData);
						}
					});
					this.onStatusChange?.();
				}
				break;
			}

			// Mark as running
			await withFileLockAsync(this.lockPath, async () => {
				nextTask.status = "running";
				nextTask.startedAt = new Date().toISOString();
				this.saveInternal(data);
			});
			this.onStatusChange?.();

			log.section(`Queue: Executing ${nextTask.id}`);
			log.info("queue", `Goal: ${nextTask.goal}`);

			const ctx = RunContext.tryAcquire(this.cwd, { description: `queue:${nextTask.id}` });
			if (!ctx) {
				log.warn("queue", `Cannot acquire lock for ${nextTask.id}, skipping`);
				await withFileLockAsync(this.lockPath, async () => {
					const revertData = this.load();
					const revertTask = revertData.tasks.find(t => t.id === nextTask.id);
					if (revertTask) { revertTask.status = "pending"; revertTask.startedAt = undefined; }
					this.saveInternal(revertData);
				});
				this.onStatusChange?.();
				break;
			}
			try {
				// Load agents
				const agentsDirs = [
					path.join(this.cwd, "agents"),
					...(nextTask.options.agentsDirs ?? []),
				];
				const agents = loadAgents(agentsDirs);

				// Determine execution parameters
				const model = nextTask.options.model ?? "anthropic:claude-sonnet-4-20250514";
				const concurrency = nextTask.options.concurrency ?? 2;
				const engine = detectEngine(nextTask.engine ?? defaultEngine);

				// Task-level timeout: 2 hours
				const TASK_TIMEOUT_MS = 2 * 60 * 60 * 1000;
				const timeoutPromise = new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error(`Task ${nextTask.id} timed out after ${TASK_TIMEOUT_MS / 60000} minutes`)), TASK_TIMEOUT_MS)
				);

				if (nextTask.mode === "discuss") {
					// ── Discussion mode — multi-agent reasoning ──
					const discussResult = await Promise.race([
						discussTeam(nextTask.goal, agents, this.cwd, model, {
							rounds: nextTask.options.discussRounds,
							engine,
						}),
						timeoutPromise,
					]);

					const discussFreshTask = await withFileLockAsync(this.lockPath, async () => {
						const freshData = this.load();
						const ft = freshData.tasks.find(t => t.id === nextTask.id);
						if (ft) {
							ft.status = "done";
							ft.completedAt = new Date().toISOString();
							ft.result = {
								success: true,
								summary: discussResult.answer.slice(0, 500),
							};
							this.saveInternal(freshData);
						}
						return ft;
					});
					this.onStatusChange?.();

					if (discussFreshTask) {
						try {
							appendHistory(this.cwd, {
								date: new Date().toISOString(),
								project: path.basename(this.cwd),
								projectPath: this.cwd,
								queueTaskId: discussFreshTask.id,
								goal: discussFreshTask.goal,
								status: "done",
								startedAt: discussFreshTask.startedAt!,
								completedAt: discussFreshTask.completedAt!,
								duration: Date.parse(discussFreshTask.completedAt!) - Date.parse(discussFreshTask.startedAt!),
								tasksCompleted: discussResult.agents.length,
								tasksTotal: discussResult.agents.length,
								summary: discussResult.answer.slice(0, 500),
								engine: detectEngine(discussFreshTask.engine) as string,
								inputTokens: discussResult.inputTokens,
								outputTokens: discussResult.outputTokens,
								costUsd: discussResult.costUsd,
								agents: discussResult.agents,
								mode: "discuss",
								answer: discussResult.answer,
							});
						} catch (e) {
							log.warn("queue", `Failed to record history: ${e}`);
						}
					}
					log.info("queue", `${nextTask.id}: discussion complete`);
				} else {
					// ── Build mode — full team execution ──
					const execOptions: ExecuteOptions = {
						brainstorm: !nextTask.options.quick,
						research: !nextTask.options.quick,
						verify: nextTask.options.verify ?? true,
						autoCommit: nextTask.options.autoCommit ?? true,
						replan: nextTask.options.replan ?? true,
						qualityGate: true,
						engine,
						maxRateLimitRetries: 20,
						resumeFromCheckpoint: true,
					};

					const teamResult = await Promise.race([
						executeTeam(
							nextTask.goal,
							agents,
							this.cwd,
							model,
							concurrency,
							execOptions,
						),
						timeoutPromise,
					]);

					// Reload data in case it changed during execution
					const buildFreshTask = await withFileLockAsync(this.lockPath, async () => {
						const freshData = this.load();
						const ft = freshData.tasks.find(t => t.id === nextTask.id);
						if (ft) {
							ft.status = teamResult.success ? "done" : "failed";
							ft.completedAt = new Date().toISOString();
							ft.result = {
								success: teamResult.success,
								summary: teamResult.summary,
							};
							if (!teamResult.success) {
								ft.error = teamResult.summary;
							}
							this.saveInternal(freshData);
						}
						return ft;
					});
					this.onStatusChange?.();

					if (buildFreshTask) {
						// Record history entry
						try {
							const tasksCompletedMatch = teamResult.summary.match(/(\d+)\/\d+ tasks/);
							const tasksTotalMatch = teamResult.summary.match(/\d+\/(\d+) tasks/);
							appendHistory(this.cwd, {
								date: new Date().toISOString(),
								project: path.basename(this.cwd),
								projectPath: this.cwd,
								queueTaskId: buildFreshTask.id,
								goal: buildFreshTask.goal,
								status: buildFreshTask.status as "done" | "failed",
								startedAt: buildFreshTask.startedAt!,
								completedAt: buildFreshTask.completedAt!,
								duration: Date.parse(buildFreshTask.completedAt!) - Date.parse(buildFreshTask.startedAt!),
								tasksCompleted: tasksCompletedMatch ? parseInt(tasksCompletedMatch[1], 10) : 0,
								tasksTotal: tasksTotalMatch ? parseInt(tasksTotalMatch[1], 10) : 0,
								summary: buildFreshTask.result?.summary ?? "",
								engine: detectEngine(buildFreshTask.engine) as string,
								inputTokens: teamResult.inputTokens ?? 0,
								outputTokens: teamResult.outputTokens ?? 0,
								costUsd: teamResult.costUsd ?? 0,
								waves: teamResult.waves,
								agents: teamResult.agents,
								maxConcurrency: teamResult.maxConcurrency,
							});
						} catch (e) {
							log.warn("queue", `Failed to record history: ${e}`);
						}
					}

					// Auto-commit queue state after task completion
					try {
						const committed = atomicCommit(this.cwd, nextTask.id, `queue: ${nextTask.id} ${teamResult.success ? "done" : "failed"} — ${nextTask.goal}`);
						if (committed && (nextTask.options.autoPush ?? options?.autoPush ?? false)) {
							gitPush(this.cwd);
						}
					} catch (e) {
						log.warn("queue", `Failed to auto-commit after task: ${e}`);
					}

					log.info("queue", `${nextTask.id}: ${teamResult.success ? "done" : "failed"} — ${teamResult.summary}`);
				}
			} catch (err: any) {
				// Mark as failed on error
				const errFreshTask = await withFileLockAsync(this.lockPath, async () => {
					const freshData = this.load();
					const ft = freshData.tasks.find(t => t.id === nextTask.id);
					if (ft) {
						ft.status = "failed";
						ft.completedAt = new Date().toISOString();
						ft.error = err.message ?? String(err);
						this.saveInternal(freshData);
					}
					return ft;
				});
				this.onStatusChange?.();

				if (errFreshTask) {
					// Record history entry for failure
					try {
						appendHistory(this.cwd, {
							date: new Date().toISOString(),
							project: path.basename(this.cwd),
							projectPath: this.cwd,
							queueTaskId: errFreshTask.id,
							goal: errFreshTask.goal,
							status: "failed",
							startedAt: errFreshTask.startedAt!,
							completedAt: errFreshTask.completedAt!,
							duration: Date.parse(errFreshTask.completedAt!) - Date.parse(errFreshTask.startedAt!),
							tasksCompleted: 0,
							tasksTotal: 0,
							summary: errFreshTask.error ?? "",
							engine: detectEngine(errFreshTask.engine) as string,
							inputTokens: 0,
							outputTokens: 0,
							costUsd: 0,
						});
					} catch (e) {
						log.warn("queue", `Failed to record history: ${e}`);
					}
				}

				// Auto-commit queue state after task failure
				try {
					const committed = atomicCommit(this.cwd, nextTask.id, `queue: ${nextTask.id} failed — ${nextTask.goal}`);
					if (committed && (nextTask.options.autoPush ?? options?.autoPush ?? false)) {
						gitPush(this.cwd);
					}
				} catch (e) {
					log.warn("queue", `Failed to auto-commit after task: ${e}`);
				}

				log.warn("queue", `${nextTask.id} error: ${err.message ?? String(err)}`);
			} finally {
				ctx.release();
			}
		}

		// Log summary
		const finalData = this.load();
		const total = finalData.tasks.length;
		const doneCount = finalData.tasks.filter(t => t.status === "done").length;
		const failedCount = finalData.tasks.filter(t => t.status === "failed").length;

		log.section("Queue Complete");
		log.info("queue", `Queue complete: ${doneCount} done, ${failedCount} failed out of ${total} total`);
	}

	// ─── Plan from natural language ──────────────────────────

	/**
	 * Preview: call LLM to parse a natural language description into PlannedTask[],
	 * WITHOUT modifying the queue. Allows inspection before committing.
	 */
	async planPreview(description: string): Promise<PlannedTask[]> {
		log.info("queue", "Parsing natural language into queue tasks...");

		const prompt = `You are a task planner. Parse the following natural language description into a list of independent build tasks for a software project queue.

Each task should have:
- "goal": a clear, specific description of what to build (include technical details from the input)
- "dependsOn": array of task references. Use "1", "2", etc. to reference by position (1-indexed). Use "all" if it depends on ALL previous tasks. Use empty array [] if no dependencies.
- "quick": boolean, true if this is a small/simple task that can skip brainstorming

Rules:
- Split logically: each task should be one coherent unit of work
- Infer dependencies from ordering words like "先/first", "然后/then", "最后/finally", "在...基础上/based on"
- If no ordering is mentioned, tasks are independent (no dependencies)
- Keep the original language and technical details in the goal
- Output ONLY valid JSON array, no markdown fences, no explanation

Example input: "先构建用户认证，然后加支付模块，最后写集成测试"
Example output:
[{"goal":"构建用户认证模块","dependsOn":[],"quick":false},{"goal":"添加支付模块","dependsOn":["1"],"quick":false},{"goal":"写集成测试","dependsOn":["all"],"quick":false}]

Now parse this:
${description}`;

		const result = await this.callClaude(prompt);

		// Parse JSON from LLM response
		let planned: PlannedTask[];
		try {
			// Try to extract JSON array from response (LLM might wrap in markdown)
			const jsonMatch = result.match(/\[[\s\S]*\]/);
			if (!jsonMatch) throw new Error("No JSON array found in response");
			planned = JSON.parse(jsonMatch[0]);
		} catch (e) {
			throw new Error(`Failed to parse LLM response as task list: ${e}\nRaw response: ${result.slice(0, 500)}`);
		}

		if (!Array.isArray(planned) || planned.length === 0) {
			throw new Error("LLM returned empty or invalid task list");
		}

		return planned;
	}

	/**
	 * Commit: take a PlannedTask[] array (from planPreview), resolve dependency
	 * references, and add each task to the queue.
	 */
	planCommit(
		planned: PlannedTask[],
		defaults?: { engine?: Engine; quick?: boolean; concurrency?: number; model?: string },
	): QueueTask[] {
		const added: QueueTask[] = [];
		const data = this.load();
		const firstId = this.nextId(data);

		for (let i = 0; i < planned.length; i++) {
			const p = planned[i];

			// Resolve dependency references
			let dependsOn: string[] | undefined;
			if (p.dependsOn && p.dependsOn.length > 0) {
				dependsOn = p.dependsOn.map(ref => {
					if (ref === "all") return "all";
					// Position reference (1-indexed) → actual queue ID
					const refIdx = parseInt(ref, 10);
					if (!isNaN(refIdx) && refIdx >= 1 && refIdx <= i) {
						return `q_${firstId + refIdx - 1}`;
					}
					// Already a q_N reference
					if (ref.startsWith("q_")) return ref;
					return ref;
				});
			}

			const task = this.add(
				p.goal,
				{
					quick: p.quick ?? defaults?.quick,
					concurrency: defaults?.concurrency,
					model: defaults?.model,
				},
				{
					engine: defaults?.engine,
					dependsOn,
				},
			);
			added.push(task);
		}

		return added;
	}

	/**
	 * Use LLM to parse a natural language description into structured queue tasks,
	 * then add them all to the queue with inferred dependencies.
	 *
	 * Backward-compatible wrapper: calls planPreview() then planCommit().
	 */
	async plan(
		description: string,
		defaults?: { engine?: Engine; quick?: boolean; concurrency?: number; model?: string },
	): Promise<QueueTask[]> {
		const planned = await this.planPreview(description);
		return this.planCommit(planned, defaults);
	}

	// ─── Call Claude CLI ─────────────────────────────────────

	private callClaude(prompt: string): Promise<string> {
		// Resolve claude CLI path (same logic as runner.ts)
		let claudeCmd: string;
		let baseArgs: string[];
		const claudeCliJs = path.join(
			process.env.APPDATA || "",
			"npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js",
		);

		if (process.platform === "win32" && fs.existsSync(claudeCliJs)) {
			claudeCmd = process.execPath;
			baseArgs = [claudeCliJs];
		} else {
			claudeCmd = "claude";
			baseArgs = [];
		}

		const args = [...baseArgs, "-p", "--output-format", "text"];

		return new Promise<string>((resolve, reject) => {
			const cleanEnv = { ...process.env };
			delete cleanEnv.CLAUDECODE;

			const child = spawn(claudeCmd, args, {
				cwd: this.cwd,
				env: cleanEnv,
				stdio: ["pipe", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
			child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

			child.stdin.write(prompt);
			child.stdin.end();

			child.on("close", (code) => {
				if (code === 0 && stdout.trim()) {
					resolve(stdout.trim());
				} else {
					reject(new Error(`claude -p exited with code ${code}: ${stderr.slice(0, 500)}`));
				}
			});
			child.on("error", (err) => reject(err));
		});
	}

	// ─── Private helpers ─────────────────────────────────────

	/** Generate next unique ID by finding max existing q_N and adding 1. */
	private nextId(data: QueueData): number {
		let max = 0;
		for (const t of data.tasks) {
			const m = t.id.match(/^q_(\d+)$/);
			if (m) {
				const n = parseInt(m[1], 10);
				if (n > max) max = n;
			}
		}
		return max + 1;
	}

	// ─── Private persistence ─────────────────────────────────

	private load(): QueueData {
		try {
			if (fs.existsSync(this.queuePath)) {
				const content = fs.readFileSync(this.queuePath, "utf-8");
				let parsed: any;
				try {
					parsed = JSON.parse(content);
				} catch (parseErr) {
					log.warn("queue", `QUEUE.json parse failed, resetting to empty: ${parseErr}`);
					const now = new Date().toISOString();
					return { tasks: [], createdAt: now, updatedAt: now };
				}
				if (parsed && Array.isArray(parsed.tasks)) {
					return parsed as QueueData;
				}
			}
		} catch {
			/* invalid file, return default */
		}

		const now = new Date().toISOString();
		return { tasks: [], createdAt: now, updatedAt: now };
	}

	/** Save without acquiring the file lock (caller must already hold it). */
	private saveInternal(data: QueueData): void {
		const dir = path.dirname(this.queuePath);
		fs.mkdirSync(dir, { recursive: true });
		data.updatedAt = new Date().toISOString();
		atomicWriteFileSync(this.queuePath, JSON.stringify(data, null, 2));
	}

	/** Save with file-lock protection (public entry point). */
	private save(data: QueueData): void {
		withFileLock(this.lockPath, () => {
			this.saveInternal(data);
		});
	}
}
