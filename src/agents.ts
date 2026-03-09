/**
 * Agent definitions — markdown files with YAML frontmatter.
 *
 * Loads from:
 *   1. Built-in defaults
 *   2. --agents-dir CLI flag
 *   3. ./agents/ in working directory
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { log } from "./log.js";
import type { SandboxPolicy } from "./sandbox.js";

export interface TeamAgentDef {
	name: string;
	role: string;
	description: string;
	model?: string;
	tools?: string[];
	/** Explicit skill names to activate (in addition to role-based auto-activation) */
	skills?: string[];
	thinkingLevel?: string;
	/** Per-agent sandbox policy override (optional). */
	sandbox?: SandboxPolicy;
	systemPrompt: string;
	source: "file" | "builtin";
}

const AgentFrontmatterSchema = Type.Object({
	name: Type.String(),
	role: Type.Optional(Type.String()),
	description: Type.Optional(Type.String()),
	model: Type.Optional(Type.String()),
	tools: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
	skills: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
	thinking: Type.Optional(Type.Union([Type.String(), Type.Boolean(), Type.Number()])),
});

function normalizeStringArray(val: unknown): string[] {
	if (typeof val === "string") return val.split(",").map(s => s.trim()).filter(Boolean);
	if (Array.isArray(val)) return val as string[];
	return [];
}

/** Parse YAML frontmatter from agent markdown files */
function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
	// Normalize CRLF to LF for consistent parsing on Windows
	const normalized = content.replace(/\r\n/g, "\n");
	const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
	if (!match) return { meta: {}, body: content };

	try {
		const parsed = parseYaml(match[1]);
		const meta = (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> : {};
		return { meta, body: match[2] };
	} catch (err) {
		log.warn("agents", `YAML parse error: ${err instanceof Error ? err.message : String(err)}`);
		return { meta: {}, body: content };
	}
}

function loadFromDir(dir: string): TeamAgentDef[] {
	if (!fs.existsSync(dir)) return [];
	const agents: TeamAgentDef[] = [];

	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith(".md")) continue;
		const filePath = path.join(dir, file);
		if (!fs.statSync(filePath).isFile()) continue;

		const { meta, body } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
		if (typeof meta.name !== "string") continue;

		if (!Value.Check(AgentFrontmatterSchema, meta)) {
			for (const error of Value.Errors(AgentFrontmatterSchema, meta)) {
				log.warn("agents", `${file}: ${error.path} — ${error.message}`);
			}
			continue;
		}

		const tools = normalizeStringArray(meta.tools);
		const skills = normalizeStringArray(meta.skills);

		agents.push({
			name: meta.name,
			role: (typeof meta.role === "string" ? meta.role : undefined) ?? "custom",
			description: (typeof meta.description === "string" ? meta.description : undefined) ?? "",
			model: typeof meta.model === "string" ? meta.model : undefined,
			tools: tools.length > 0 ? tools : undefined,
			skills: skills.length > 0 ? skills : undefined,
			thinkingLevel: meta.thinking !== undefined ? String(meta.thinking) : undefined,
			systemPrompt: body.trim(),
			source: "file",
		});
	}
	return agents;
}

// ─── Built-in Agents ─────────────────────────────────────────────

const BUILTINS: TeamAgentDef[] = [
	{
		name: "planner",
		role: "planner",
		description: "Decomposes goals into structured tasks with verify criteria",
		source: "builtin",
		systemPrompt: `You decompose complex goals into concrete, verifiable subtasks.

## Output

You MUST call the "report" tool with status "done" and the result as a JSON string:

{
  "summary": "Brief description",
  "tasks": [
    {
      "id": "task_1",
      "name": "Short task name",
      "assignee": "agent_name",
      "dependencies": [],
      "files": ["src/auth.ts", "src/types.ts"],
      "action": "Detailed implementation instructions...",
      "verify": "npm test -- auth.test.ts",
      "done": "Login endpoint returns 200 with JWT token"
    }
  ]
}

Rules:
- Each task: unique id, clear action, valid assignee, files list, verify + done criteria
- Keep each task focused: ONE deliverable, max 2-3 files
- No dependencies = can run in parallel (maximize parallelism)
- Do NOT assign to "planner"
- "verify" = how to check the task (test command, manual check, etc.)
- "done" = definition of done — what must be true when complete
- "action" = specific instructions, not vague descriptions`,
	},
	{
		name: "architect",
		role: "architect",
		description: "Designs system architecture and interfaces",
		source: "builtin",
		systemPrompt: `You are a senior software architect.

- Design file structure and module boundaries
- Define interfaces and data models
- Make concrete, implementable decisions
- Use memory_write to store your design so other agents can read it
- Call "report" with your final design when done`,
	},
	{
		name: "coder",
		role: "coder",
		description: "Implements code from specifications",
		source: "builtin",
		systemPrompt: `You are a senior software engineer.

- Read the architect's design from shared memory (memory_read) first
- Write clean, complete, runnable code using write/edit tools
- Store key outputs in shared memory for the reviewer
- Call "report" when implementation is complete`,
	},
	{
		name: "reviewer",
		role: "reviewer",
		description: "Reviews code for bugs, security, and quality",
		source: "builtin",
		systemPrompt: `You are a code reviewer.

- Read code from shared memory or files
- Check for bugs, security issues, and maintainability
- Provide specific, actionable feedback
- Call "report" with your findings`,
	},
	{
		name: "tester",
		role: "tester",
		description: "Designs and runs tests",
		source: "builtin",
		systemPrompt: `You are a QA engineer.

- Read implementation from shared memory or files
- Design test cases: happy paths, edge cases, errors
- Write test code using write tool
- Call "report" with test results`,
	},
];

export function loadAgents(dirs: string[]): TeamAgentDef[] {
	const agentMap = new Map<string, TeamAgentDef>();

	// Built-ins first
	for (const a of BUILTINS) agentMap.set(a.name, a);
	// File overrides (later dirs win)
	for (const dir of dirs) {
		for (const a of loadFromDir(dir)) agentMap.set(a.name, a);
	}

	return [...agentMap.values()];
}
