#!/usr/bin/env node
/**
 * AWSL Agent Core — CLI entry point.
 *
 * Hybrid mode (for CC skills — no API key needed):
 *   CC writes PLAN.md → awsl validate → WAVES.md → CC executes → awsl verify
 *
 * Full pipeline (terminal use):
 *   awsl run "Build a REST API"
 *
 * Install Claude Code skills:
 *   awsl init
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { loadAgents } from "./agents.js";
import { executeTeam } from "./orchestrator.js";
import { type Engine, detectEngine } from "./runner.js";
import { validatePlan } from "./validate.js";
import { runFullVerification, runStaticReview } from "./verify.js";
import { releaseLock, forceReleaseLock, checkLock, formatLockInfo } from "./lock.js";
import { RunContext } from "./context.js";
import { log } from "./log.js";
import { runInstaller } from "./install.js";
import { TaskQueue } from "./queue.js";
import { startDashboard, isPortInUse } from "./dashboard.js";
import { RemoteClient } from "./remote.js";

function usage() {
	console.error(`
  awsl — Multi-Agent Orchestration Engine
  Conductor (planning & parallelism) + Guardian (TDD & quality)

Commands:
  start [--port N]         Start all services (dashboard + remote if configured)
  stop                     Stop all services
  status                   Show status of all services
  init [--global]          Install skills into .claude/skills/
  validate                 Validate .planning/PLAN.md → compute waves → WAVES.md
  verify                   Run tests, lint, typecheck from PLAN.md verify fields
  review                   Static code review (no LLM) — detect any, secrets, missing tests
  lock                     Show current lock status
  unlock [--force]         Release lock (--force to override others' locks)
  run <goal>               Full pipeline (terminal)
  agents                   List available agents
  dashboard [--port N]     Open the sleep mode pixel dashboard (default: 3120)
  dashboard --bg           Start dashboard in background (detached)
  dashboard stop           Stop background dashboard
  remote init <url>        Connect to remote dashboard (one command setup)
  remote stop              Disconnect
  remote status            Check connection

CC Hybrid Mode (no API key needed):
  1. CC writes plan        → .planning/PLAN.md  (CC does the thinking)
  2. awsl validate         → .planning/WAVES.md (code: parse, validate, topo-sort)
  3. CC Agent tool         → execute tasks      (CC full power per task)
  4. awsl verify           → .planning/VERIFICATION.md (code: run tests/lint)
  5. awsl review           → .planning/REVIEW.md (static code review)

Queue Commands (sleep mode):
  queue add <goal> [opts]  Add a task to the queue (--at <time> --auto-push)
  queue plan <text> [opts] Parse natural language into multiple queue tasks
  queue list               List queue tasks and status
  queue show <id>          Show detailed info for a queue task
  queue remove <id>        Remove a task from queue
  queue start [opts]       Start executing the queue (foreground)
  queue start --once       One-shot: process runnable tasks and exit (used by scheduler)
  queue clear              Clear all queue tasks

Options:
  --cwd <path>             Working directory (default: .)
  --force                  Override existing lock

Terminal Full Pipeline (no API key needed with --engine claude-code/codex):
  run <goal>               Full autonomous pipeline — real agent teams
  --quick                  Skip brainstorm & research
  --model <provider:model> Default: anthropic:claude-sonnet-4-20250514
  --concurrency <n>        Default: 2
  --engine <type>          "claude-code", "codex", or "builtin"

Examples:
  awsl init --global
  awsl validate
  awsl verify
  awsl lock
  awsl unlock --force
`);
}

function parseCwdAndForce(args: string[]): { cwd: string; force: boolean } {
	let cwd = process.cwd();
	let force = false;
	for (let i = 1; i < args.length; i++) {
		if (args[i] === "--cwd" && i + 1 < args.length) {
			cwd = path.resolve(args[++i]);
		} else if (args[i] === "--force") {
			force = true;
		}
	}
	return { cwd, force };
}

/**
 * Parse a human-friendly time string into an ISO timestamp.
 * Supported formats:
 *   "03:00"            → today (or tomorrow if already past) at 03:00
 *   "2026-03-10 03:00" → absolute datetime
 *   "+30m"             → 30 minutes from now
 *   "+2h"              → 2 hours from now
 * Returns ISO string or null if unparseable.
 */
function parseTimeString(input: string): string | null {
	const trimmed = input.trim();

	// Relative: +Nm or +Nh
	const relMatch = trimmed.match(/^\+(\d+)(m|h)$/);
	if (relMatch) {
		const amount = parseInt(relMatch[1], 10);
		const unit = relMatch[2];
		const ms = unit === "h" ? amount * 3600000 : amount * 60000;
		return new Date(Date.now() + ms).toISOString();
	}

	// HH:MM only — today or tomorrow
	const timeOnlyMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
	if (timeOnlyMatch) {
		const h = parseInt(timeOnlyMatch[1], 10);
		const m = parseInt(timeOnlyMatch[2], 10);
		if (h > 23 || m > 59) return null;
		const d = new Date();
		d.setHours(h, m, 0, 0);
		if (d.getTime() <= Date.now()) {
			d.setDate(d.getDate() + 1); // already past → tomorrow
		}
		return d.toISOString();
	}

	// Full datetime — try native parsing
	const parsed = Date.parse(trimmed);
	if (!isNaN(parsed)) {
		return new Date(parsed).toISOString();
	}

	return null;
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
		usage();
		process.exit(0);
	}

	const command = args[0];

	// ── Init command ────────────────────────────────────────
	if (command === "init") {
		runInstaller();
		process.exit(0);
	}

	// ── Start command — boot all services ──────────────────
	if (command === "start") {
		const { cwd } = parseCwdAndForce(args);
		const planDir = path.join(cwd, ".planning");
		if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });

		let port = 3120;
		let serverUrl: string | undefined;
		let clientId: string | undefined;

		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--port" && i + 1 < args.length) { port = parseInt(args[++i], 10); }
			else if (args[i] === "--server" && i + 1 < args.length) { serverUrl = args[++i]; }
			else if (args[i] === "--id" && i + 1 < args.length) { clientId = args[++i]; }
			else if (args[i] === "--cwd" && i + 1 < args.length) { i++; }
		}

		// Load remote config if exists
		const configPath = path.join(planDir, "remote.json");
		try {
			if (fs.existsSync(configPath)) {
				const cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
				if (!serverUrl && cfg.serverUrl) serverUrl = cfg.serverUrl;
				if (!clientId && cfg.clientId) clientId = cfg.clientId;
			}
		} catch { /* ignore */ }

		// If --server provided, save/update config
		if (serverUrl) {
			const config: Record<string, string> = { serverUrl };
			if (clientId) config.clientId = clientId;
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
		}

		const { spawn } = await import("node:child_process");

		// 1. Start dashboard (background)
		const dashPidFile = path.join(planDir, ".dashboard.pid");
		let dashAlive = false;
		if (fs.existsSync(dashPidFile)) {
			const old = parseInt(fs.readFileSync(dashPidFile, "utf-8").trim(), 10);
			try { process.kill(old, 0); dashAlive = true; } catch { fs.unlinkSync(dashPidFile); }
		}

		if (dashAlive) {
			console.log(`  Dashboard: already running`);
		} else {
			if (await isPortInUse(port)) {
				console.log(`  Dashboard: port ${port} in use, skipping (use --port to change)`);
			} else {
				const dashArgs = [process.argv[1], "dashboard", "--port", String(port), "--cwd", cwd];
				const dashChild = spawn(process.execPath, dashArgs, { detached: true, stdio: "ignore", cwd });
				dashChild.unref();
				fs.writeFileSync(dashPidFile, String(dashChild.pid));
				console.log(`  Dashboard: started (pid ${dashChild.pid}) → http://localhost:${port}`);
			}
		}

		// 2. Start remote connection (if configured)
		const remotePidFile = path.join(planDir, ".remote.pid");
		if (serverUrl) {
			let remoteAlive = false;
			if (fs.existsSync(remotePidFile)) {
				const old = parseInt(fs.readFileSync(remotePidFile, "utf-8").trim(), 10);
				try { process.kill(old, 0); remoteAlive = true; } catch { fs.unlinkSync(remotePidFile); }
			}

			if (remoteAlive) {
				console.log(`  Remote:    already connected`);
			} else {
				const remoteArgs = [process.argv[1], "remote", "connect", serverUrl, "--cwd", cwd];
				if (clientId) remoteArgs.push("--id", clientId);
				const remoteChild = spawn(process.execPath, remoteArgs, { detached: true, stdio: "ignore" });
				remoteChild.unref();
				fs.writeFileSync(remotePidFile, String(remoteChild.pid));
				console.log(`  Remote:    connected to ${serverUrl} (pid ${remoteChild.pid})`);
			}
		} else {
			console.log(`  Remote:    not configured (use --server <url> or awsl remote init <url>)`);
		}

		console.log(`\n  awsl status  — check services`);
		console.log(`  awsl stop    — stop all`);
		process.exit(0);
	}

	// ── Stop command — stop all services ───────────────────
	if (command === "stop") {
		const { cwd } = parseCwdAndForce(args);
		const planDir = path.join(cwd, ".planning");

		const killPid = (pidFile: string, label: string) => {
			try {
				const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
				process.kill(pid);
				fs.unlinkSync(pidFile);
				console.log(`  ${label}: stopped (pid ${pid})`);
			} catch {
				try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
				console.log(`  ${label}: not running`);
			}
		};

		killPid(path.join(planDir, ".dashboard.pid"), "Dashboard");
		killPid(path.join(planDir, ".remote.pid"), "Remote   ");
		process.exit(0);
	}

	// ── Status command — show service status ───────────────
	if (command === "status") {
		const { cwd } = parseCwdAndForce(args);
		const planDir = path.join(cwd, ".planning");

		const checkPid = (pidFile: string): { running: boolean; pid: number | null } => {
			try {
				const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
				process.kill(pid, 0);
				return { running: true, pid };
			} catch {
				return { running: false, pid: null };
			}
		};

		console.log();
		const dash = checkPid(path.join(planDir, ".dashboard.pid"));
		console.log(`  Dashboard: ${dash.running ? `running (pid ${dash.pid})` : "stopped"}`);

		const remote = checkPid(path.join(planDir, ".remote.pid"));
		const configPath = path.join(planDir, "remote.json");
		let serverUrl: string | undefined;
		try {
			if (fs.existsSync(configPath)) {
				serverUrl = JSON.parse(fs.readFileSync(configPath, "utf-8")).serverUrl;
			}
		} catch { /* ignore */ }

		if (remote.running) {
			console.log(`  Remote:    connected (pid ${remote.pid})${serverUrl ? ` → ${serverUrl}` : ""}`);
		} else if (serverUrl) {
			console.log(`  Remote:    stopped (configured: ${serverUrl})`);
		} else {
			console.log(`  Remote:    not configured`);
		}
		console.log();
		process.exit(0);
	}

	// ── Agents command ──────────────────────────────────────
	if (command === "agents") {
		const cwd = process.cwd();
		const agentsDirs = [path.join(cwd, "agents")];
		const agents = loadAgents(agentsDirs);
		console.log("Available agents:\n");
		for (const a of agents) {
			console.log(`  ${a.name} (${a.role}) [${a.source}]`);
			console.log(`    ${a.description}`);
			if (a.tools) console.log(`    tools: ${a.tools.join(", ")}`);
			if (a.skills) console.log(`    skills: ${a.skills.join(", ")}`);
			if (a.model) console.log(`    model: ${a.model}`);
			console.log();
		}
		process.exit(0);
	}

	// ── Lock status command ─────────────────────────────────
	if (command === "lock") {
		const { cwd } = parseCwdAndForce(args);
		const info = checkLock(cwd);
		if (info) {
			console.log(formatLockInfo(info));
		} else {
			console.log("No active lock. Project is available.");
		}
		process.exit(0);
	}

	// ── Unlock command ──────────────────────────────────────
	if (command === "unlock") {
		const { cwd, force } = parseCwdAndForce(args);
		if (force) {
			forceReleaseLock(cwd);
			console.log("Lock force-released.");
		} else {
			const released = releaseLock(cwd);
			if (released) {
				console.log("Lock released.");
			} else {
				console.error("Could not release lock (owned by another process). Use --force.");
				process.exit(1);
			}
		}
		process.exit(0);
	}

	// ── Validate command (pure code, no API key) ────────────
	if (command === "validate") {
		const { cwd, force } = parseCwdAndForce(args);

		// Acquire lock via RunContext
		let ctx: RunContext;
		try {
			ctx = RunContext.acquire(cwd, { description: "validate", force });
		} catch (e) {
			console.error(e instanceof Error ? e.message : String(e));
			process.exit(1);
		}

		try {
			const result = validatePlan(cwd);

			console.log("\n" + "=".repeat(60));
			if (result.success) {
				console.log(`Validation: OK — ${result.tasks.length} tasks in ${result.waves.length} waves`);
				for (let i = 0; i < result.waves.length; i++) {
					console.log(`  Wave ${i + 1}: ${result.waves[i].join(", ")}`);
				}
			} else {
				console.log(`Validation: FAILED`);
				for (const e of result.errors) console.log(`  ERROR: ${e}`);
			}
			if (result.warnings.length > 0) {
				for (const w of result.warnings) console.log(`  WARN: ${w}`);
			}
			console.log("=".repeat(60));

			console.log("\n__VALIDATE_JSON_START__");
			console.log(JSON.stringify({
				success: result.success,
				taskCount: result.tasks.length,
				waveCount: result.waves.length,
				waves: result.waves,
				errors: result.errors,
				warnings: result.warnings,
			}, null, 2));
			console.log("__VALIDATE_JSON_END__");

			// Keep lock if validation succeeded (CC will execute next)
			// Release lock if validation failed (nothing to execute)
			if (!result.success) {
				ctx.release();
			}

			process.exit(result.success ? 0 : 1);
		} catch (e) {
			ctx.release();
			throw e;
		}
	}

	// ── Review command (static code review, no API key) ─────
	if (command === "review") {
		const { cwd } = parseCwdAndForce(args);

		const result = runStaticReview(cwd);

		console.log("\n" + "=".repeat(60));
		console.log(result.summary);
		if (!result.passed) {
			console.log("\nCritical findings:");
			for (const f of result.findings.filter(f => f.severity === "critical")) {
				console.log(`  ${f.file}:${f.line} [${f.rule}] ${f.message}`);
			}
		}
		console.log("=".repeat(60));

		console.log("\n__REVIEW_JSON_START__");
		console.log(JSON.stringify({
			passed: result.passed,
			criticalCount: result.findings.filter(f => f.severity === "critical").length,
			warningCount: result.findings.filter(f => f.severity === "warning").length,
			findings: result.findings.slice(0, 50),
		}, null, 2));
		console.log("__REVIEW_JSON_END__");

		process.exit(result.passed ? 0 : 1);
	}

	// ── Verify command (pure code, no API key) ──────────────
	if (command === "verify") {
		const { cwd } = parseCwdAndForce(args);

		const result = await runFullVerification(cwd);

		console.log("\n" + "=".repeat(60));
		console.log(result.summary);
		console.log("=".repeat(60));

		console.log("\n__VERIFY_JSON_START__");
		console.log(JSON.stringify({
			passed: result.passed,
			items: result.items.map(i => ({ taskId: i.taskId, command: i.command, passed: i.passed })),
			generalChecks: result.generalChecks.map(i => ({ taskId: i.taskId, command: i.command, passed: i.passed })),
		}, null, 2));
		console.log("__VERIFY_JSON_END__");

		// Release lock after verify (end of pipeline)
		releaseLock(cwd);

		process.exit(result.passed ? 0 : 1);
	}

	// ── Dashboard command ───────────────────────────────────
	if (command === "dashboard") {
		const { cwd } = parseCwdAndForce(args);
		const subCmd = args[1];
		let port = 3120;
		let host = '127.0.0.1';
		let bg = false;
		for (let i = 1; i < args.length; i++) {
			if (args[i] === "--port" && i + 1 < args.length) {
				port = parseInt(args[++i], 10);
			} else if (args[i] === "--host" && i + 1 < args.length) {
				host = args[++i];
			} else if (args[i] === "--bg") {
				bg = true;
			}
		}

		// ── dashboard stop ──
		if (subCmd === "stop") {
			const pidFile = path.join(cwd, ".planning", ".dashboard.pid");
			try {
				const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
				process.kill(pid);
				fs.unlinkSync(pidFile);
				console.log(`Dashboard stopped (pid ${pid}).`);
			} catch {
				console.error("No running dashboard found.");
				process.exit(1);
			}
			process.exit(0);
		}

		// ── dashboard --bg ──
		if (bg) {
			// Check if already running via PID file
			const pidFile = path.join(cwd, ".planning", ".dashboard.pid");
			if (fs.existsSync(pidFile)) {
				const existingPid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
				try {
					process.kill(existingPid, 0); // signal 0 = just check if alive
					console.error(`Dashboard is already running (pid ${existingPid}).`);
					console.error(`  Stop it first: awsl dashboard stop`);
					process.exit(1);
				} catch {
					// Process not running, clean up stale PID file
					fs.unlinkSync(pidFile);
				}
			}

			// Check port availability
			if (await isPortInUse(port)) {
				console.error(`Port ${port} is already in use. Use --port to specify another port.`);
				process.exit(1);
			}

			const { spawn } = await import("node:child_process");
			const selfArgs = [process.argv[1], "dashboard", "--port", String(port), "--host", host, "--cwd", cwd];
			const child = spawn(process.execPath, selfArgs, {
				detached: true,
				stdio: "ignore",
				cwd,
			});
			child.unref();

			// Save PID for stop command
			const planDir = path.join(cwd, ".planning");
			if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
			fs.writeFileSync(path.join(planDir, ".dashboard.pid"), String(child.pid));

			console.log(`Dashboard started in background (pid ${child.pid}).`);
			console.log(`  http://${host}:${port}`);
			console.log(`  Stop: awsl dashboard stop`);
			process.exit(0);
		}

		startDashboard(cwd, port, host);
		// Keep server running — don't call process.exit()
		return;
	}

	// ── Remote command (relay client) ─────────────────────
	if (command === "remote") {
		const subCmd = args[1];
		const { cwd } = parseCwdAndForce(args);
		const planDir = path.join(cwd, ".planning");
		const configPath = path.join(planDir, "remote.json");
		const pidFile = path.join(planDir, ".remote.pid");

		const loadConfig = (): { serverUrl?: string; clientId?: string } => {
			try {
				if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, "utf-8"));
			} catch { /* ignore */ }
			return {};
		};

		const spawnBg = async (serverUrl: string, clientId?: string) => {
			// Kill existing if running
			if (fs.existsSync(pidFile)) {
				const old = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
				try { process.kill(old); } catch { /* dead already */ }
				try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
			}

			const { spawn } = await import("node:child_process");
			const selfArgs = [process.argv[1], "remote", "connect", serverUrl, "--cwd", cwd];
			if (clientId) selfArgs.push("--id", clientId);

			const child = spawn(process.execPath, selfArgs, { detached: true, stdio: "ignore" });
			child.unref();

			if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
			fs.writeFileSync(pidFile, String(child.pid));
			return child.pid;
		};

		// ── remote init <url> — save config + start background ──
		if (subCmd === "init") {
			let serverUrl: string | undefined;
			let clientId: string | undefined;

			for (let i = 2; i < args.length; i++) {
				const a = args[i];
				if (a === "--id" && i + 1 < args.length) { clientId = args[++i]; }
				else if (a === "--cwd" && i + 1 < args.length) { i++; }
				else if (!a.startsWith("--")) { serverUrl = a; }
			}

			if (!serverUrl) {
				console.error("Usage: awsl remote init <server-url> [--id <name>]");
				console.error("  awsl remote init http://192.168.1.100:3120");
				console.error("  awsl remote init http://192.168.1.100:3120 --id my-laptop");
				process.exit(1);
			}

			if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });
			const config: Record<string, string> = { serverUrl };
			if (clientId) config.clientId = clientId;
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

			const pid = await spawnBg(serverUrl, clientId);

			console.log(`Done! Remote client running (pid ${pid}).`);
			console.log(`  Server: ${serverUrl}`);
			if (clientId) console.log(`  ID:     ${clientId}`);
			console.log(`  Config: ${configPath}`);
			console.log(`\n  awsl remote status   — check status`);
			console.log(`  awsl remote stop     — disconnect`);
			process.exit(0);
		}

		// ── remote connect [url] — foreground (used by --bg spawn) or manual ──
		if (subCmd === "connect") {
			const config = loadConfig();
			let serverUrl: string | undefined;
			let clientId: string | undefined;

			for (let i = 2; i < args.length; i++) {
				const a = args[i];
				if (a === "--id" && i + 1 < args.length) { clientId = args[++i]; }
				else if (a === "--cwd" && i + 1 < args.length) { i++; }
				else if (!a.startsWith("--")) { serverUrl = a; }
			}

			serverUrl = serverUrl ?? config.serverUrl;
			clientId = clientId ?? config.clientId;

			if (!serverUrl) {
				console.error("Not configured. Run:");
				console.error("  awsl remote init http://server:3120");
				process.exit(1);
			}

			const client = new RemoteClient({ serverUrl, clientId, cwd });

			const shutdown = () => { client.stop(); process.exit(0); };
			process.on("SIGINT", shutdown);
			process.on("SIGTERM", shutdown);

			client.connect();
			return;
		}

		// ── remote stop ──
		if (subCmd === "stop") {
			try {
				const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
				process.kill(pid);
				fs.unlinkSync(pidFile);
				console.log(`Stopped (pid ${pid}).`);
			} catch {
				console.error("Not running.");
				process.exit(1);
			}
			process.exit(0);
		}

		// ── remote status ──
		if (subCmd === "status") {
			const config = loadConfig();
			let running = false;
			let pid: number | null = null;
			try {
				pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
				process.kill(pid, 0);
				running = true;
			} catch { /* not running */ }

			if (!config.serverUrl) {
				console.log("Not configured. Run: awsl remote init http://server:3120");
			} else {
				console.log(`Server: ${config.serverUrl}`);
				if (config.clientId) console.log(`ID:     ${config.clientId}`);
				console.log(`Status: ${running ? `\u2713 running (pid ${pid})` : "\u2717 stopped"}`);
			}
			process.exit(0);
		}

		console.error("Commands: init <url>, stop, status");
		process.exit(1);
	}

	// ── Queue command (sleep mode) ─────────────────────────
	if (command === "queue") {
		const subCmd = args[1];
		const { cwd } = parseCwdAndForce(args);
		const queue = new TaskQueue(cwd);

		if (subCmd === "add") {
			// Parse options from args starting at index 2
			let engine: Engine | undefined;
			let quick = false;
			let autoPush = false;
			let concurrency: number | undefined;
			let model: string | undefined;
			let dependsOn: string[] | undefined;
			let agentsDirs: string[] | undefined;
			let runAt: string | undefined;
			const goalParts: string[] = [];

			for (let i = 2; i < args.length; i++) {
				const a = args[i];
				if (a === "--engine" && i + 1 < args.length) { engine = args[++i] as Engine; }
				else if (a === "--quick") { quick = true; }
				else if (a === "--auto-push") { autoPush = true; }
				else if (a === "--concurrency" && i + 1 < args.length) { concurrency = parseInt(args[++i], 10); }
				else if (a === "--model" && i + 1 < args.length) { model = args[++i]; }
				else if (a === "--depends-on" && i + 1 < args.length) { dependsOn = args[++i].split(",").map(s => s.trim()); }
				else if (a === "--at" && i + 1 < args.length) { runAt = args[++i]; }
				else if (a === "--agents-dir" && i + 1 < args.length) {
					agentsDirs = agentsDirs ?? [];
					agentsDirs.push(path.resolve(args[++i]));
				}
				else if (a === "--cwd" && i + 1 < args.length) { i++; } // skip, already parsed
				else if (a === "--force") { /* skip */ }
				else if (!a.startsWith("--")) { goalParts.push(a); }
			}

			const goal = goalParts.join(" ").trim();
			if (!goal) {
				console.error("Usage: awsl queue add <goal> [--quick] [--engine <type>] [--at <time>] [--auto-push]");
				process.exit(1);
			}

			// Parse --at time string into ISO
			let resolvedRunAt: string | undefined;
			if (runAt) {
				const parsed = parseTimeString(runAt);
				if (!parsed) {
					console.error(`Invalid time format: "${runAt}". Use HH:MM, YYYY-MM-DD HH:MM, or +Nm/+Nh.`);
					process.exit(1);
				}
				resolvedRunAt = parsed;
			}

			const task = queue.add(goal, {
				model,
				concurrency,
				quick,
				agentsDirs,
				autoPush,
			}, { engine, dependsOn, runAt: resolvedRunAt });

			console.log(`Added: ${task.id} — "${goal}"`);
			if (dependsOn) console.log(`  Depends on: ${dependsOn.join(", ")}`);
			if (quick) console.log(`  Mode: quick`);
			if (autoPush) console.log(`  Auto-push: enabled`);
			if (engine) console.log(`  Engine: ${engine}`);
			if (resolvedRunAt) console.log(`  Run at: ${new Date(resolvedRunAt).toLocaleString()}`);
		}
		else if (subCmd === "plan") {
			// Parse options
			let engine: Engine | undefined;
			let quick = false;
			let concurrency: number | undefined;
			let model: string | undefined;
			const descParts: string[] = [];

			for (let i = 2; i < args.length; i++) {
				const a = args[i];
				if (a === "--engine" && i + 1 < args.length) { engine = args[++i] as Engine; }
				else if (a === "--quick") { quick = true; }
				else if (a === "--concurrency" && i + 1 < args.length) { concurrency = parseInt(args[++i], 10); }
				else if (a === "--model" && i + 1 < args.length) { model = args[++i]; }
				else if (a === "--cwd" && i + 1 < args.length) { i++; }
				else if (a === "--force") { /* skip */ }
				else if (!a.startsWith("--")) { descParts.push(a); }
			}

			const description = descParts.join(" ").trim();
			if (!description) {
				console.error('Usage: awsl queue plan "先构建认证，然后加支付，最后写测试" [--engine claude-code|codex]');
				process.exit(1);
			}

			console.log("Parsing tasks from natural language...\n");
			const added = await queue.plan(description, { engine, quick, concurrency, model });

			console.log(`\nPlanned ${added.length} task(s):\n`);
			console.log("  ID       Deps       Goal");
			console.log("  " + "-".repeat(60));
			for (const t of added) {
				const deps = t.dependsOn?.length ? t.dependsOn.join(",") : "(none)";
				const goal = t.goal.length > 40 ? t.goal.slice(0, 37) + "..." : t.goal;
				console.log(`  ${t.id.padEnd(8)} ${deps.padEnd(10)} ${goal}`);
			}
			console.log(`\nRun 'awsl queue list' to review, then 'awsl queue start' to execute.`);
		}
		else if (subCmd === "list") {
			const tasks = queue.list();
			if (tasks.length === 0) {
				console.log("Queue is empty.");
			} else {
				console.log(`\nQueue: ${tasks.length} task(s)\n`);
				console.log("  ID       Status    Goal");
				console.log("  " + "-".repeat(56));
				for (const t of tasks) {
					const status = t.status.padEnd(9);
					const goal = t.goal.length > 40 ? t.goal.slice(0, 37) + "..." : t.goal;
					console.log(`  ${t.id.padEnd(8)} ${status} ${goal}`);
					if (t.dependsOn?.length) console.log(`           deps: ${t.dependsOn.join(", ")}`);
					if (t.runAt) console.log(`           run at: ${new Date(t.runAt).toLocaleString()}`);
					if (t.error) console.log(`           error: ${t.error.slice(0, 60)}`);
				}
				console.log();
			}
		}
		else if (subCmd === "show") {
			const id = args[2];
			if (!id) {
				console.error("Usage: awsl queue show <id>");
				process.exit(1);
			}
			const task = queue.get(id);
			if (!task) {
				console.error(`Task not found: ${id}`);
				process.exit(1);
			}

			// Format duration
			const formatDuration = (ms: number): string => {
				if (ms < 1000) return `${ms}ms`;
				const s = Math.floor(ms / 1000);
				if (s < 60) return `${s}s`;
				const m = Math.floor(s / 60);
				const rs = s % 60;
				return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
			};

			const statusIcon = task.status === "done" ? "[OK]" : task.status === "failed" ? "[FAIL]" : `[${task.status.toUpperCase()}]`;

			console.log(`\n  ${statusIcon} ${task.id}\n`);
			console.log(`  Goal:       ${task.goal}`);
			console.log(`  Status:     ${task.status}`);
			if (task.engine) console.log(`  Engine:     ${task.engine}`);
			if (task.runAt) console.log(`  Run at:     ${new Date(task.runAt).toLocaleString()}`);
			if (task.dependsOn?.length) console.log(`  Depends on: ${task.dependsOn.join(", ")}`);

			// Options
			const opts: string[] = [];
			if (task.options.quick) opts.push("quick");
			if (task.options.model) opts.push(`model=${task.options.model}`);
			if (task.options.concurrency) opts.push(`concurrency=${task.options.concurrency}`);
			if (opts.length > 0) console.log(`  Options:    ${opts.join(", ")}`);

			// Timestamps
			console.log();
			if (task.scheduledAt) console.log(`  Scheduled:  ${task.scheduledAt}`);
			if (task.startedAt)   console.log(`  Started:    ${task.startedAt}`);
			if (task.completedAt) console.log(`  Completed:  ${task.completedAt}`);
			if (task.startedAt && task.completedAt) {
				const duration = Date.parse(task.completedAt) - Date.parse(task.startedAt);
				console.log(`  Duration:   ${formatDuration(duration)}`);
			}

			// Result
			if (task.result) {
				console.log(`\n  Result:     ${task.result.success ? "SUCCESS" : "FAILED"}`);
				console.log(`  Summary:    ${task.result.summary}`);
			}

			// Error (full, not truncated)
			if (task.error) {
				console.log(`\n  Error:`);
				for (const line of task.error.split("\n")) {
					console.log(`    ${line}`);
				}
			}
			console.log();
		}
		else if (subCmd === "remove") {
			const id = args[2];
			if (!id) {
				console.error("Usage: awsl queue remove <id>");
				process.exit(1);
			}
			const removed = queue.remove(id);
			if (removed) {
				console.log(`Removed: ${id}`);
			} else {
				console.error(`Task not found: ${id}`);
				process.exit(1);
			}
		}
		else if (subCmd === "start") {
			// Parse --engine, --once, --auto-push
			let engine: Engine | undefined;
			let once = false;
			let autoPush = false;
			for (let i = 2; i < args.length; i++) {
				if (args[i] === "--engine" && i + 1 < args.length) {
					engine = args[++i] as Engine;
				} else if (args[i] === "--once") {
					once = true;
				} else if (args[i] === "--auto-push") {
					autoPush = true;
				}
			}

			console.log(`Starting queue execution${once ? " (one-shot)" : ""}${autoPush ? " (auto-push)" : ""}...\n`);

			await queue.start(engine, { once, autoPush });
		}
		else if (subCmd === "clear") {
			queue.clear();
			console.log("Queue cleared.");
		}
		else {
			console.error("Unknown queue command. Use: add, plan, list, show, remove, start, clear");
			process.exit(1);
		}
		process.exit(0);
	}

	// ── Run command (full pipeline, terminal use) ───────────
	if (command !== "run") {
		if (!command.startsWith("-")) {
			args.unshift("run");
		} else {
			usage();
			process.exit(1);
		}
	}

	const runArgs = args.slice(1);

	let model = "anthropic:claude-sonnet-4-20250514";
	let agentsDirs: string[] = [];
	let concurrency = 2;
	let cwd = process.cwd();
	let quick = false;
	let planOnlyMode = false;
	let executePlan = false;
	let verify = true;
	let autoCommit = true;
	let force = false;
	let engine: Engine | undefined;
	const positional: string[] = [];

	for (let i = 0; i < runArgs.length; i++) {
		const arg = runArgs[i];
		if (arg === "--quick") {
			quick = true;
		} else if (arg === "--plan-only") {
			planOnlyMode = true;
		} else if (arg === "--execute-plan") {
			executePlan = true;
		} else if (arg === "--model" && i + 1 < runArgs.length) {
			model = runArgs[++i];
		} else if (arg === "--agents-dir" && i + 1 < runArgs.length) {
			agentsDirs.push(path.resolve(runArgs[++i]));
		} else if (arg === "--concurrency" && i + 1 < runArgs.length) {
			concurrency = parseInt(runArgs[++i], 10);
		} else if (arg === "--cwd" && i + 1 < runArgs.length) {
			cwd = path.resolve(runArgs[++i]);
		} else if (arg === "--no-verify") {
			verify = false;
		} else if (arg === "--no-commit") {
			autoCommit = false;
		} else if (arg === "--force") {
			force = true;
		} else if (arg === "--engine" && i + 1 < runArgs.length) {
			engine = runArgs[++i] as Engine;
		} else if (!arg.startsWith("--")) {
			positional.push(arg);
		}
	}

	// Acquire lock via RunContext
	let ctx: RunContext;
	try {
		ctx = RunContext.acquire(cwd, { description: positional.join(" ").slice(0, 60) || "run", force });
	} catch (e) {
		console.error(e instanceof Error ? e.message : String(e));
		process.exit(1);
	}

	agentsDirs.push(path.join(cwd, "agents"));
	const agents = loadAgents(agentsDirs);

	try {
		if (executePlan) {
			const planPath = path.join(cwd, ".planning", "PLAN.md");
			if (!fs.existsSync(planPath)) {
				console.error("No plan found at .planning/PLAN.md.");
				ctx.release();
				process.exit(1);
			}
			const planContent = fs.readFileSync(planPath, "utf-8");
			const goal = `Execute the following pre-approved plan:\n\n${planContent}`;
			const result = await executeTeam(goal, agents, cwd, model, concurrency, {
				brainstorm: false, research: false, verify, autoCommit,
				replan: true, qualityGate: true, engine: detectEngine(engine),
			});
			printResult(result);
			ctx.release();
			process.exit(result.success ? 0 : 1);
		}

		const goal = positional.join(" ").trim();
		if (!goal) {
			console.error("Please provide a goal. Example: awsl run \"Build a REST API\"");
			ctx.release();
			process.exit(1);
		}

		log.section(`GOAL: ${goal}`);
		const resolvedEngine = detectEngine(engine);
		log.info("conductor", `Engine: ${resolvedEngine} | Model: ${model} | Concurrency: ${concurrency}`);
		log.info("conductor", `Agents: ${agents.map(a => a.name).join(", ")}`);

		const result = await executeTeam(goal, agents, cwd, model, concurrency, {
			brainstorm: !quick && !planOnlyMode,
			research: !quick,
			verify: !planOnlyMode && verify,
			autoCommit: !planOnlyMode && autoCommit,
			replan: !planOnlyMode && !quick,
			qualityGate: !planOnlyMode,
			engine: resolvedEngine,
		});

		printResult(result);

		if (planOnlyMode) {
			console.log("\nPlan saved to .planning/PLAN.md");
			console.log("Run awsl run --execute-plan to proceed.\n");
		}

		ctx.release();
		process.exit(result.success ? 0 : 1);
	} catch (e) {
		ctx.release();
		throw e;
	}
}

function printResult(result: any) {
	console.log("\n" + "=".repeat(60));
	console.log(`Result: ${result.success ? "SUCCESS" : "PARTIAL"}`);
	console.log(`${result.summary}\n`);

	for (const task of result.tasks) {
		const icon = task.status === "verified" ? "[OK]" : task.status === "done" ? "[ok]" : "[FAIL]";
		console.log(`${icon} ${task.id} (${task.assignee}): ${task.description.slice(0, 80)}`);
		if (task.result) {
			const preview = task.result.length > 300
				? task.result.slice(0, 300) + "...[truncated]"
				: task.result;
			console.log(`  ${preview.split("\n").join("\n  ")}\n`);
		}
		if (task.error) {
			console.log(`  Error: ${task.error}\n`);
		}
	}

	const planFiles = result.planning?.list() ?? [];
	if (planFiles.length > 0) {
		console.log("=".repeat(60));
		console.log(`Artifacts: .planning/ (${planFiles.length} files)`);
	}
}

main().catch(err => {
	console.error("Fatal:", err);
	process.exit(1);
});
