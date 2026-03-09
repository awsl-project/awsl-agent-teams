/**
 * AWSL Agent runner — dual engine support.
 *
 * Engine "claude-code":
 *   Spawns `claude -p` subprocess per task — full Claude Code power
 *   (built-in tools, compaction, context management, all permissions)
 *
 * Engine "builtin":
 *   Uses pi-agent-core Agent class in-process — works with any LLM provider
 *   (custom tools, lightweight, multi-provider via pi-ai)
 *
 * Default: claude-code (if `claude` CLI is available), else builtin.
 */

import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Agent, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type { TeamAgentDef } from "./agents.js";
import type { SharedMemory } from "./memory.js";
import { createAgentTools } from "./tools.js";
import { SkillRegistry } from "./skills.js";
import { log } from "./log.js";

export type Engine = "claude-code" | "builtin";

export interface RunResult {
	agent: string;
	status: "done" | "failed" | "blocked" | "no_report" | "rate_limited";
	result: string;
	turns: number;
	error?: string;
}

// ─── Rate Limit Detection ────────────────────────────────────

const RATE_LIMIT_PATTERNS = [
	/rate limit/i,
	/rate_limit/i,
	/too many requests/i,
	/quota exceeded/i,
	/overloaded/i,
	/token limit/i,
	/429/,
	/capacity/i,
	/throttl/i,
];

export function isRateLimitError(text: string): boolean {
	return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(text));
}

// ─── Engine Detection ────────────────────────────────────────

let _claudeAvailable: boolean | null = null;

function isClaudeAvailable(): boolean {
	if (_claudeAvailable !== null) return _claudeAvailable;
	try {
		execSync("claude --version", { stdio: "pipe", timeout: 5000, shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh" });
		_claudeAvailable = true;
	} catch {
		_claudeAvailable = false;
	}
	return _claudeAvailable;
}

export function detectEngine(preferred?: Engine): Engine {
	if (preferred) return preferred;
	return isClaudeAvailable() ? "claude-code" : "builtin";
}

// ─── Claude Code Engine ──────────────────────────────────────

async function runWithClaudeCode(
	agentDef: TeamAgentDef,
	task: string,
	cwd: string,
	memory: SharedMemory,
	teamRoster: string,
	skillRegistry?: SkillRegistry,
): Promise<RunResult> {
	const skills = skillRegistry ?? new SkillRegistry();
	const skillInstructions = skills.buildInstructions(agentDef.role, agentDef.skills);
	const memSummary = memory.getSummary();

	// Build system prompt for Claude Code
	const systemPrompt = `# Agent: ${agentDef.name} (${agentDef.role})

${agentDef.systemPrompt}
${skillInstructions}

## Team Context
${teamRoster}

## Shared Memory
${memSummary === "(empty)" ? "No shared data yet." : memSummary}

## Instructions
- Complete the task below
- At the end, output a section "## AWSL_RESULT" with your final deliverable summary
- If you produced files, list them
- If you ran tests, include the results`;

	// Build allowed tools based on agent def
	const toolMap: Record<string, string> = {
		read: "Read",
		write: "Write",
		edit: "Edit",
		bash: "Bash",
	};
	const allowedTools = agentDef.tools
		? agentDef.tools.map(t => toolMap[t]).filter(Boolean)
		: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"];

	// Resolve claude CLI path — on Windows, claude is a .cmd wrapper;
	// to avoid shell: true (which mangles multiline args), invoke node directly
	let claudeCmd: string;
	let baseArgs: string[];
	const claudeCliJs = path.join(process.env.APPDATA || "", "npm", "node_modules", "@anthropic-ai", "claude-code", "cli.js");

	if (process.platform === "win32" && fs.existsSync(claudeCliJs)) {
		claudeCmd = process.execPath; // node.exe
		baseArgs = [claudeCliJs];
	} else {
		claudeCmd = "claude";
		baseArgs = [];
	}

	const args = [
		...baseArgs,
		"-p",
		"--output-format", "json",
		"--append-system-prompt", systemPrompt,
		"--allowedTools", allowedTools.join(","),
	];

	// Use model if specified on agent
	if (agentDef.model) {
		const modelId = agentDef.model.includes(":") ? agentDef.model.split(":")[1] : agentDef.model;
		args.push("--model", modelId);
	}

	log.info(agentDef.name, `Starting... (engine: claude-code)`);

	return new Promise<RunResult>((resolve) => {
		const cleanEnv = { ...process.env };
		delete cleanEnv.CLAUDECODE;

		const child = spawn(claudeCmd, args, {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: cleanEnv,
			// No shell: true — avoid cmd.exe mangling multiline arguments
		});

		// Send prompt via stdin to avoid cmd.exe mangling multiline args
		child.stdin.write(task);
		child.stdin.end();

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
		child.stderr.on("data", (data: Buffer) => {
			const chunk = data.toString();
			stderr += chunk;
			process.stderr.write(chunk);
		});

		child.on("close", (code) => {
			// Check for rate limiting before parsing response
			if (code !== 0 && isRateLimitError(stderr + stdout)) {
				log.warn(agentDef.name, `Rate limited (exit: ${code})`);
				resolve({
					agent: agentDef.name,
					status: "rate_limited",
					result: "",
					turns: 0,
					error: (stderr + stdout).slice(0, 500),
				});
				return;
			}

			// Parse JSON response
			try {
				const response = JSON.parse(stdout);
				const result = response.result ?? stdout;
				const sessionId = response.session_id ?? "";

				// Store result in shared memory
				memory.set(`result:${agentDef.name}:session`, sessionId, agentDef.name);

				log.info(agentDef.name, `Done (claude-code, exit: ${code})`);
				resolve({
					agent: agentDef.name,
					status: code === 0 ? "done" : "failed",
					result,
					turns: response.num_turns ?? 1,
					error: code !== 0 ? `Exit code ${code}` : undefined,
				});
			} catch {
				// Non-JSON output — use raw stdout
				const result = stdout.trim() || stderr.trim();
				resolve({
					agent: agentDef.name,
					status: code === 0 ? "done" : "failed",
					result,
					turns: 1,
					error: code !== 0 ? `Exit code ${code}: ${stderr.slice(0, 200)}` : undefined,
				});
			}
		});

		child.on("error", (err) => {
			if (isRateLimitError(err.message)) {
				log.warn(agentDef.name, `Rate limited (spawn error)`);
				resolve({
					agent: agentDef.name,
					status: "rate_limited",
					result: "",
					turns: 0,
					error: err.message,
				});
				return;
			}
			resolve({
				agent: agentDef.name,
				status: "failed",
				result: "",
				turns: 0,
				error: `Spawn error: ${err.message}`,
			});
		});
	});
}

// ─── Built-in Engine (pi-agent-core) ─────────────────────────

function parseModel(modelStr: string): [string, string] {
	const idx = modelStr.indexOf(":");
	if (idx === -1) return ["anthropic", modelStr];
	return [modelStr.slice(0, idx), modelStr.slice(idx + 1)];
}

async function runWithBuiltin(
	agentDef: TeamAgentDef,
	task: string,
	cwd: string,
	memory: SharedMemory,
	teamRoster: string,
	defaultModel: string,
	maxTurns: number,
	skillRegistry?: SkillRegistry,
): Promise<RunResult> {
	const modelStr = agentDef.model ?? defaultModel;
	const [provider, modelId] = parseModel(modelStr);
	const model = getModel(provider as any, modelId);

	const reportBox: { value: { status: string; result: string } | null } = { value: null };
	const onReport = (status: string, result: string) => {
		reportBox.value = { status, result };
	};

	const tools = createAgentTools(agentDef.name, cwd, memory, onReport, agentDef.tools);

	const skills = skillRegistry ?? new SkillRegistry();
	const skillInstructions = skills.buildInstructions(agentDef.role, agentDef.skills);
	const memSummary = memory.getSummary();

	const systemPrompt = `# Agent: ${agentDef.name} (${agentDef.role})

${agentDef.systemPrompt}
${skillInstructions}

## Team Roster
${teamRoster}

## Shared Memory
${memSummary === "(empty)" ? "No shared data yet." : memSummary}

## Protocol
- Use memory_read/memory_list to check what other agents have produced
- Use memory_write to store your outputs for other agents
- Use send_message to communicate directly with teammates
- Call "report" tool when you are done with your task`;

	const thinkingLevel = (agentDef.thinkingLevel ?? "medium") as any;
	const agent = new Agent({
		initialState: { systemPrompt, model, thinkingLevel, tools },
	});

	let turns = 0;
	const unsub = agent.subscribe((event: AgentEvent) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			process.stderr.write(event.assistantMessageEvent.delta);
		}
		if (event.type === "turn_end") {
			turns++;
			if (turns >= maxTurns) {
				log.warn(agentDef.name, `Max turns (${maxTurns}) reached, aborting`);
				agent.abort();
			}
		}
		if (event.type === "tool_execution_start") {
			log.debug(agentDef.name, `${event.toolName}(${JSON.stringify(event.args).slice(0, 80)})`);
		}
	});

	log.info(agentDef.name, `Starting... (engine: builtin, model: ${modelStr})`);

	try {
		await agent.prompt(task);
	} catch (e: any) {
		unsub();
		return { agent: agentDef.name, status: "failed", result: "", turns, error: e.message ?? String(e) };
	}

	unsub();
	process.stderr.write("\n");

	if (reportBox.value) {
		const rpt = reportBox.value;
		log.info(agentDef.name, `Done (${rpt.status})`);
		return { agent: agentDef.name, status: rpt.status as RunResult["status"], result: rpt.result, turns };
	}

	const messages = agent.state.messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant" && "content" in msg) {
			const textParts = (msg.content as any[]).filter((c: any) => c.type === "text");
			if (textParts.length > 0) {
				const text = textParts.map((c: any) => c.text).join("\n");
				log.info(agentDef.name, "Done (no report tool, using last output)");
				return { agent: agentDef.name, status: "no_report", result: text, turns };
			}
		}
	}

	return { agent: agentDef.name, status: "failed", result: "", turns, error: "No output" };
}

// ─── Public API ──────────────────────────────────────────────

export async function runAgent(
	agentDef: TeamAgentDef,
	task: string,
	cwd: string,
	memory: SharedMemory,
	teamRoster: string,
	defaultModel: string,
	maxTurns = 30,
	skillRegistry?: SkillRegistry,
	engine?: Engine,
): Promise<RunResult> {
	const resolved = detectEngine(engine);

	if (resolved === "claude-code") {
		return runWithClaudeCode(agentDef, task, cwd, memory, teamRoster, skillRegistry);
	}
	return runWithBuiltin(agentDef, task, cwd, memory, teamRoster, defaultModel, maxTurns, skillRegistry);
}

/**
 * Run agents in parallel with concurrency limit.
 */
export async function runParallel<T>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<RunResult>,
): Promise<RunResult[]> {
	const results: RunResult[] = new Array(items.length);
	let next = 0;

	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (true) {
			const i = next++;
			if (i >= items.length) return;
			results[i] = await fn(items[i]);
		}
	});

	await Promise.all(workers);
	return results;
}
