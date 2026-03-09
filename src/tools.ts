/**
 * Built-in tools for agents.
 *
 * Each agent gets: read, write, edit, bash, memory_read, memory_write, memory_list, report.
 * These are real tool implementations using pi-agent-core's AgentTool interface.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { SharedMemory } from "./memory.js";
import type { SandboxPolicy } from "./sandbox.js";
import { checkWritePath, checkBashCommand } from "./sandbox.js";

function text(t: string): AgentToolResult<any> {
	return { content: [{ type: "text", text: t }], details: {} };
}

export function createReadTool(cwd: string): AgentTool<any> {
	return {
		name: "read",
		label: "Read file",
		description: "Read a file's contents. Use absolute paths or paths relative to the working directory.",
		parameters: Type.Object({
			path: Type.String({ description: "File path to read" }),
			offset: Type.Optional(Type.Number({ description: "Start line (1-based)" })),
			limit: Type.Optional(Type.Number({ description: "Number of lines to read" })),
		}),
		async execute(_id, params) {
			const filePath = path.resolve(cwd, params.path);
			try {
				let content = fs.readFileSync(filePath, "utf-8");
				if (params.offset || params.limit) {
					const lines = content.split("\n");
					const start = (params.offset ?? 1) - 1;
					const end = params.limit ? start + params.limit : lines.length;
					content = lines.slice(start, end).map((l, i) => `${start + i + 1}\t${l}`).join("\n");
				}
				return text(content);
			} catch (e: any) {
				return text(`Error: ${e.message}`);
			}
		},
	};
}

export function createWriteTool(cwd: string, sandbox?: SandboxPolicy): AgentTool<any> {
	return {
		name: "write",
		label: "Write file",
		description: "Create or overwrite a file.",
		parameters: Type.Object({
			path: Type.String({ description: "File path to write" }),
			content: Type.String({ description: "File content" }),
		}),
		async execute(_id, params) {
			const filePath = path.resolve(cwd, params.path);
			if (sandbox) {
				const blocked = checkWritePath(filePath, sandbox);
				if (blocked) return text(blocked);
			}
			try {
				fs.mkdirSync(path.dirname(filePath), { recursive: true });
				fs.writeFileSync(filePath, params.content);
				return text(`Wrote ${params.content.split("\n").length} lines to ${params.path}`);
			} catch (e: any) {
				return text(`Error: ${e.message}`);
			}
		},
	};
}

export function createEditTool(cwd: string, sandbox?: SandboxPolicy): AgentTool<any> {
	return {
		name: "edit",
		label: "Edit file",
		description: "Replace exact text in a file. old_string must match exactly.",
		parameters: Type.Object({
			path: Type.String({ description: "File path" }),
			old_string: Type.String({ description: "Exact text to find" }),
			new_string: Type.String({ description: "Replacement text" }),
		}),
		async execute(_id, params) {
			const filePath = path.resolve(cwd, params.path);
			if (sandbox) {
				const blocked = checkWritePath(filePath, sandbox);
				if (blocked) return text(blocked);
			}
			try {
				const content = fs.readFileSync(filePath, "utf-8");
				if (!content.includes(params.old_string)) {
					return text(`Error: old_string not found in ${params.path}`);
				}
				const updated = content.replace(params.old_string, params.new_string);
				fs.writeFileSync(filePath, updated);
				return text(`Edited ${params.path}`);
			} catch (e: any) {
				return text(`Error: ${e.message}`);
			}
		},
	};
}

export function createBashTool(cwd: string, sandbox?: SandboxPolicy): AgentTool<any> {
	return {
		name: "bash",
		label: "Run command",
		description: "Execute a bash command and return its output.",
		parameters: Type.Object({
			command: Type.String({ description: "Shell command to execute" }),
		}),
		async execute(_id, params) {
			if (sandbox) {
				const blocked = checkBashCommand(params.command, sandbox);
				if (blocked) return text(blocked);
			}
			try {
				const output = execSync(params.command, {
					cwd,
					encoding: "utf-8",
					timeout: 30000,
					maxBuffer: 1024 * 1024,
					stdio: ["pipe", "pipe", "pipe"],
				});
				return text(output || "(no output)");
			} catch (e: any) {
				const stderr = e.stderr?.toString() || "";
				const stdout = e.stdout?.toString() || "";
				return text(`Exit code ${e.status ?? 1}\n${stdout}\n${stderr}`.trim());
			}
		},
	};
}

export function createMemoryReadTool(memory: SharedMemory): AgentTool<any> {
	return {
		name: "memory_read",
		label: "Read shared memory",
		description: "Read a value from the team's shared memory. Use memory_list to see available keys.",
		parameters: Type.Object({
			key: Type.String({ description: "Memory key to read" }),
		}),
		async execute(_id, params) {
			const value = memory.get(params.key);
			return text(value ?? `Key "${params.key}" not found.`);
		},
	};
}

export function createMemoryWriteTool(agentName: string, memory: SharedMemory): AgentTool<any> {
	return {
		name: "memory_write",
		label: "Write shared memory",
		description: "Write a value to team shared memory. Other agents can read this.",
		parameters: Type.Object({
			key: Type.String({ description: "Memory key" }),
			value: Type.String({ description: "Value to store" }),
		}),
		async execute(_id, params) {
			memory.set(params.key, params.value, agentName);
			return text(`Stored "${params.key}" in shared memory.`);
		},
	};
}

export function createMemoryListTool(memory: SharedMemory): AgentTool<any> {
	return {
		name: "memory_list",
		label: "List shared memory",
		description: "List all keys in the team's shared memory.",
		parameters: Type.Object({}),
		async execute() {
			const keys = memory.keys();
			return text(keys.length === 0 ? "Shared memory is empty." : `Keys:\n${keys.map(k => `- ${k}`).join("\n")}`);
		},
	};
}

/**
 * The report tool — how agents submit their results.
 * The orchestrator captures this via a callback.
 */
export function createReportTool(onReport: (status: string, result: string) => void): AgentTool<any> {
	return {
		name: "report",
		label: "Report results",
		description: "Submit your task results. Call this when your task is complete.",
		parameters: Type.Object({
			status: Type.Union([
				Type.Literal("done"),
				Type.Literal("failed"),
				Type.Literal("blocked"),
			], { description: "Task status" }),
			result: Type.String({ description: "Your output / deliverable" }),
		}),
		async execute(_id, params) {
			onReport(params.status, params.result);
			return text(`Report submitted (${params.status}).`);
		},
	};
}

/** Create send_message tool for agent-to-agent communication */
export function createSendMessageTool(
	senderName: string,
	memory: SharedMemory,
): AgentTool<any> {
	return {
		name: "send_message",
		label: "Send message to another agent",
		description: "Send a message to another agent via shared memory. The target agent will see it in their memory context.",
		parameters: Type.Object({
			to: Type.String({ description: "Target agent name" }),
			message: Type.String({ description: "Message content" }),
		}),
		async execute(_id, params) {
			const key = `msg:${senderName}→${params.to}:${Date.now()}`;
			memory.set(key, params.message, senderName);
			return text(`Message sent to ${params.to}.`);
		},
	};
}

/** All tool constructors keyed by name */
const TOOL_FACTORIES: Record<string, (ctx: ToolContext) => AgentTool<any>> = {
	read: (ctx) => createReadTool(ctx.cwd),
	write: (ctx) => createWriteTool(ctx.cwd, ctx.sandbox),
	edit: (ctx) => createEditTool(ctx.cwd, ctx.sandbox),
	bash: (ctx) => createBashTool(ctx.cwd, ctx.sandbox),
	memory_read: (ctx) => createMemoryReadTool(ctx.memory),
	memory_write: (ctx) => createMemoryWriteTool(ctx.agentName, ctx.memory),
	memory_list: (ctx) => createMemoryListTool(ctx.memory),
	send_message: (ctx) => createSendMessageTool(ctx.agentName, ctx.memory),
	report: (ctx) => createReportTool(ctx.onReport),
};

interface ToolContext {
	agentName: string;
	cwd: string;
	memory: SharedMemory;
	onReport: (status: string, result: string) => void;
	sandbox?: SandboxPolicy;
}

/** Assemble the tool set for an agent, respecting optional tool filter */
export function createAgentTools(
	agentName: string,
	cwd: string,
	memory: SharedMemory,
	onReport: (status: string, result: string) => void,
	allowedTools?: string[],
	sandbox?: SandboxPolicy,
): AgentTool<any>[] {
	const ctx: ToolContext = { agentName, cwd, memory, onReport, sandbox };

	// Always include memory tools and report
	const alwaysInclude = new Set(["memory_read", "memory_write", "memory_list", "send_message", "report"]);

	if (!allowedTools || allowedTools.length === 0) {
		// No filter — give everything
		return Object.entries(TOOL_FACTORIES).map(([, factory]) => factory(ctx));
	}

	const requested = new Set([...allowedTools, ...alwaysInclude]);
	return Object.entries(TOOL_FACTORIES)
		.filter(([name]) => requested.has(name))
		.map(([, factory]) => factory(ctx));
}
