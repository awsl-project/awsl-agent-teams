/**
 * LogStream — singleton EventEmitter that broadcasts real-time log lines
 * from agent execution to SSE subscribers (dashboard).
 *
 * Runner pushes lines via push(), dashboard subscribes via "line" event.
 * A ring buffer keeps recent lines so late SSE connections can catch up.
 */

import { EventEmitter } from "node:events";

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
	private maxBuffer: number;

	private constructor(maxBuffer = 500) {
		super();
		this.buffer = [];
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

	/** Get buffered lines (for new SSE connections to catch up). */
	getBuffer(): LogLine[] {
		return [...this.buffer];
	}

	/** Clear the buffer. */
	clear(): void {
		this.buffer = [];
	}
}

// ─── Convenience export ──────────────────────────────────────

export function getLogStream(): LogStream {
	return LogStream.getInstance();
}
