/**
 * AWSL Agent runner — multi-engine support.
 *
 * Engine "claude-code":
 *   Spawns `claude -p` subprocess per task — full Claude Code power
 *   (built-in tools, compaction, context management, all permissions)
 *
 * Engine "codex":
 *   Spawns `codex exec` subprocess per task — full Codex CLI power
 *   (tools, sandbox, non-interactive execution)
 *
 * Engine "builtin":
 *   Uses pi-agent-core Agent class in-process — works with any LLM provider
 *   (custom tools, lightweight, multi-provider via pi-ai)
 *
 * Default: claude-code (if `claude` CLI is available), else builtin.
 */

import { execSync, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Agent, type AgentEvent, type AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { type TeamAgentDef, resolveEnvValue } from "./agents.js";
import type { SharedMemory } from "./memory.js";
import { createAgentTools } from "./tools.js";
import { SkillRegistry } from "./skills.js";
import type { SandboxPolicy } from "./sandbox.js";
import { defaultPolicy } from "./sandbox.js";
import { log } from "./log.js";
import { getLogStream } from "./logstream.js";

export type Engine = "claude-code" | "codex" | "builtin";

export interface RunResult {
	agent: string;
	status: "done" | "failed" | "blocked" | "no_report" | "rate_limited" | "timeout";
	result: string;
	turns: number;
	error?: string;
	inputTokens?: number;
	outputTokens?: number;
	costUsd?: number;
}

interface CodexJsonEvent {
	type?: string;
	thread_id?: string;
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
	};
	// item.file_edit fields
	filename?: string;
	// item.command_execution fields
	command?: string;
	// item.agent_message fields
	content?: string;
}

function resolveCodexCliJs(): string | null {
	const candidates = [
		path.join(process.env.APPDATA || "", "npm", "node_modules", "@openai", "codex", "bin", "codex.js"),
		path.join(path.dirname(process.execPath), "node_modules", "@openai", "codex", "bin", "codex.js"),
		path.join(path.dirname(process.execPath), "..", "node_modules", "@openai", "codex", "bin", "codex.js"),
	];
	for (const p of candidates) {
		if (p && fs.existsSync(p)) return p;
	}
	return null;
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

// ─── Codex Engine ───────────────────────────────────────────

/** Extract ## AWSL_RESULT section from agent output, or return full text. */
function extractAwslResult(text: string): string {
	const marker = "## AWSL_RESULT";
	const idx = text.indexOf(marker);
	if (idx === -1) return text;
	const afterMarker = text.slice(idx + marker.length);
	// Find next ## heading or end of text
	const nextHeading = afterMarker.search(/\n## /);
	const body = nextHeading === -1 ? afterMarker : afterMarker.slice(0, nextHeading);
	return body.trim();
}

/** Map agent role to Codex sandbox mode. */
function codexSandboxMode(role: string): "read-only" | "workspace-write" {
	switch (role) {
		case "reviewer":
		case "tester":
			return "read-only";
		default:
			return "workspace-write";
	}
}

async function runWithCodex(
	agentDef: TeamAgentDef,
	task: string,
	cwd: string,
	memory: SharedMemory,
	teamRoster: string,
	skillRegistry?: SkillRegistry,
	taskId?: string,
	resumeSessionId?: string,
): Promise<RunResult> {
	const skills = skillRegistry ?? new SkillRegistry();
	const skillInstructions = skills.buildInstructions(agentDef.role, agentDef.skills);
	const memSummary = memory.getSummary();

	const prompt = `# Agent: ${agentDef.name} (${agentDef.role})

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
- If you ran tests, include the results

## Task
${task}`;

	let codexCmd: string;
	let baseArgs: string[];
	const codexCliJs = resolveCodexCliJs();

	if (process.platform === "win32" && codexCliJs) {
		codexCmd = process.execPath; // node.exe
		baseArgs = [codexCliJs];
	} else {
		codexCmd = "codex";
		baseArgs = [];
	}

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "awsl-codex-"));
	const lastMessagePath = path.join(tmpDir, "last-message.txt");

	const sandboxMode = codexSandboxMode(agentDef.role);
	const isResume = !!resumeSessionId;
	const args: string[] = [...baseArgs];

	if (isResume) {
		// Resume mode: codex exec resume <sessionId> -
		args.push("exec", "--json", "--full-auto", "--sandbox", sandboxMode,
			"--output-last-message", lastMessagePath,
			"resume", resumeSessionId);
	} else {
		// Normal mode: codex exec --ephemeral ...
		args.push("exec", "--json", "--ephemeral", "--full-auto", "--sandbox", sandboxMode,
			"--output-last-message", lastMessagePath);
	}

	// Use model if specified on agent
	if (agentDef.model) {
		const modelId = agentDef.model.includes(":") ? agentDef.model.split(":")[1] : agentDef.model;
		args.push("--model", modelId);
	}

	// Read prompt from stdin for robust multiline handling
	args.push("-");

	log.info(agentDef.name, `Starting... (engine: codex)`);

	// Timeout configuration
	const STARTUP_TIMEOUT_MS = 60 * 1000;       // 60s: no output at all → startup failed
	const IDLE_TIMEOUT_MS = 5 * 60 * 1000;       // 5min: no new output → agent stuck
	const AGENT_TIMEOUT_MS = 30 * 60 * 1000;     // 30min: absolute hard cap

	// Per-agent API key / base URL override
	const cleanEnv = { ...process.env };
	const resolvedApiKey = resolveEnvValue(agentDef.apiKey);
	const resolvedBaseUrl = resolveEnvValue(agentDef.baseUrl);
	if (resolvedApiKey) {
		cleanEnv.CODEX_API_KEY = resolvedApiKey;
		cleanEnv.OPENAI_API_KEY = resolvedApiKey;
	}
	if (resolvedBaseUrl) {
		cleanEnv.OPENAI_BASE_URL = resolvedBaseUrl;
	}

	return new Promise<RunResult>((resolve) => {
		const child = spawn(codexCmd, args, {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: cleanEnv,
		});

		let hasOutput = false;
		let killed = false;
		let killReason = "";

		const killAgent = (reason: string) => {
			if (killed) return;
			killed = true;
			killReason = reason;
			log.warn(agentDef.name, reason);
			child.kill("SIGTERM");
			setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already dead */ } }, 5000);
		};

		// Hard timeout: absolute 30min cap
		const agentTimer = setTimeout(() => {
			killAgent(`Hard timeout after ${AGENT_TIMEOUT_MS / 60000}min — killing agent`);
		}, AGENT_TIMEOUT_MS);

		// Startup timeout: 60s to produce any output
		const startupTimer = setTimeout(() => {
			if (!hasOutput) {
				killAgent(`Startup timeout: no output after ${STARTUP_TIMEOUT_MS / 1000}s — codex likely failed to start`);
			}
		}, STARTUP_TIMEOUT_MS);

		// Idle heartbeat: reset on every output chunk, fires after 5min of silence
		let idleTimer: ReturnType<typeof setTimeout> | null = null;
		const resetIdleTimer = () => {
			if (idleTimer) clearTimeout(idleTimer);
			idleTimer = setTimeout(() => {
				killAgent(`Idle timeout: no output for ${IDLE_TIMEOUT_MS / 60000}min — agent appears stuck`);
			}, IDLE_TIMEOUT_MS);
		};

		const onOutput = () => {
			if (!hasOutput) {
				hasOutput = true;
				clearTimeout(startupTimer);
			}
			resetIdleTimer();
		};

		child.stdin.write(prompt);
		child.stdin.end();

		let stdout = "";
		let stderr = "";
		let sessionId = "";
		let inputTokens = 0;
		let outputTokens = 0;
		let turns = 0;
		let stdoutLineBuffer = "";
		let stderrLineBuffer = "";

		const logStream = getLogStream();
		const logTaskId = taskId ?? agentDef.name;

		const parseJsonEvent = (line: string) => {
			const trimmed = line.trim();
			if (!trimmed) return;
			try {
				const event = JSON.parse(trimmed) as CodexJsonEvent;
				if (event.type === "thread.started" && event.thread_id) {
					sessionId = event.thread_id;
				}
				if (event.type === "turn.completed") {
					turns++;
					inputTokens += event.usage?.input_tokens ?? 0;
					outputTokens += event.usage?.output_tokens ?? 0;
				}
				// Rich progress events for dashboard
				if (event.type === "item.file_edit" && event.filename) {
					logStream.push({ timestamp: new Date().toISOString(), taskId: logTaskId, agent: agentDef.name, stream: "event", text: `[file_edit] ${event.filename}` });
				}
				if (event.type === "item.command_execution" && event.command) {
					logStream.push({ timestamp: new Date().toISOString(), taskId: logTaskId, agent: agentDef.name, stream: "event", text: `[command] ${event.command.slice(0, 200)}` });
				}
				if (event.type === "item.agent_message" && event.content) {
					logStream.push({ timestamp: new Date().toISOString(), taskId: logTaskId, agent: agentDef.name, stream: "event", text: `[message] ${event.content.slice(0, 200)}` });
				}
			} catch {
				// ignore non-JSON lines
			}
		};

		child.stdout.on("data", (data: Buffer) => {
			onOutput();
			const chunk = data.toString();
			stdout += chunk;
			stdoutLineBuffer += chunk;
			const lines = stdoutLineBuffer.split("\n");
			stdoutLineBuffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				logStream.push({ timestamp: new Date().toISOString(), taskId: logTaskId, agent: agentDef.name, stream: "stdout", text: line });
				parseJsonEvent(line);
			}
		});

		child.stderr.on("data", (data: Buffer) => {
			onOutput();
			const chunk = data.toString();
			stderr += chunk;
			process.stderr.write(chunk);
			stderrLineBuffer += chunk;
			const lines = stderrLineBuffer.split("\n");
			stderrLineBuffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				logStream.push({ timestamp: new Date().toISOString(), taskId: logTaskId, agent: agentDef.name, stream: "stderr", text: line });
			}
		});

		const cleanupTmp = () => {
			try { if (fs.existsSync(lastMessagePath)) fs.unlinkSync(lastMessagePath); } catch { /* ignore */ }
			try { if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir); } catch { /* ignore */ }
		};

		child.on("close", (code) => {
			clearTimeout(agentTimer);
			clearTimeout(startupTimer);
			if (idleTimer) clearTimeout(idleTimer);

			if (stdoutLineBuffer.trim()) {
				logStream.push({ timestamp: new Date().toISOString(), taskId: logTaskId, agent: agentDef.name, stream: "stdout", text: stdoutLineBuffer });
				parseJsonEvent(stdoutLineBuffer);
			}
			if (stderrLineBuffer.trim()) {
				logStream.push({ timestamp: new Date().toISOString(), taskId: logTaskId, agent: agentDef.name, stream: "stderr", text: stderrLineBuffer });
			}

			// Treat timeout/kill as an error
			if (code === null || killed) {
				cleanupTmp();
				resolve({
					agent: agentDef.name,
					status: "timeout",
					result: "",
					turns: turns || 0,
					error: killReason || `Agent timed out after ${AGENT_TIMEOUT_MS / 60000} minutes`,
					inputTokens,
					outputTokens,
					costUsd: 0,
				});
				return;
			}

			const combined = stderr + stdout;

			// Resume failed — fallback to fresh execution
			if (isResume && code !== 0 && /session.*(not found|expired|invalid)/i.test(combined)) {
				log.warn(agentDef.name, "Session resume failed, retrying without resume");
				cleanupTmp();
				resolve(runWithCodex(agentDef, task, cwd, memory, teamRoster, skillRegistry, taskId));
				return;
			}

			if (code !== 0 && isRateLimitError(combined)) {
				log.warn(agentDef.name, `Rate limited (exit: ${code})`);
				cleanupTmp();
				resolve({
					agent: agentDef.name,
					status: "rate_limited",
					result: "",
					turns: turns || 0,
					error: combined.slice(0, 500),
					inputTokens,
					outputTokens,
					costUsd: 0,
				});
				return;
			}

			let result = "";
			try {
				if (fs.existsSync(lastMessagePath)) {
					result = fs.readFileSync(lastMessagePath, "utf-8").trim();
				}
			} catch {
				// fall back to stdout
			}

			if (!result) {
				result = stdout.trim() || stderr.trim();
			}

			// Extract structured AWSL_RESULT section if present
			result = extractAwslResult(result);

			if (sessionId) {
				memory.set(`result:${agentDef.name}:session`, sessionId, agentDef.name);
			}

			log.info(agentDef.name, `Done (codex, exit: ${code})`);
			cleanupTmp();
			resolve({
				agent: agentDef.name,
				status: code === 0 ? "done" : "failed",
				result,
				turns: turns || 1,
				error: code !== 0 ? `Exit code ${code}: ${(stderr || stdout).slice(0, 200)}` : undefined,
				inputTokens,
				outputTokens,
				costUsd: 0,
			});
		});

		child.on("error", (err) => {
			clearTimeout(agentTimer);
			clearTimeout(startupTimer);
			if (idleTimer) clearTimeout(idleTimer);
			cleanupTmp();
			if (isRateLimitError(err.message)) {
				log.warn(agentDef.name, "Rate limited (spawn error)");
				resolve({
					agent: agentDef.name,
					status: "rate_limited",
					result: "",
					turns: 0,
					error: err.message,
					inputTokens: 0,
					outputTokens: 0,
					costUsd: 0,
				});
				return;
			}
			resolve({
				agent: agentDef.name,
				status: "failed",
				result: "",
				turns: 0,
				error: `Spawn error: ${err.message}`,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
			});
		});
	});
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

let _codexAvailable: boolean | null = null;

function isCodexAvailable(): boolean {
	if (_codexAvailable !== null) return _codexAvailable;
	// Check CLI first
	try {
		execSync("codex --version", { stdio: "pipe", timeout: 5000, shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh" });
		_codexAvailable = true;
		return true;
	} catch { /* not in PATH */ }
	// Windows: check via resolved node_modules path
	if (resolveCodexCliJs()) {
		_codexAvailable = true;
		return true;
	}
	_codexAvailable = false;
	return false;
}

export function detectEngine(preferred?: Engine): Engine {
	if (preferred) return preferred;
	if (isClaudeAvailable()) return "claude-code";
	if (isCodexAvailable()) return "codex";
	return "builtin";
}

// ─── Claude Code Engine ──────────────────────────────────────

async function runWithClaudeCode(
	agentDef: TeamAgentDef,
	task: string,
	cwd: string,
	memory: SharedMemory,
	teamRoster: string,
	skillRegistry?: SkillRegistry,
	taskId?: string,
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
		grep: "Grep",
		glob: "Glob",
		agent: "Agent",
	};
	const allowedTools = agentDef.tools
		? agentDef.tools.map(t => toolMap[t.toLowerCase()] ?? t).filter(Boolean)
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

	// Agent-level timeout: 30 minutes per agent (prevents hung bash commands from blocking queue)
	const AGENT_TIMEOUT_MS = 30 * 60 * 1000;

	return new Promise<RunResult>((resolve) => {
		const cleanEnv = { ...process.env };
		delete cleanEnv.CLAUDECODE;

		// Per-agent provider override (e.g. route to GLM's Anthropic-compatible API)
		const resolvedBaseUrl = resolveEnvValue(agentDef.baseUrl);
		const resolvedApiKey = resolveEnvValue(agentDef.apiKey);
		if (resolvedBaseUrl) cleanEnv.ANTHROPIC_BASE_URL = resolvedBaseUrl;
		if (resolvedApiKey) cleanEnv.ANTHROPIC_API_KEY = resolvedApiKey;

		const child = spawn(claudeCmd, args, {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			env: cleanEnv,
			// No shell: true — avoid cmd.exe mangling multiline arguments
		});

		// Kill agent if it exceeds timeout
		const agentTimer = setTimeout(() => {
			log.warn(agentDef.name, `Timeout after ${AGENT_TIMEOUT_MS / 60000}min — killing agent`);
			child.kill("SIGTERM");
			setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already dead */ } }, 5000);
		}, AGENT_TIMEOUT_MS);

		// Send prompt via stdin to avoid cmd.exe mangling multiline args
		child.stdin.write(task);
		child.stdin.end();

		let stdout = "";
		let stderr = "";
		const logStream = getLogStream();
		const logTaskId = taskId ?? agentDef.name;

		child.stdout.on("data", (data: Buffer) => {
			const chunk = data.toString();
			stdout += chunk;
			for (const line of chunk.split("\n")) {
				if (line.trim()) {
					logStream.push({ timestamp: new Date().toISOString(), taskId: logTaskId, agent: agentDef.name, stream: "stdout", text: line });
				}
			}
		});
		child.stderr.on("data", (data: Buffer) => {
			const chunk = data.toString();
			stderr += chunk;
			process.stderr.write(chunk);
			for (const line of chunk.split("\n")) {
				if (line.trim()) {
					logStream.push({ timestamp: new Date().toISOString(), taskId: logTaskId, agent: agentDef.name, stream: "stderr", text: line });
				}
			}
		});

		child.on("close", (code) => {
			clearTimeout(agentTimer);

			// Treat timeout kill as an error
			if (code === null || (code !== 0 && !stdout.trim())) {
				const isTimeout = code === null;
				if (isTimeout) {
					resolve({
						agent: agentDef.name,
						status: "timeout",
						result: "",
						turns: 0,
						error: `Agent timed out after ${AGENT_TIMEOUT_MS / 60000} minutes`,
						inputTokens: 0,
						outputTokens: 0,
						costUsd: 0,
					});
					return;
				}
			}

			// Check for rate limiting before parsing response
			if (code !== 0 && isRateLimitError(stderr + stdout)) {
				log.warn(agentDef.name, `Rate limited (exit: ${code})`);
				resolve({
					agent: agentDef.name,
					status: "rate_limited",
					result: "",
					turns: 0,
					error: (stderr + stdout).slice(0, 500),
					inputTokens: 0,
					outputTokens: 0,
					costUsd: 0,
				});
				return;
			}

			// Parse JSON response
			try {
				const response = JSON.parse(stdout);
				const result = response.result ?? stdout;
				const sessionId = response.session_id ?? "";

				// Extract token usage
				const usage = response.usage ?? {};
				const inputTokens = usage.input_tokens ?? 0;
				const outputTokens = usage.output_tokens ?? 0;
				const costUsd = response.cost_usd ?? response.total_cost_usd ?? 0;

				// Store result in shared memory
				memory.set(`result:${agentDef.name}:session`, sessionId, agentDef.name);

				log.info(agentDef.name, `Done (claude-code, exit: ${code})`);
				resolve({
					agent: agentDef.name,
					status: code === 0 ? "done" : "failed",
					result,
					turns: response.num_turns ?? 1,
					error: code !== 0 ? `Exit code ${code}` : undefined,
					inputTokens,
					outputTokens,
					costUsd,
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
					inputTokens: 0,
					outputTokens: 0,
					costUsd: 0,
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
					inputTokens: 0,
					outputTokens: 0,
					costUsd: 0,
				});
				return;
			}
			resolve({
				agent: agentDef.name,
				status: "failed",
				result: "",
				turns: 0,
				error: `Spawn error: ${err.message}`,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
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
	sandbox?: SandboxPolicy | boolean,
): Promise<RunResult> {
	const modelStr = agentDef.model ?? defaultModel;
	const [provider, modelId] = parseModel(modelStr);
	const model = getModel(provider as any, modelId);

	const reportBox: { value: { status: string; result: string } | null } = { value: null };
	const onReport = (status: string, result: string) => {
		reportBox.value = { status, result };
	};

	const policy = sandbox === false ? undefined
		: (sandbox === true || sandbox === undefined) ? defaultPolicy(agentDef.role, cwd)
		: sandbox;
	const tools = createAgentTools(agentDef.name, cwd, memory, onReport, agentDef.tools, policy);

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
		return { agent: agentDef.name, status: "failed", result: "", turns, error: e.message ?? String(e), inputTokens: 0, outputTokens: 0, costUsd: 0 };
	}

	unsub();
	process.stderr.write("\n");

	if (reportBox.value) {
		const rpt = reportBox.value;
		log.info(agentDef.name, `Done (${rpt.status})`);
		return { agent: agentDef.name, status: rpt.status as RunResult["status"], result: rpt.result, turns, inputTokens: 0, outputTokens: 0, costUsd: 0 };
	}

	const messages = agent.state.messages;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (msg.role === "assistant" && "content" in msg) {
			const textParts = (msg.content as any[]).filter((c: any) => c.type === "text");
			if (textParts.length > 0) {
				const text = textParts.map((c: any) => c.text).join("\n");
				log.info(agentDef.name, "Done (no report tool, using last output)");
				return { agent: agentDef.name, status: "no_report", result: text, turns, inputTokens: 0, outputTokens: 0, costUsd: 0 };
			}
		}
	}

	return { agent: agentDef.name, status: "failed", result: "", turns, error: "No output", inputTokens: 0, outputTokens: 0, costUsd: 0 };
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
	taskId?: string,
	sandbox?: SandboxPolicy | boolean,
): Promise<RunResult> {
	const resolved = detectEngine(engine);

	if (resolved === "claude-code") {
		// Claude Code has its own permission system; sandbox is ignored
		return runWithClaudeCode(agentDef, task, cwd, memory, teamRoster, skillRegistry, taskId);
	}
	if (resolved === "codex") {
		// Try session resume if a prior session ID exists in memory
		const priorSession = memory.get(`result:${agentDef.name}:session`);
		return runWithCodex(agentDef, task, cwd, memory, teamRoster, skillRegistry, taskId, priorSession || undefined);
	}
	return runWithBuiltin(agentDef, task, cwd, memory, teamRoster, defaultModel, maxTurns, skillRegistry, sandbox);
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
