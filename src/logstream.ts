/**
 * LogStream — singleton EventEmitter that broadcasts real-time log lines
 * from agent execution to SSE subscribers (dashboard).
 *
 * Runner pushes lines via push(), dashboard subscribes via "line" event.
 * A ring buffer keeps recent lines so late SSE connections can catch up.
 *
 * Also relays orchestrator TeamEvents via pushTeamEvent() / "team-event"
 * and fine-grained AgentStreamEvents via pushAgentEvent() / "agent-event"
 * so that SSE-based TUI monitors can track wave/task status and agent progress.
 */

import { EventEmitter } from "node:events";
import type { AgentStreamEvent } from "./streaming.js";

// ─── Interfaces ──────────────────────────────────────────────

export interface LogLine {
	timestamp: string;   // ISO string
	taskId: string;      // e.g. "task_1" or "q_1"
	agent: string;       // agent name
	stream: "stdout" | "stderr" | "event";
	text: string;        // one line of output
}

// ─── LogStream singleton ─────────────────────────────────────

export class LogStream extends EventEmitter {
	private static instance: LogStream;
	private buffer: LogLine[];
	private agentEventBuffer: AgentStreamEvent[];
	private maxBuffer: number;

	private constructor(maxBuffer = 500) {
		super();
		this.buffer = [];
		this.agentEventBuffer = [];
		this.maxBuffer = maxBuffer;
		// Allow many SSE listeners without warning
		this.setMaxListeners(100);
	}

	static getInstance(): LogStream {
		if (!LogStream.instance) {
			LogStream.instance = new LogStream();
		}
		return LogStream.instance;
	}

	/** Push a log line — emits "line" event to all subscribers. */
	push(line: LogLine): void {
		this.buffer.push(line);
		if (this.buffer.length > this.maxBuffer) {
			this.buffer.shift();
		}
		this.emit("line", line);
	}

	/** Push a TeamEvent — emits "team-event" to SSE subscribers. */
	pushTeamEvent(event: Record<string, unknown>): void {
		this.emit("team-event", event);
	}

	/**
	 * Push a fine-grained agent stream event — emits "agent-event" to subscribers.
	 * Also converts to a LogLine for backward-compatible "line" subscribers.
	 */
	pushAgentEvent(event: AgentStreamEvent): void {
		this.agentEventBuffer.push(event);
		if (this.agentEventBuffer.length > this.maxBuffer) {
			this.agentEventBuffer.shift();
		}
		this.emit("agent-event", event);

		// Also emit as LogLine for backward-compatible subscribers
		const text = agentEventToText(event);
		if (text) {
			this.push({
				timestamp: event.timestamp,
				taskId: ("taskId" in event && event.taskId) ? event.taskId : event.agent,
				agent: event.agent,
				stream: "event",
				text,
			});
		}
	}

	/** Get buffered lines (for new SSE connections to catch up). */
	getBuffer(): LogLine[] {
		return [...this.buffer];
	}

	/** Get buffered agent stream events. */
	getAgentEventBuffer(): AgentStreamEvent[] {
		return [...this.agentEventBuffer];
	}

	/** Clear all buffers. */
	clear(): void {
		this.buffer = [];
		this.agentEventBuffer = [];
	}
}

// ─── Helpers ────────────────────────────────────────────────

/** Convert an AgentStreamEvent to a short text line for LogLine compatibility. */
function agentEventToText(event: AgentStreamEvent): string | null {
	switch (event.type) {
		case "start":
			return `[start] engine=${event.engine}`;
		case "text":
			// Skip text deltas for LogLine — too noisy
			return null;
		case "tool_start":
			return `[tool] ${event.tool}${event.args ? ` ${event.args.slice(0, 100)}` : ""}`;
		case "tool_end":
			return `[tool_end] ${event.tool}`;
		case "turn_end":
			return `[turn] #${event.turn}${event.inputTokens ? ` in=${event.inputTokens} out=${event.outputTokens}` : ""}`;
		case "progress":
			return `[progress] ${event.message}`;
		case "error":
			return `[error] ${event.message.slice(0, 200)}`;
		case "done":
			return `[done] status=${event.result.status} turns=${event.result.turns}`;
		default:
			return null;
	}
}

// ─── Convenience export ──────────────────────────────────────

export function getLogStream(): LogStream {
	return LogStream.getInstance();
}
