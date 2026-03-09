/**
 * Dashboard — simple HTTP server for the pixel art dashboard.
 *
 * Serves the dashboard HTML and provides JSON API endpoints
 * for history, stats, and queue data.
 */

import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHistory, getHistoryStats } from "./history.js";
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
		// CORS headers
		res.setHeader("Access-Control-Allow-Origin", "*");
		res.setHeader("Access-Control-Allow-Methods", "GET");

		const url = new URL(req.url ?? "/", `http://localhost:${port}`);

		if (url.pathname === "/" || url.pathname === "/dashboard") {
			res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
			res.end(dashboardHtml);
		} else if (url.pathname === "/api/history") {
			const data = loadHistory(cwd);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(data));
		} else if (url.pathname === "/api/stats") {
			const data = loadHistory(cwd);
			const stats = getHistoryStats(data);
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(stats));
		} else if (url.pathname === "/api/queue") {
			// Read queue file directly
			const queuePath = path.join(cwd, ".planning", "QUEUE.json");
			try {
				const queueData = fs.readFileSync(queuePath, "utf-8");
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(queueData);
			} catch {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify({ tasks: [] }));
			}
		} else {
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Not found" }));
		}
	});

	server.listen(port, () => {
		log.info("dashboard", `Dashboard running at http://localhost:${port}`);
		log.info("dashboard", `API: /api/history, /api/stats, /api/queue`);
	});

	return server;
}
