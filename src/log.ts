/**
 * AWSL — colored logger with role-based styling.
 */

const COLORS: Record<string, string> = {
	planner: "\x1b[35m",
	architect: "\x1b[34m",
	coder: "\x1b[32m",
	reviewer: "\x1b[33m",
	tester: "\x1b[36m",
	conductor: "\x1b[37m\x1b[1m",
	guardian: "\x1b[31m\x1b[1m",
	git: "\x1b[90m",
	hook: "\x1b[90m",
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[90m";

function ts(): string {
	return new Date().toISOString().slice(11, 23);
}

function color(name: string): string {
	return COLORS[name] || "\x1b[37m";
}

export const log = {
	/** When true, suppress all console output (TUI mode). */
	_muted: false,

	mute()   { this._muted = true; },
	unmute() { this._muted = false; },

	info(source: string, msg: string) {
		if (this._muted) return;
		console.error(`${DIM}[${ts()}]${RESET} ${color(source)}[${source}]${RESET} ${msg}`);
	},
	warn(source: string, msg: string) {
		if (this._muted) return;
		console.error(`\x1b[33m[${ts()}]${RESET} ${color(source)}[${source}]${RESET} ${msg}`);
	},
	error(source: string, msg: string) {
		if (this._muted) return;
		console.error(`\x1b[31m[${ts()}]${RESET} ${color(source)}[${source}]${RESET} \x1b[31m${msg}${RESET}`);
	},
	debug(source: string, msg: string) {
		if (this._muted) return;
		if (process.env.DEBUG) {
			console.error(`${DIM}[${ts()}] [${source}] ${msg}${RESET}`);
		}
	},
	section(title: string) {
		if (this._muted) return;
		const line = "─".repeat(60);
		console.error(`\n${BOLD}${line}${RESET}`);
		console.error(`${BOLD}  ${title}${RESET}`);
		console.error(`${BOLD}${line}${RESET}\n`);
	},
};
