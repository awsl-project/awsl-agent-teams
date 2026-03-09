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
import { acquireLock, releaseLock, forceReleaseLock } from "./lock.js";
import { log } from "./log.js";
import { appendHistory } from "./history.js";

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
	options: {
		model?: string;
		concurrency?: number;
		quick?: boolean;
		agentsDirs?: string[];
		autoCommit?: boolean;
		verify?: boolean;
		replan?: boolean;
	};
	status: "pending" | "running" | "done" | "failed" | "paused";
	scheduledAt?: string;
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

	constructor(cwd: string) {
		this.cwd = cwd;
		this.queuePath = path.join(cwd, ".planning", "QUEUE.json");
	}

	/**
	 * Add a new task to the queue.
	 */
	add(goal: string, options?: QueueTask["options"], extra?: { engine?: Engine; dependsOn?: string[] }): QueueTask {
		const data = this.load();
		const id = `q_${data.tasks.length + 1}`;
		const task: QueueTask = {
			id,
			goal,
			options: options ?? {},
			status: "pending",
			scheduledAt: new Date().toISOString(),
		};
		if (extra?.engine) task.engine = extra.engine;
		if (extra?.dependsOn) task.dependsOn = extra.dependsOn;
		data.tasks.push(task);
		this.save(data);
		return task;
	}

	/**
	 * Remove a task by ID.
	 */
	remove(id: string): boolean {
		const data = this.load();
		const idx = data.tasks.findIndex(t => t.id === id);
		if (idx === -1) return false;
		data.tasks.splice(idx, 1);
		this.save(data);
		return true;
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
		try {
			if (fs.existsSync(this.queuePath)) {
				fs.unlinkSync(this.queuePath);
			}
		} catch {
			/* ignore */
		}
	}

	/**
	 * Get a single task by ID.
	 */
	get(id: string): QueueTask | undefined {
		return this.load().tasks.find(t => t.id === id);
	}

	/**
	 * Main daemon loop — execute pending tasks sequentially.
	 */
	async start(defaultEngine?: Engine): Promise<void> {
		log.section("Queue: Starting task execution");

		while (true) {
			const data = this.load();

			// Find next runnable pending task
			const nextTask = data.tasks.find((task, idx) => {
				if (task.status !== "pending") return false;

				// Check dependency constraints
				if (task.dependsOn && task.dependsOn.length > 0) {
					for (const dep of task.dependsOn) {
						if (dep === "all") {
							// All previous tasks must be done
							const allPriorDone = data.tasks
								.slice(0, idx)
								.every(t => t.status === "done");
							if (!allPriorDone) return false;
						} else {
							// Specific dependency must be done
							const depTask = data.tasks.find(t => t.id === dep);
							if (!depTask || depTask.status !== "done") return false;
						}
					}
				}

				return true;
			});

			if (!nextTask) {
				// No runnable task — we're done
				break;
			}

			// Mark as running
			nextTask.status = "running";
			nextTask.startedAt = new Date().toISOString();
			this.save(data);

			log.section(`Queue: Executing ${nextTask.id}`);
			log.info("queue", `Goal: ${nextTask.goal}`);

			let lockAcquired = false;
			try {
				// Acquire lock (force to override stale locks)
				forceReleaseLock(this.cwd);
				const lockResult = acquireLock(this.cwd, `queue:${nextTask.id}`);
				lockAcquired = lockResult.acquired;
				if (!lockAcquired) {
					log.warn("queue", `Could not acquire lock for ${nextTask.id}, forcing...`);
					forceReleaseLock(this.cwd);
					const retry = acquireLock(this.cwd, `queue:${nextTask.id}`);
					lockAcquired = retry.acquired;
				}

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

				// Build execute options
				const execOptions: ExecuteOptions = {
					brainstorm: !nextTask.options.quick,
					research: !nextTask.options.quick,
					verify: nextTask.options.verify ?? true,
					autoCommit: nextTask.options.autoCommit ?? true,
					replan: nextTask.options.replan ?? true,
					qualityGate: true,
					engine,
					// These fields will be available once task_3 is complete:
					// maxRateLimitRetries: 20,
					// resumeFromCheckpoint: true,
				};

				// Execute team
				const teamResult = await executeTeam(
					nextTask.goal,
					agents,
					this.cwd,
					model,
					concurrency,
					execOptions,
				);

				// Reload data in case it changed during execution
				const freshData = this.load();
				const freshTask = freshData.tasks.find(t => t.id === nextTask.id);
				if (freshTask) {
					freshTask.status = teamResult.success ? "done" : "failed";
					freshTask.completedAt = new Date().toISOString();
					freshTask.result = {
						success: teamResult.success,
						summary: teamResult.summary,
					};
					if (!teamResult.success) {
						freshTask.error = teamResult.summary;
					}
					this.save(freshData);

					// Record history entry
					try {
						const tasksCompletedMatch = teamResult.summary.match(/(\d+)\/\d+ tasks/);
						const tasksTotalMatch = teamResult.summary.match(/\d+\/(\d+) tasks/);
						appendHistory(this.cwd, {
							date: new Date().toISOString(),
							project: path.basename(this.cwd),
							projectPath: this.cwd,
							queueTaskId: freshTask.id,
							goal: freshTask.goal,
							status: freshTask.status as "done" | "failed",
							startedAt: freshTask.startedAt!,
							completedAt: freshTask.completedAt!,
							duration: Date.parse(freshTask.completedAt!) - Date.parse(freshTask.startedAt!),
							tasksCompleted: tasksCompletedMatch ? parseInt(tasksCompletedMatch[1], 10) : 0,
							tasksTotal: tasksTotalMatch ? parseInt(tasksTotalMatch[1], 10) : 0,
							summary: freshTask.result?.summary ?? "",
							engine: detectEngine(freshTask.engine) as string,
						});
					} catch (e) {
						log.warn("queue", `Failed to record history: ${e}`);
					}
				}

				log.info("queue", `${nextTask.id}: ${teamResult.success ? "done" : "failed"} — ${teamResult.summary}`);
			} catch (err: any) {
				// Mark as failed on error
				const freshData = this.load();
				const freshTask = freshData.tasks.find(t => t.id === nextTask.id);
				if (freshTask) {
					freshTask.status = "failed";
					freshTask.completedAt = new Date().toISOString();
					freshTask.error = err.message ?? String(err);
					this.save(freshData);

					// Record history entry for failure
					try {
						appendHistory(this.cwd, {
							date: new Date().toISOString(),
							project: path.basename(this.cwd),
							projectPath: this.cwd,
							queueTaskId: freshTask.id,
							goal: freshTask.goal,
							status: "failed",
							startedAt: freshTask.startedAt!,
							completedAt: freshTask.completedAt!,
							duration: Date.parse(freshTask.completedAt!) - Date.parse(freshTask.startedAt!),
							tasksCompleted: 0,
							tasksTotal: 0,
							summary: freshTask.error ?? "",
							engine: detectEngine(freshTask.engine) as string,
						});
					} catch (e) {
						log.warn("queue", `Failed to record history: ${e}`);
					}
				}

				log.warn("queue", `${nextTask.id} error: ${err.message ?? String(err)}`);
			} finally {
				// Always release lock
				if (lockAcquired) {
					releaseLock(this.cwd);
				}
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
	 * Use LLM to parse a natural language description into structured queue tasks,
	 * then add them all to the queue with inferred dependencies.
	 *
	 * Example input: "先构建用户认证，然后加支付模块，最后写集成测试"
	 * Result: 3 tasks with q_1 → q_2 → q_3 dependency chain.
	 */
	async plan(
		description: string,
		defaults?: { engine?: Engine; quick?: boolean; concurrency?: number; model?: string },
	): Promise<QueueTask[]> {
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

		// Add tasks to queue, mapping position references to actual IDs
		const added: QueueTask[] = [];
		const data = this.load();
		const baseIndex = data.tasks.length; // offset for existing tasks

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
						return `q_${baseIndex + refIdx}`;
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

	// ─── Private persistence ─────────────────────────────────

	private load(): QueueData {
		try {
			if (fs.existsSync(this.queuePath)) {
				const content = fs.readFileSync(this.queuePath, "utf-8");
				const parsed = JSON.parse(content);
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

	private save(data: QueueData): void {
		const dir = path.dirname(this.queuePath);
		fs.mkdirSync(dir, { recursive: true });
		data.updatedAt = new Date().toISOString();
		fs.writeFileSync(this.queuePath, JSON.stringify(data, null, 2), "utf-8");
	}
}
