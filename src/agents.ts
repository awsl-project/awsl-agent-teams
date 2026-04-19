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
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { log } from "./log.js";
import type { SandboxPolicy } from "./sandbox.js";

export interface TeamAgentDef {
	name: string;
	role: string;
	description: string;
	model?: string;
	/** Per-agent execution engine override. When set, this agent uses the specified engine regardless of global setting. */
	engine?: "claude-code" | "codex" | "builtin";
	/** API base URL override (e.g. GLM's Anthropic-compatible endpoint). */
	baseUrl?: string;
	/** API key override. Use "env:VAR_NAME" to read from environment variable. */
	apiKey?: string;
	tools?: string[];
	/** Explicit skill names to activate (in addition to role-based auto-activation) */
	skills?: string[];
	thinkingLevel?: string;
	/** Per-agent sandbox policy override (optional). */
	sandbox?: SandboxPolicy;
	systemPrompt: string;
	source: "file" | "builtin";
}

/** Resolve "env:VAR_NAME" to actual value from process.env. */
export function resolveEnvValue(val: string | undefined): string | undefined {
	if (!val) return undefined;
	if (val.startsWith("env:")) {
		const envName = val.slice(4);
		return process.env[envName];
	}
	return val;
}

const VALID_ENGINES = ["claude-code", "codex", "builtin"] as const;

const AgentFrontmatterSchema = Type.Object({
	name: Type.String(),
	role: Type.Optional(Type.String()),
	description: Type.Optional(Type.String()),
	model: Type.Optional(Type.String()),
	engine: Type.Optional(Type.String()),
	baseUrl: Type.Optional(Type.String()),
	apiKey: Type.Optional(Type.String()),
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

		let engine: TeamAgentDef["engine"] | undefined;
		if (typeof meta.engine === "string" && meta.engine.length > 0) {
			if ((VALID_ENGINES as readonly string[]).includes(meta.engine)) {
				engine = meta.engine as TeamAgentDef["engine"];
			} else {
				// Typos (e.g. "claud-code", "CodeX") used to silently fall back to the
				// global default. Warn so users catch them quickly — matches the CLI
				// --engine flag's strict validation.
				log.warn("agents", `${file}: invalid engine "${meta.engine}" (expected ${VALID_ENGINES.join(" | ")}) — falling back to default`);
			}
		}

		agents.push({
			name: meta.name,
			role: (typeof meta.role === "string" ? meta.role : undefined) ?? "custom",
			description: (typeof meta.description === "string" ? meta.description : undefined) ?? "",
			model: typeof meta.model === "string" ? meta.model : undefined,
			engine,
			baseUrl: typeof meta.baseUrl === "string" ? meta.baseUrl : undefined,
			apiKey: typeof meta.apiKey === "string" ? meta.apiKey : undefined,
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

export const BUILTINS: readonly TeamAgentDef[] = Object.freeze([
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
- No dependencies = can run in parallel (maximize parallelism!)
- Multiple tasks CAN use the same agent — e.g. 3 coder tasks with no dependencies run in parallel as 3 separate agent instances
- CRITICAL: parallel tasks (no dependency between them) MUST NOT share files — each task's "files" list must be disjoint to avoid write conflicts. If two tasks need the same file, add a dependency between them
- Do NOT assign to "planner"
- "verify" = how to check the task (test command, manual check, etc.)
- "done" = definition of done — what must be true when complete
- "action" = specific instructions, not vague descriptions

Agent assignment guidelines:
- Use "architect" for design tasks: API contracts, data models, interface definitions, module boundaries
- Use "coder" for all implementation tasks — coder has the Agent tool and can parallelize frontend/backend internally
- Use "reviewer" for code review tasks
- Use "tester" for test writing tasks
- Assign architect tasks EARLY (wave 1) so coders can read the design from shared memory
- Split by FEATURE MODULE, not by frontend/backend — each coder task handles one complete feature across all layers`,
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
		description: "Full-stack developer with sub-agent parallelism",
		source: "builtin",
		tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "Agent"],
		systemPrompt: `You are a senior full-stack developer.

- Read the architect's design from shared memory (memory_read) first
- Write clean, complete, runnable code using write/edit tools
- Store key outputs in shared memory for the reviewer
- Call "report" when implementation is complete

## Parallelism

You have the Agent tool. When your task involves multiple independent changes (e.g. frontend + backend, or multiple files), use the Agent tool to spawn parallel sub-agents:
- Each sub-agent should work on a SEPARATE set of files to avoid conflicts
- Launch multiple agents in a single message for true parallelism
- Use sub-agents for independent work; do sequential work yourself
- Example: spawn one agent for HTML/CSS changes and another for TypeScript API changes`,
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
]) as readonly TeamAgentDef[];

const AGENT_NAME_RE = /^[a-z][a-z0-9-]*$/;
const AGENT_NAME_MAX = 50;

/** Serialize a TeamAgentDef back to frontmatter+markdown format. */
export function serializeAgent(agent: TeamAgentDef): string {
	const fm: Record<string, unknown> = {
		name: agent.name,
		role: agent.role,
		description: agent.description,
	};
	if (agent.model !== undefined) fm.model = agent.model;
	if (agent.engine !== undefined) fm.engine = agent.engine;
	if (agent.baseUrl !== undefined) fm.baseUrl = agent.baseUrl;
	if (agent.apiKey !== undefined) fm.apiKey = agent.apiKey;
	if (agent.tools !== undefined && agent.tools.length > 0) fm.tools = agent.tools;
	if (agent.skills !== undefined && agent.skills.length > 0) fm.skills = agent.skills;
	if (agent.thinkingLevel !== undefined) fm.thinking = agent.thinkingLevel;

	return `---\n${stringifyYaml(fm)}---\n${agent.systemPrompt}\n`;
}

/** Save an agent to a directory as {name}.md. Merges with existing file if present. */
export function saveAgent(dir: string, agent: Partial<TeamAgentDef> & { name: string }): TeamAgentDef {
	const { name } = agent;
	if (!name || !AGENT_NAME_RE.test(name) || name.length > AGENT_NAME_MAX) {
		throw new Error(`Invalid agent name "${name}": must match /^[a-z][a-z0-9-]*$/ and be at most ${AGENT_NAME_MAX} chars`);
	}

	fs.mkdirSync(dir, { recursive: true });

	const filePath = path.join(dir, `${name}.md`);
	const tmpPath = filePath + ".tmp";

	// Merge with existing if present
	let base: Partial<TeamAgentDef> = {};
	if (fs.existsSync(filePath)) {
		const existing = loadFromDir(dir).find(a => a.name === name);
		if (existing) base = existing;
	}

	const merged: TeamAgentDef = {
		name,
		role: agent.role ?? base.role ?? "custom",
		description: agent.description ?? base.description ?? "",
		model: agent.model ?? base.model,
		engine: agent.engine ?? base.engine,
		baseUrl: agent.baseUrl ?? base.baseUrl,
		apiKey: agent.apiKey ?? base.apiKey,
		tools: agent.tools ?? base.tools,
		skills: agent.skills ?? base.skills,
		thinkingLevel: agent.thinkingLevel ?? base.thinkingLevel,
		systemPrompt: agent.systemPrompt ?? base.systemPrompt ?? "",
		source: "file",
	};

	fs.writeFileSync(tmpPath, serializeAgent(merged), "utf-8");
	fs.renameSync(tmpPath, filePath);

	return merged;
}

/** Delete an agent file from a directory. Returns true if deleted, false if not found. */
export function deleteAgent(dir: string, name: string): boolean {
	if (!AGENT_NAME_RE.test(name) || name.length > AGENT_NAME_MAX) {
		throw new Error(`Invalid agent name "${name}": must match /^[a-z][a-z0-9-]*$/ and be at most ${AGENT_NAME_MAX} chars`);
	}
	const filePath = path.join(dir, `${name}.md`);
	if (!fs.existsSync(filePath)) return false;
	fs.unlinkSync(filePath);
	return true;
}

/** Get a single agent by name from loaded agents (builtins + dirs). */
export function getAgent(dirs: string[], name: string): TeamAgentDef | undefined {
	return loadAgents(dirs).find(a => a.name === name);
}

// ─── Prompt Templates ────────────────────────────────────────

/** Built-in role templates for quick agent creation. */
export const PROMPT_TEMPLATES: Record<string, { description: string; prompt: string }> = {
	coder: {
		description: "Full-stack developer with TDD focus",
		prompt: `You are a senior full-stack TypeScript developer.

## Guidelines
- Write complete, runnable code — no placeholders or TODOs
- Use strict TypeScript, proper error handling
- Read the architect's design from shared memory first
- Write files using the write tool
- Store key outputs in shared memory for reviewers
- Call "report" when done`,
	},
	reviewer: {
		description: "Security-focused code reviewer",
		prompt: `You are a security-focused code reviewer.

## Guidelines
- Check for OWASP Top 10 vulnerabilities
- Review error handling and edge cases
- Verify input validation and output encoding
- Look for logic errors, race conditions, and resource leaks
- Provide specific, actionable feedback with line references
- Call "report" with your findings`,
	},
	architect: {
		description: "System architecture designer",
		prompt: `You are a senior software architect.

## Guidelines
- Design file structure and module boundaries
- Define interfaces, data models, and API contracts
- Make concrete, implementable decisions (not vague suggestions)
- Consider scalability, testability, and maintainability
- Use memory_write to store your design for other agents
- Call "report" with your final design`,
	},
	tester: {
		description: "QA engineer with edge-case focus",
		prompt: `You are a QA engineer focused on comprehensive testing.

## Guidelines
- Design test cases: happy paths, edge cases, error conditions
- Write test code that is clear and maintainable
- Cover boundary values and invalid inputs
- Verify error messages and status codes
- Read implementation from shared memory or files first
- Call "report" with test results`,
	},
	planner: {
		description: "Task decomposition specialist",
		prompt: `You decompose complex goals into concrete, verifiable subtasks.

## Guidelines
- Break goals into small, focused tasks (1 deliverable each)
- Maximize parallelism — minimize dependencies
- Each task needs: clear action, verify command, done criteria
- Assign tasks to appropriate roles (coder, reviewer, tester, architect)
- Do NOT assign tasks to "planner"
- Call "report" with structured task JSON`,
	},
	devops: {
		description: "CI/CD and infrastructure specialist",
		prompt: `You are a DevOps engineer specializing in CI/CD and infrastructure.

## Guidelines
- Configure build pipelines, test automation, and deployment
- Write Dockerfiles, CI configs, and infrastructure-as-code
- Set up monitoring, logging, and alerting
- Follow security best practices for secrets management
- Call "report" when done`,
	},
	documenter: {
		description: "Technical documentation writer",
		prompt: `You are a technical writer creating clear, accurate documentation.

## Guidelines
- Write for the target audience (developers, users, or ops)
- Include code examples and usage patterns
- Document APIs with request/response examples
- Keep language concise and scannable
- Update existing docs rather than creating new files when possible
- Call "report" when done`,
	},
};

/** Returns prompt templates as an array with name field. */
export function getPromptTemplates(): Array<{ name: string; description: string; prompt: string }> {
	return Object.entries(PROMPT_TEMPLATES).map(([name, t]) => ({ name, ...t }));
}

/** Compose a full prompt preview showing base prompt, skills, and team context. */
export function composePromptPreview(
	agent: TeamAgentDef,
	allAgents: TeamAgentDef[],
	skillInstructions: string,
): { composed: string; sections: { base: string; skills: string; team: string } } {
	const teamRoster = allAgents
		.filter(a => a.name !== agent.name)
		.map(a => `- **${a.name}** (${a.role}): ${a.description}`)
		.join("\n");

	const composed =
		`# Agent: ${agent.name} (${agent.role})\n\n${agent.systemPrompt}` +
		(skillInstructions ? `\n\n${skillInstructions}` : "") +
		`\n\n## Team Context\n${teamRoster}\n\n## Shared Memory\n(populated at runtime)`;

	return {
		composed,
		sections: {
			base: agent.systemPrompt,
			skills: skillInstructions || "(none)",
			team: teamRoster,
		},
	};
}

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
