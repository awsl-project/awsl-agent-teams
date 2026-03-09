/**
 * Dashboard — HTTP server for the pixel art dashboard.
 *
 * Serves the dashboard HTML and provides JSON API endpoints
 * for history, stats, queue data, log streaming (SSE), and queue mutations.
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHistory, getHistoryStats } from "./history.js";
import { getLogStream, type LogLine } from "./logstream.js";
import { TaskQueue } from "./queue.js";
import { log } from "./log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startDashboard(cwd: string, port: number = 3120): http.Server {
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
		// CORS headers for all responses
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
		res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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

		// ── SSE: live log stream ──────────────────────────
		if (url.pathname === "/api/logs") {
			res.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				"Connection": "keep-alive",
			});

			const logStream = getLogStream();

			// Send buffered lines for catch-up
			for (const line of logStream.getBuffer()) {
				res.write(`data: ${JSON.stringify(line)}\n\n`);
			}

			// Subscribe to new lines
			const onLine = (line: LogLine) => {
				res.write(`data: ${JSON.stringify(line)}\n\n`);
			};
			logStream.on("line", onLine);

			// Cleanup on disconnect
			req.on("close", () => {
				logStream.removeListener("line", onLine);
			});
			return; // keep connection open
		}

		// ── JSON APIs: read-only ──────────────────────────
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

		// ── Queue mutations ───────────────────────────────
		if (req.method === "POST" && url.pathname === "/api/queue/add") {
			let body = "";
			req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
			req.on("end", () => {
				try {
					const { goal, engine, quick, dependsOn } = JSON.parse(body);
					if (!goal || typeof goal !== "string") {
						res.writeHead(400, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ error: "goal is required" }));
						return;
					}
					const queue = new TaskQueue(cwd);
					const task = queue.add(goal, { quick: !!quick }, { engine, dependsOn });
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify(task));
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

		// ── 404 ───────────────────────────────────────────
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Not found" }));
	});

	server.listen(port, () => {
		log.info("dashboard", `Dashboard running at http://localhost:${port}`);
		log.info("dashboard", `API: /api/history, /api/stats, /api/queue, /api/logs (SSE), /api/queue/add|remove|clear`);
	});

	return server;
}
