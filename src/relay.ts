/**
 * WebSocket relay server — manages connections from remote AWSL clients.
 *
 * Attached to the dashboard HTTP server via upgrade handling.
 * Clients connect at /ws/relay, register with a clientId, and can
 * receive commands + push status/log updates.
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import { log } from "./log.js";

// ─── Protocol types ─────────────────────────────────────

/** Any JSON message on the wire. */
export interface RelayMessage {
	type: string;
	[key: string]: unknown;
}

/** Server → Client command. */
export interface CommandMessage {
	type: "command";
	id: string;       // unique per command, for result correlation
	action: string;   // e.g. "queue:add", "queue:start"
	payload?: unknown;
}

/** Client → Server command result. */
export interface CommandResultMessage {
	type: "command:result";
	id: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

/** Metadata for a connected client (without the raw ws). */
export interface ClientInfo {
	id: string;
	hostname: string;
	platform: string;
	cwd: string;
	connectedAt: string;
	lastSeen: string;
	status?: {
		queue: unknown[];
		history?: unknown[];
		system: {
			hostname: string;
			platform: string;
			arch: string;
			uptime: number;
			memory: { total: number; free: number };
		};
	};
}

/** Internal entry with the live WebSocket. */
interface ConnectedClient extends ClientInfo {
	ws: WebSocket;
	pendingCommands: Map<string, {
		resolve: (result: CommandResultMessage) => void;
		timer: ReturnType<typeof setTimeout>;
	}>;
}

// ─── RelayServer ────────────────────────────────────────

export class RelayServer {
	private wss: WebSocketServer;
	private clients = new Map<string, ConnectedClient>();
	private heartbeatInterval: ReturnType<typeof setInterval>;

	constructor(server: Server) {
		this.wss = new WebSocketServer({ noServer: true });

		// Handle WebSocket upgrade on /ws/relay
		server.on("upgrade", (req: IncomingMessage, socket, head) => {
			const url = new URL(req.url ?? "/", "http://localhost");
			if (url.pathname === "/ws/relay") {
				this.wss.handleUpgrade(req, socket as any, head as any, (ws) => {
					this.wss.emit("connection", ws, req);
				});
			} else {
				(socket as any).destroy();
			}
		});

		this.wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
			this.handleConnection(ws, req);
		});

		// Heartbeat every 30s
		this.heartbeatInterval = setInterval(() => this.heartbeat(), 30000);
	}

	/** Graceful shutdown. */
	close(): void {
		clearInterval(this.heartbeatInterval);
		for (const client of this.clients.values()) {
			client.ws.close();
		}
		this.wss.close();
	}

	// ─── Public API ─────────────────────────────────────

	/** List all connected clients (without raw ws). */
	getClients(): ClientInfo[] {
		return Array.from(this.clients.values()).map(({ ws, pendingCommands, ...info }) => info);
	}

	/** Get a single client's info. */
	getClient(id: string): ClientInfo | undefined {
		const c = this.clients.get(id);
		if (!c) return undefined;
		const { ws, pendingCommands, ...info } = c;
		return info;
	}

	/**
	 * Send a command to a specific client and wait for the result.
	 * Times out after `timeoutMs` (default 30s).
	 */
	sendCommand(
		clientId: string,
		action: string,
		payload?: unknown,
		timeoutMs = 30000,
	): Promise<CommandResultMessage> {
		return new Promise((resolve, reject) => {
			const client = this.clients.get(clientId);
			if (!client || client.ws.readyState !== WebSocket.OPEN) {
				return reject(new Error(`Client not connected: ${clientId}`));
			}

			const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

			const timer = setTimeout(() => {
				client.pendingCommands.delete(id);
				reject(new Error(`Command timed out: ${action}`));
			}, timeoutMs);

			client.pendingCommands.set(id, { resolve, timer });

			const msg: CommandMessage = { type: "command", id, action, payload };
			client.ws.send(JSON.stringify(msg));
		});
	}

	/**
	 * Fire-and-forget command (no result awaited).
	 */
	sendCommandNoWait(clientId: string, action: string, payload?: unknown): boolean {
		const client = this.clients.get(clientId);
		if (!client || client.ws.readyState !== WebSocket.OPEN) return false;

		const id = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const msg: CommandMessage = { type: "command", id, action, payload };
		client.ws.send(JSON.stringify(msg));
		return true;
	}

	/** Broadcast a message to all connected clients. */
	broadcast(msg: RelayMessage): void {
		const data = JSON.stringify(msg);
		for (const client of this.clients.values()) {
			if (client.ws.readyState === WebSocket.OPEN) {
				client.ws.send(data);
			}
		}
	}

	// ─── Connection handling ────────────────────────────

	private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
		let clientId: string | null = null;

		ws.on("message", (raw) => {
			try {
				const msg: RelayMessage = JSON.parse(raw.toString());
				this.onMessage(ws, msg, () => clientId, (id) => { clientId = id; });
			} catch (e) {
				log.warn("relay", `Invalid message: ${e}`);
			}
		});

		ws.on("close", () => {
			if (clientId && this.clients.has(clientId)) {
				this.clients.delete(clientId);
				log.info("relay", `Client disconnected: ${clientId}`);
			}
		});

		ws.on("error", (err) => {
			log.warn("relay", `WebSocket error${clientId ? ` (${clientId})` : ""}: ${err.message}`);
		});
	}

	private onMessage(
		ws: WebSocket,
		msg: RelayMessage,
		getId: () => string | null,
		setId: (id: string) => void,
	): void {
		switch (msg.type) {
			case "register": {
				const id = msg.clientId as string;
				if (!id) return;

				// If a client with same ID exists, kick the old one
				if (this.clients.has(id)) {
					const old = this.clients.get(id)!;
					old.ws.close(4000, "Replaced by new connection");
					this.clients.delete(id);
				}

				setId(id);
				this.clients.set(id, {
					id,
					ws,
					hostname: msg.hostname as string ?? "unknown",
					platform: msg.platform as string ?? "unknown",
					cwd: msg.cwd as string ?? "",
					connectedAt: new Date().toISOString(),
					lastSeen: new Date().toISOString(),
					pendingCommands: new Map(),
				});

				log.info("relay", `Client registered: ${id} (${msg.hostname})`);
				ws.send(JSON.stringify({ type: "registered", clientId: id }));
				break;
			}

			case "status": {
				const cid = getId();
				if (cid && this.clients.has(cid)) {
					const client = this.clients.get(cid)!;
					client.status = msg.data as any;
					client.lastSeen = new Date().toISOString();
				}
				break;
			}

			case "command:result": {
				const cid = getId();
				if (!cid) break;
				const client = this.clients.get(cid);
				if (!client) break;

				const cmdId = msg.id as string;
				const pending = client.pendingCommands.get(cmdId);
				if (pending) {
					clearTimeout(pending.timer);
					client.pendingCommands.delete(cmdId);
					pending.resolve(msg as unknown as CommandResultMessage);
				}
				break;
			}

			case "pong": {
				const cid = getId();
				if (cid && this.clients.has(cid)) {
					this.clients.get(cid)!.lastSeen = new Date().toISOString();
				}
				break;
			}

			default:
				log.warn("relay", `Unknown message type: ${msg.type}`);
		}
	}

	private heartbeat(): void {
		const now = Date.now();
		for (const [id, client] of this.clients) {
			if (client.ws.readyState !== WebSocket.OPEN) {
				this.clients.delete(id);
				continue;
			}
			// Drop clients that haven't responded in 90s
			const lastSeen = Date.parse(client.lastSeen);
			if (now - lastSeen > 90000) {
				log.info("relay", `Client timed out: ${id}`);
				client.ws.close(4001, "Heartbeat timeout");
				this.clients.delete(id);
				continue;
			}
			client.ws.send(JSON.stringify({ type: "ping" }));
		}
	}
}
