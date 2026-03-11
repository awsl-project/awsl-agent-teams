/**
 * Dashboard — HTTP server for the pixel art dashboard.
 *
 * Serves the dashboard HTML and provides JSON API endpoints
 * for history, stats, queue data, log streaming (SSE), and queue mutations.
 */

import * as http from "node:http";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as child_process from "node:child_process";
import { loadHistory, getHistoryStats, clearHistory } from "./history.js";
import { TaskQueue } from "./queue.js";
import { ProjectManager } from "./projects.js";
import { log } from "./log.js";
import { RelayServer } from "./relay.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_BODY = 1024 * 1024 // 1MB
function collectBody(req: http.IncomingMessage, res: http.ServerResponse, cb: (body: string) => void) {
	let body = ''
	let size = 0
	req.on('data', (chunk: Buffer) => {
		size += chunk.length
		if (size > MAX_BODY) {
			res.writeHead(413, { 'Content-Type': 'application/json' })
			res.end(JSON.stringify({ error: 'Request body too large' }))
			req.destroy()
			return
		}
		body += chunk.toString()
	})
	req.on('end', () => { if (!req.destroyed) cb(body) })
}

export function startDashboard(cwd: string, port: number = 3120, host: string = '127.0.0.1'): http.Server {
	// Resolve dashboard HTML path — try multiple locations
	const htmlPaths = [
		path.join(__dirname, "..", "public", "dashboard.html"), // from dist/
		path.join(__dirname, "..", "..", "public", "dashboard.html"), // fallback
		path.join(cwd, "public", "dashboard.html"), // from cwd
	];

	let dashboardHtml = "";
	for (const p of htmlPaths) {
		try {
			dashboardHtml = fs.readFileSync(p, "utf-8");
			log.info("dashboard", `Loaded HTML from ${p}`);
			break;
		} catch {
			/* try next */
		}
	}

	if (!dashboardHtml) {
		dashboardHtml = `<html><body style="background:#0a0a1a;color:#00ff41;font-family:monospace;padding:40px"><h1>AWSL Dashboard</h1><p>dashboard.html not found. Run from the awsl-agent-teams project directory.</p></body></html>`;
	}

	const server = http.createServer((req, res) => {
		// CORS headers — restrict to localhost origins only
		const origin = req.headers.origin
		const allowedOrigin = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : undefined
		if (allowedOrigin) {
			res.setHeader("Access-Control-Allow-Origin", allowedOrigin)
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			res.setHeader("Access-Control-Allow-Headers", "Content-Type")
		}

		// Handle CORS preflight
		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		const url = new URL(req.url ?? "/", `http://localhost:${port}`);

		// ── Static ────────────────────────────────────────
		if (url.pathname === "/" || url.pathname === "/dashboard") {
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(dashboardHtml);
			return;
		}

		// ── JSON APIs: read-only ──────────────────────────
		if (url.pathname === "/api/info") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ cwd, project: path.basename(cwd) }));
			return;
		}

		if (url.pathname === "/api/history") {
			const data = loadHistory(cwd);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(data));
			return;
		}

		if (url.pathname === "/api/stats") {
			const data = loadHistory(cwd);
			const stats = getHistoryStats(data);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(stats));
			return;
		}

		if (url.pathname === "/api/queue" && req.method === "GET") {
			const queuePath = path.join(cwd, ".planning", "QUEUE.json");
			try {
				const queueData = fs.readFileSync(queuePath, "utf-8");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(queueData);
			} catch {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ tasks: [] }));
			}
			return;
		}

		if (url.pathname === "/api/discussions" && req.method === "GET") {
			const data = loadHistory(cwd);
			const discussions = data.entries
				.filter((e: any) => e.mode === "discuss" && e.answer)
				.map((e: any) => ({
					id: e.queueTaskId,
					question: e.goal,
					answer: e.answer,
					agents: e.agents ?? [],
					date: e.completedAt,
					duration: e.duration,
					costUsd: e.costUsd ?? 0,
				}));
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(discussions));
			return;
		}

		// ── Queue mutations ───────────────────────────────
		if (req.method === "POST" && url.pathname === "/api/queue/add") {
			collectBody(req, res, (body) => {
				try {
					const { goal, engine, quick, dependsOn, runAt, mode, discussRounds } = JSON.parse(body);
					if (!goal || typeof goal !== "string") {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "goal is required" }));
						return;
					}
					const queue = new TaskQueue(cwd);
					const task = queue.add(goal, { quick: !!quick, discussRounds }, { engine, dependsOn, runAt, mode });
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(task));
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid JSON body" }));
				}
			});
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/queue/set-time") {
			collectBody(req, res, (body) => {
				try {
					const { id, runAt } = JSON.parse(body);
					if (!id) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "id is required" }));
						return;
					}
					const queue = new TaskQueue(cwd);
					const ok = queue.setRunAt(id, runAt || null);
					res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ updated: ok }));
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid JSON body" }));
				}
			});
			return;
		}

		if (req.method === "DELETE" && url.pathname === "/api/queue/remove") {
			const id = url.searchParams.get("id");
			if (!id) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "id query parameter required" }));
				return;
			}
			const queue = new TaskQueue(cwd);
			const removed = queue.remove(id);
			res.writeHead(removed ? 200 : 404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ removed }));
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/queue/clear") {
			const queue = new TaskQueue(cwd);
			queue.clear();
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ cleared: true }));
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/queue/start") {
			collectBody(req, res, (raw) => {
				try {
					const { engine, once, ignoreRunAt } = JSON.parse(raw || "{}");
					const queue = new TaskQueue(cwd);
					// Fire-and-forget: start the queue daemon in background
					queue.start(engine, { once: once ?? false, ignoreRunAt: ignoreRunAt ?? true }).catch(err => {
						log.warn("dashboard", `Queue execution error: ${err.message}`);
					});
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ started: true }));
				} catch (e: any) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: e.message }));
				}
			});
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/history/clear") {
			clearHistory(cwd);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ cleared: true }));
			return;
		}

		// ── Relay / Remote client APIs ────────────────────
		if (url.pathname === "/api/clients" && req.method === "GET") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(relay.getClients()));
			return;
		}

		if (url.pathname === "/api/clients/command" && req.method === "POST") {
			collectBody(req, res, async (body) => {
				try {
					const { clientId, action, payload, timeout } = JSON.parse(body);
					if (!clientId || !action) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "clientId and action are required" }));
						return;
					}
					const result = await relay.sendCommand(clientId, action, payload, timeout);
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(result));
				} catch (e: any) {
					res.writeHead(502, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: e.message }));
				}
			});
			return;
		}

		// ── Projects APIs ────────────────────────────────
		if (url.pathname === "/api/projects" && req.method === "GET") {
			try {
				const statuses = ProjectManager.getAllStatuses();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(statuses));
			} catch (e: any) {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: e.message }));
			}
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/projects/add") {
			collectBody(req, res, (body) => {
				try {
					const parsed = JSON.parse(body);
					const { path: projPath, name, tags } = parsed;
					if (!projPath || typeof projPath !== "string") {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path is required and must be a string" }));
						return;
					}
					if (!path.isAbsolute(projPath)) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path must be absolute" }));
						return;
					}
					const entry = ProjectManager.add(projPath, name, tags);
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(entry));
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid JSON body" }));
				}
			});
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/projects/remove") {
			collectBody(req, res, (body) => {
				try {
					const { path: projPath } = JSON.parse(body);
					if (!projPath || typeof projPath !== "string") {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path is required" }));
						return;
					}
					if (!path.isAbsolute(projPath)) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path must be absolute" }));
						return;
					}
					const removed = ProjectManager.remove(projPath);
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ removed }));
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid JSON body" }));
				}
			});
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/projects/scan") {
			collectBody(req, res, (body) => {
				try {
					const { dir, depth } = JSON.parse(body);
					if (!dir || typeof dir !== "string") {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "dir is required" }));
						return;
					}
					if (!path.isAbsolute(dir)) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "dir must be absolute" }));
						return;
					}
					const results = ProjectManager.scan(dir, depth);
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(results));
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid JSON body" }));
				}
			});
			return;
		}

		if (url.pathname === "/api/projects/queue" && req.method === "GET") {
			const projPath = url.searchParams.get("path");
			if (!projPath) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "path query parameter required" }));
				return;
			}
			if (!path.isAbsolute(projPath)) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "path must be absolute" }));
				return;
			}
			const queuePath = path.join(projPath, ".planning", "QUEUE.json");
			try {
				const queueData = fs.readFileSync(queuePath, "utf-8");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(queueData);
			} catch {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ tasks: [] }));
			}
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/projects/queue/add") {
			collectBody(req, res, (body) => {
				try {
					const { path: projPath, goal, quick, engine, dependsOn, runAt } = JSON.parse(body);
					if (!projPath || typeof projPath !== "string") {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path is required" }));
						return;
					}
					if (!path.isAbsolute(projPath)) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path must be absolute" }));
						return;
					}
					if (!goal || typeof goal !== "string") {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "goal is required" }));
						return;
					}
					const queue = new TaskQueue(projPath);
					const task = queue.add(goal, { quick: !!quick }, { engine, dependsOn, runAt });
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(task));
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid JSON body" }));
				}
			});
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/projects/queue/start") {
			collectBody(req, res, (body) => {
				try {
					const { path: projPath, engine, once } = JSON.parse(body);
					if (!projPath || typeof projPath !== "string") {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path is required" }));
						return;
					}
					if (!path.isAbsolute(projPath)) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path must be absolute" }));
						return;
					}
					const cliPath = process.argv[1] ?? path.join(__dirname, "..", "dist", "cli.js");
					const args = ["queue", "start", "--cwd", projPath];
					if (engine) args.push("--engine", engine);
					if (once) args.push("--once");
					const child = child_process.spawn(process.execPath, [cliPath, ...args], {
						detached: true,
						stdio: "ignore",
						cwd: projPath,
					});
					child.unref();
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ started: true, pid: child.pid }));
				} catch (e: any) {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: e.message }));
				}
			});
			return;
		}

		if (req.method === "POST" && url.pathname === "/api/projects/queue/clear") {
			collectBody(req, res, (body) => {
				try {
					const { path: projPath } = JSON.parse(body);
					if (!projPath || typeof projPath !== "string") {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path is required" }));
						return;
					}
					if (!path.isAbsolute(projPath)) {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "path must be absolute" }));
						return;
					}
					const queue = new TaskQueue(projPath);
					queue.clear();
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ cleared: true }));
				} catch {
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid JSON body" }));
				}
			});
			return;
		}

		if (url.pathname === "/api/projects/history" && req.method === "GET") {
			const projPath = url.searchParams.get("path");
			if (!projPath) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "path query parameter required" }));
				return;
			}
			if (!path.isAbsolute(projPath)) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "path must be absolute" }));
				return;
			}
			const data = loadHistory(projPath);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(data));
			return;
		}

		if (url.pathname === "/api/projects/stats" && req.method === "GET") {
			const projPath = url.searchParams.get("path");
			if (!projPath) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "path query parameter required" }));
				return;
			}
			if (!path.isAbsolute(projPath)) {
				res.writeHead(400, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ error: "path must be absolute" }));
				return;
			}
			const data = loadHistory(projPath);
			const stats = getHistoryStats(data);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(stats));
			return;
		}

		// ── 404 ───────────────────────────────────────────
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Not found" }));
	});

	// Attach WebSocket relay server for remote client connections
	const relay = new RelayServer(server);

	// Clean up relay (heartbeat interval, WebSocket connections) when server closes
	server.on("close", () => {
		relay.close();
	});

	server.on("error", (err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			log.warn("dashboard", `Port ${port} is already in use. Use --port to specify another port, or run 'awsl dashboard stop' first.`);
			process.exit(1);
		}
		throw err;
	});

	server.listen(port, host, () => {
		log.info("dashboard", `Dashboard running at http://${host}:${port}`);
		log.info("dashboard", `API: /api/history, /api/stats, /api/queue, /api/queue/add|remove|clear|start, /api/history/clear, /api/projects/*`);
		log.info("dashboard", `Relay: /ws/relay (WebSocket), /api/clients, /api/clients/command`);
	});

	return server;
}

/** Check if a port is in use. Resolves to true if occupied. */
export function isPortInUse(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const tester = net.createServer()
			.once("error", (err: NodeJS.ErrnoException) => {
				resolve(err.code === "EADDRINUSE");
			})
			.once("listening", () => {
				tester.close(() => resolve(false));
			})
			.listen(port);
	});
}
