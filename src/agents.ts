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

export interface TeamAgentDef {
	name: string;
	role: string;
	description: string;
	model?: string;
	tools?: string[];
	/** Explicit skill names to activate (in addition to role-based auto-activation) */
	skills?: string[];
	thinkingLevel?: string;
	systemPrompt: string;
	source: "file" | "builtin";
}

/** Simple frontmatter parser — no yaml dependency needed */
function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
	const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
	if (!match) return { meta: {}, body: content };

	const meta: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0) {
			const key = line.slice(0, idx).trim();
			const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
			if (key && val) meta[key] = val;
		}
	}
	return { meta, body: match[2] };
}

function loadFromDir(dir: string): TeamAgentDef[] {
	if (!fs.existsSync(dir)) return [];
	const agents: TeamAgentDef[] = [];

	for (const file of fs.readdirSync(dir)) {
		if (!file.endsWith(".md")) continue;
		const filePath = path.join(dir, file);
		if (!fs.statSync(filePath).isFile()) continue;

		const { meta, body } = parseFrontmatter(fs.readFileSync(filePath, "utf-8"));
		if (!meta.name) continue;

		agents.push({
			name: meta.name,
			role: meta.role ?? "custom",
			description: meta.description ?? "",
			model: meta.model,
			tools: meta.tools?.split(",").map(s => s.trim()).filter(Boolean),
			skills: meta.skills?.split(",").map(s => s.trim()).filter(Boolean),
			thinkingLevel: meta.thinking,
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
