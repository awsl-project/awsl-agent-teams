/**
 * Remote client — connects a local machine to a remote AWSL dashboard.
 *
 * Usage:
 *   awsl remote connect http://server:3120 --cwd /project
 *
 * The client:
 *   1. Connects via WebSocket to the dashboard relay
 *   2. Registers with hostname + cwd
 *   3. Receives commands (queue ops) and executes them locally
 *   4. Pushes status updates every 30s
 *   5. Auto-reconnects on disconnect
 */

import WebSocket from "ws";
import * as os from "node:os";
import * as path from "node:path";
import { TaskQueue } from "./queue.js";
import { type Engine, detectEngine } from "./runner.js";
import { loadHistory } from "./history.js";
import { log } from "./log.js";

export interface RemoteClientOptions {
	/** Dashboard server URL, e.g. "http://192.168.1.100:3120" */
	serverUrl: string;
	/** Unique client ID. Defaults to hostname-projectDir. */
	clientId?: string;
	/** Local working directory for the project. */
	cwd: string;
	/** Reconnect interval in ms (default 5000). */
	reconnectInterval?: number;
	/** Status push interval in ms (default 30000). */
	statusInterval?: number;
}

export class RemoteClient {
	private ws: WebSocket | null = null;
	private queue: TaskQueue;
	private options: RemoteClientOptions;
	private clientId: string;
	private stopped = false;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private statusTimer: ReturnType<typeof setInterval> | null = null;
	private reconnectAttempts = 0;

	constructor(options: RemoteClientOptions) {
		this.options = options;
		this.clientId = options.clientId ?? `${os.hostname()}-${path.basename(options.cwd)}`;
		this.queue = new TaskQueue(options.cwd);
	}

	/** Start connecting to the remote server. */
	connect(): void {
		if (this.stopped) return;

		// Build WebSocket URL
		const base = this.options.serverUrl.replace(/\/+$/, "");
		const wsUrl = base.replace(/^http/, "ws") + "/ws/relay";

		log.info("remote", `Connecting to ${wsUrl} as "${this.clientId}"...`);

		try {
			this.ws = new WebSocket(wsUrl);
		} catch (e: any) {
			log.warn("remote", `Failed to create WebSocket: ${e.message}`);
			this.scheduleReconnect();
			return;
		}

		this.ws.on("open", () => {
			this.reconnectAttempts = 0;
			log.info("remote", `Connected to ${this.options.serverUrl}`);

			// Register
			this.send({
				type: "register",
				clientId: this.clientId,
				hostname: os.hostname(),
				platform: process.platform,
				cwd: this.options.cwd,
			});

			// Start periodic status updates
			this.startStatusUpdates();
		});

		this.ws.on("message", (raw) => {
			try {
				const msg = JSON.parse(raw.toString());
				this.handleMessage(msg);
			} catch (e) {
				log.warn("remote", `Invalid message from server: ${e}`);
			}
		});

		this.ws.on("close", (code, reason) => {
			log.info("remote", `Disconnected (code=${code}${reason ? `, ${reason}` : ""})`);
			this.stopStatusUpdates();
			if (!this.stopped) {
				this.scheduleReconnect();
			}
		});

		this.ws.on("error", (err) => {
			log.warn("remote", `WebSocket error: ${err.message}`);
		});
	}

	/** Gracefully disconnect. */
	stop(): void {
		this.stopped = true;
		this.stopStatusUpdates();
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close(1000, "Client shutting down");
			this.ws = null;
		}
	}

	// ─── Message handling ───────────────────────────────

	private async handleMessage(msg: any): Promise<void> {
		switch (msg.type) {
			case "registered":
				log.info("remote", `Registered as "${msg.clientId}"`);
				// Send initial status
				this.sendStatus();
				break;

			case "ping":
				this.send({ type: "pong" });
				break;

			case "command":
				await this.executeCommand(msg);
				break;

			default:
				break;
		}
	}

	private async executeCommand(msg: any): Promise<void> {
		const { id, action, payload } = msg;
		log.info("remote", `Command: ${action}`);

		try {
			let result: unknown;

			switch (action) {
				case "queue:add": {
					const p = payload as any;
					result = this.queue.add(
						p.goal,
						{
							quick: p.quick,
							concurrency: p.concurrency,
							model: p.model,
							agentsDirs: p.agentsDirs,
							autoCommit: p.autoCommit,
							verify: p.verify,
							replan: p.replan,
						},
						{
							engine: p.engine,
							dependsOn: p.dependsOn,
							runAt: p.runAt,
						},
					);
					break;
				}

				case "queue:remove":
					result = this.queue.remove((payload as any).id);
					break;

				case "queue:clear":
					this.queue.clear();
					result = true;
					break;

				case "queue:list":
					result = this.queue.list();
					break;

				case "queue:get":
					result = this.queue.get((payload as any).id);
					break;

				case "queue:set-time":
					result = this.queue.setRunAt(
						(payload as any).id,
						(payload as any).runAt ?? null,
					);
					break;

				case "queue:start": {
					const p = payload as any;
					const engine = p?.engine ? detectEngine(p.engine) : undefined;
					// Run in background so we don't block the message handler
					this.queue.start(engine as Engine | undefined, { once: p?.once ?? false, ignoreRunAt: p?.ignoreRunAt ?? true })
						.then(() => log.info("remote", "Queue execution finished"))
						.catch((e: any) => log.warn("remote", `Queue execution failed: ${e.message}`));
					result = { started: true };
					break;
				}

				case "system:info":
					result = {
						hostname: os.hostname(),
						platform: process.platform,
						arch: os.arch(),
						cpus: os.cpus().length,
						uptime: os.uptime(),
						memory: { total: os.totalmem(), free: os.freemem() },
						nodeVersion: process.version,
						cwd: this.options.cwd,
					};
					break;

				default:
					throw new Error(`Unknown action: ${action}`);
			}

			this.send({
				type: "command:result",
				id,
				success: true,
				data: result,
			});
		} catch (e: any) {
			this.send({
				type: "command:result",
				id,
				success: false,
				error: e.message,
			});
		}

		// Push updated status after command
		this.sendStatus();
	}

	// ─── Status updates ─────────────────────────────────

	private startStatusUpdates(): void {
		this.sendStatus();
		const interval = this.options.statusInterval ?? 30000;
		this.statusTimer = setInterval(() => this.sendStatus(), interval);
	}

	private stopStatusUpdates(): void {
		if (this.statusTimer) {
			clearInterval(this.statusTimer);
			this.statusTimer = null;
		}
	}

	private sendStatus(): void {
		const historyData = loadHistory(this.options.cwd);
		this.send({
			type: "status",
			data: {
				queue: this.queue.list(),
				history: historyData.entries,
				system: {
					hostname: os.hostname(),
					platform: process.platform,
					arch: os.arch(),
					uptime: os.uptime(),
					memory: {
						total: os.totalmem(),
						free: os.freemem(),
					},
				},
			},
		});
	}

	// ─── Helpers ────────────────────────────────────────

	private send(msg: unknown): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	private scheduleReconnect(): void {
		const base = this.options.reconnectInterval ?? 5000;
		// Exponential backoff: 5s, 10s, 20s, 30s cap
		const delay = Math.min(base * Math.pow(2, this.reconnectAttempts), 30000);
		this.reconnectAttempts++;
		log.info("remote", `Reconnecting in ${(delay / 1000).toFixed(0)}s...`);
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}
}
