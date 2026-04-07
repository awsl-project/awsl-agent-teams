/**
 * Streaming — real-time event types for agent execution.
 *
 * Instead of waiting for a full RunResult, consumers receive fine-grained
 * events as the agent works: text deltas, tool invocations, turn boundaries,
 * progress messages, and the final result.
 *
 * Supported by all three engines:
 *   - claude-code: parsed from `--output-format stream-json` NDJSON
 *   - codex: parsed from `--json` JSONL events
 *   - builtin: forwarded from pi-agent-core AgentEvent subscriber
 */

import type { Engine, RunResult } from "./runner.js";

// ─── Stream Event Types ─────────────────────────────────────

export interface StreamEventBase {
	agent: string;
	timestamp: string;
}

/** Agent process spawned. */
export interface StreamStartEvent extends StreamEventBase {
	type: "start";
	engine: Engine;
	taskId?: string;
}

/** Incremental text output from the model. */
export interface StreamTextEvent extends StreamEventBase {
	type: "text";
	text: string;
}

/** Agent began invoking a tool. */
export interface StreamToolStartEvent extends StreamEventBase {
	type: "tool_start";
	tool: string;
	args?: string;
}

/** Tool execution completed. */
export interface StreamToolEndEvent extends StreamEventBase {
	type: "tool_end";
	tool: string;
	output?: string;
}

/** One model turn completed. */
export interface StreamTurnEndEvent extends StreamEventBase {
	type: "turn_end";
	turn: number;
	inputTokens?: number;
	outputTokens?: number;
}

/** Informational progress (e.g. "reading file", "running tests"). */
export interface StreamProgressEvent extends StreamEventBase {
	type: "progress";
	message: string;
}

/** Non-fatal error or warning during execution. */
export interface StreamErrorEvent extends StreamEventBase {
	type: "error";
	message: string;
}

/** Agent execution finished — carries the final RunResult. */
export interface StreamDoneEvent extends StreamEventBase {
	type: "done";
	result: RunResult;
}

export type AgentStreamEvent =
	| StreamStartEvent
	| StreamTextEvent
	| StreamToolStartEvent
	| StreamToolEndEvent
	| StreamTurnEndEvent
	| StreamProgressEvent
	| StreamErrorEvent
	| StreamDoneEvent;

/** Callback for receiving streaming events. */
export type StreamCallback = (event: AgentStreamEvent) => void;

// ─── Helpers ────────────────────────────────────────────────

function ts(): string {
	return new Date().toISOString();
}

/** Create a StreamStartEvent. */
export function streamStart(agent: string, engine: Engine, taskId?: string): StreamStartEvent {
	return { type: "start", agent, engine, taskId, timestamp: ts() };
}

/** Create a StreamTextEvent. */
export function streamText(agent: string, text: string): StreamTextEvent {
	return { type: "text", agent, text, timestamp: ts() };
}

/** Create a StreamToolStartEvent. */
export function streamToolStart(agent: string, tool: string, args?: string): StreamToolStartEvent {
	return { type: "tool_start", agent, tool, args, timestamp: ts() };
}

/** Create a StreamToolEndEvent. */
export function streamToolEnd(agent: string, tool: string, output?: string): StreamToolEndEvent {
	return { type: "tool_end", agent, tool, output, timestamp: ts() };
}

/** Create a StreamTurnEndEvent. */
export function streamTurnEnd(agent: string, turn: number, inputTokens?: number, outputTokens?: number): StreamTurnEndEvent {
	return { type: "turn_end", agent, turn, inputTokens, outputTokens, timestamp: ts() };
}

/** Create a StreamProgressEvent. */
export function streamProgress(agent: string, message: string): StreamProgressEvent {
	return { type: "progress", agent, message, timestamp: ts() };
}

/** Create a StreamErrorEvent. */
export function streamError(agent: string, message: string): StreamErrorEvent {
	return { type: "error", agent, message, timestamp: ts() };
}

/** Create a StreamDoneEvent. */
export function streamDone(agent: string, result: RunResult): StreamDoneEvent {
	return { type: "done", agent, result, timestamp: ts() };
}

// ─── CC stream-json NDJSON Parser ───────────────────────────

/**
 * Parse a Claude Code stream-json NDJSON line and emit appropriate events.
 *
 * CC stream-json format:
 *   { type: "system", subtype: "init", tools: [...], session_id: "..." }
 *   { type: "assistant", message: { role: "assistant", content: [...] }, session_id: "..." }
 *   { type: "result", subtype: "success", result: "...", session_id: "...", ... }
 *   { type: "result", subtype: "error", error: "...", ... }
 */
export function parseCCStreamLine(
	agent: string,
	line: string,
	emit: StreamCallback,
): { sessionId?: string; result?: string; usage?: { input_tokens: number; output_tokens: number }; costUsd?: number; numTurns?: number } | null {
	const trimmed = line.trim();
	if (!trimmed) return null;

	try {
		const obj = JSON.parse(trimmed);

		// System init — extract tools list
		if (obj.type === "system" && obj.subtype === "init") {
			emit(streamProgress(agent, `Connected (tools: ${(obj.tools ?? []).length})`));
			return { sessionId: obj.session_id };
		}

		// Assistant message — extract text and tool_use blocks
		if (obj.type === "assistant" && obj.message?.content) {
			const content = obj.message.content;
			if (Array.isArray(content)) {
				for (const block of content) {
					if (block.type === "text" && block.text) {
						emit(streamText(agent, block.text));
					}
					if (block.type === "tool_use") {
						const argsStr = block.input ? JSON.stringify(block.input).slice(0, 200) : undefined;
						emit(streamToolStart(agent, block.name ?? "unknown", argsStr));
					}
					if (block.type === "tool_result") {
						const output = typeof block.content === "string" ? block.content.slice(0, 200) : undefined;
						emit(streamToolEnd(agent, block.tool_use_id ?? "unknown", output));
					}
				}
			}
			return null;
		}

		// Result — final message
		if (obj.type === "result") {
			const usage = obj.usage ?? {};
			return {
				sessionId: obj.session_id,
				result: obj.result ?? obj.error ?? "",
				usage: { input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0 },
				costUsd: obj.total_cost_usd ?? obj.cost_usd ?? 0,
				numTurns: obj.num_turns ?? 1,
			};
		}

		// Status messages
		if (obj.type === "system" && obj.subtype === "status") {
			emit(streamProgress(agent, `Status: ${obj.status ?? "unknown"}`));
			return null;
		}

		return null;
	} catch {
		// Not JSON — ignore
		return null;
	}
}

// ─── Codex JSONL Parser ─────────────────────────────────────

/**
 * Parse a Codex JSONL event and emit appropriate stream events.
 *
 * Codex events: thread.started, turn.completed, item.file_edit,
 * item.command_execution, item.agent_message, error
 */
export function parseCodexStreamLine(
	agent: string,
	line: string,
	emit: StreamCallback,
): { sessionId?: string; turnDelta?: { inputTokens: number; outputTokens: number } } | null {
	const trimmed = line.trim();
	if (!trimmed) return null;

	try {
		const event = JSON.parse(trimmed);

		if (event.type === "thread.started" && event.thread_id) {
			emit(streamProgress(agent, `Session: ${event.thread_id}`));
			return { sessionId: event.thread_id };
		}

		if (event.type === "turn.completed") {
			const inputTokens = event.usage?.input_tokens ?? 0;
			const outputTokens = event.usage?.output_tokens ?? 0;
			return { turnDelta: { inputTokens, outputTokens } };
		}

		if (event.type === "item.file_edit" && event.filename) {
			emit(streamToolStart(agent, "file_edit", event.filename));
		}

		if (event.type === "item.command_execution" && event.command) {
			emit(streamToolStart(agent, "command", event.command.slice(0, 200)));
		}

		if (event.type === "item.agent_message" && event.content) {
			emit(streamText(agent, event.content));
		}

		if (event.type === "error" && event.message) {
			emit(streamError(agent, event.message.slice(0, 300)));
		}

		return null;
	} catch {
		return null;
	}
}
