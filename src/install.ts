/**
 * AWSL Installer — sets up Claude Code skills.
 *
 * HYBRID MODE (no API key needed):
 *   1. CC writes PLAN.md          → CC does the creative thinking
 *   2. `node cli.js validate`     → Code: parse, validate, topo-sort → WAVES.md
 *   3. CC Agent tool executes     → CC: full Claude Code power per task
 *   4. `node cli.js verify`       → Code: run tests, lint, typecheck
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SkillDef {
	dir: string;
	slash: string;
	skill: string;
}

// ── Guardian Skills ──

const GUARDIAN_TDD = `## Guardian: TDD (RED-GREEN-REFACTOR)
- Write a FAILING test FIRST
- Run test → confirm RED
- Write MINIMUM code to pass
- Run test → confirm GREEN
- Refactor while keeping tests green
- NEVER write implementation before tests
- One test at a time, small increments`;

const GUARDIAN_DEBUG = `## Guardian: Systematic Debugging
1. REPRODUCE: minimal reproduction, document input/expected/actual
2. ISOLATE: binary search which component fails, add boundary logging
3. ROOT CAUSE: why does it behave unexpectedly? Logic error? State issue?
4. FIX & VERIFY: fix root cause (not symptom), write regression test`;

const GUARDIAN_REVIEW = `## Guardian: Two-Stage Code Review
### Stage 1 — Spec Compliance
- Does implementation match requirements?
- Are all done criteria met?
- Do verification steps pass?

### Stage 2 — Code Quality
- Security: OWASP Top 10, input validation, no secrets in code
- Correctness: edge cases, error handling, null checks
- Performance: obvious bottlenecks, N+1 queries
- Tests: coverage, meaningful assertions

### Output: [PASS/FAIL/WARN] Category: Description (severity: critical/major/minor)
- ANY critical finding → task FAILS`;

// ── Skill Definitions ──

function buildSkills(cliPath: string): SkillDef[] {
	return [
		{
			dir: "awsl",
			slash: "/awsl",
			skill: `---
name: awsl
description: Run a multi-agent team to build something. Use when the user wants to build, create, or implement a complex feature that benefits from multiple specialized agents (architect, coder, reviewer, tester) working in parallel.
argument-hint: <goal>
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Agent
---

# AWSL — Hybrid Multi-Agent Orchestration

Goal: **$ARGUMENTS**

## Step 0: Lock Check

Before starting, check if another AWSL session is running on this project:

\\\`\\\`\\\`bash
node "${cliPath}" lock
\\\`\\\`\\\`

If locked, tell the user and STOP. Do not proceed.
If not locked, continue — the lock will be acquired automatically by \\\`validate\\\`.

## Step 1: Analyze & Plan (CC does the thinking)

1. Read \`agents/*.md\` for custom agent definitions (if dir exists)
2. Read \`.planning/STATE.md\` for prior context (if exists) — do NOT redo completed work
3. Explore the codebase: Glob for file structure, Read key files, understand architecture
4. Brainstorm: consider approaches, trade-offs, constraints
5. Decompose into micro-tasks and write to \`.planning/PLAN.md\`:

\`\`\`markdown
# Execution Plan

## task-1: <short name>
- **Role:** coder
- **Dependencies:** (none)
- **Files:** src/foo.ts, src/bar.ts
- **Action:** <detailed implementation instructions>
- **Verify:** <runnable command, e.g. npm test -- foo.test.ts>
- **Done:** <observable outcome>

## task-2: <short name>
- **Role:** tester
- **Dependencies:** task-1
- **Files:** tests/foo.test.ts
- **Action:** <detailed instructions>
- **Verify:** npm test
- **Done:** all tests pass
\`\`\`

**Rules:**
- ONE deliverable per task, MAX 2-3 files
- Tasks with no dependencies = same wave = run in parallel
- Roles: coder, reviewer, tester, architect
- Verify should be a runnable command when possible

## Step 2: Code Validation (deterministic)

\`\`\`bash
node "${cliPath}" validate
\`\`\`

This code logic:
- Parses PLAN.md structure
- Validates task format, roles, dependencies
- Detects dependency cycles
- Computes topological sort → execution waves
- Outputs \`.planning/WAVES.md\`

If validation fails, fix PLAN.md and re-run validate.

## Step 3: Execute via CC Agent Tool

Read \`.planning/WAVES.md\` for execution order.

For each wave, launch ALL tasks as **parallel Agent calls in a SINGLE message**.

Each Agent call:
- \`description\`: short summary (3-5 words)
- \`prompt\`: Include ALL of:
  1. Task's Action, Files, Verify, and Done from PLAN.md
  2. Results from dependency tasks in prior waves
  3. Guardian skill for the role:
     - **coder** →
${GUARDIAN_TDD}
     - **reviewer** →
${GUARDIAN_REVIEW}
     - **tester** →
${GUARDIAN_DEBUG}
  4. Custom agent prompt from \`agents/*.md\` if matching role exists
  5. "When done, summarize: what you did, files changed, test results."

**CRITICAL:** Same-wave tasks MUST be parallel Agent calls. Wait for wave to complete before next wave.

## Step 4: Code Verification (deterministic)

\`\`\`bash
node "${cliPath}" verify
\`\`\`

This automatically runs:
- Each task's verify command from PLAN.md
- \`tsc --noEmit\` (TypeScript projects)
- \`npm test\` (if test script exists)
- ESLint (if configured)
- Output: \`.planning/VERIFICATION.md\`

## Step 5: Fix & Re-verify

Read \`.planning/VERIFICATION.md\`. If any checks FAILED:
- Launch Agent(s) to fix the issues
- Re-run: \`node "${cliPath}" verify\`

## Step 6: Commit & Report

1. Git commit all changes
2. Update \`.planning/STATE.md\` with progress, decisions, next steps
3. Summarize to user: what was built, files changed, test/verify results
`,
		},
		{
			dir: "awsl-quick",
			slash: "/awsl-quick",
			skill: `---
name: awsl-quick
description: Quick mode — skip brainstorming and research. Use for small tasks, bug fixes, or when speed matters.
argument-hint: <goal>
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Agent
---

# AWSL Quick Mode

Fast execution for: **$ARGUMENTS**

## Step 0: Lock Check
\\\`\\\`\\\`bash
node "${cliPath}" lock
\\\`\\\`\\\`
If locked, tell the user and STOP.

## Step 1: Quick Plan
Write a minimal plan to \`.planning/PLAN.md\` (1-3 tasks, keep it simple).
Use the same format: \`## task-id: name\` with Role, Dependencies, Files, Action, Verify, Done.

## Step 2: Validate
\`\`\`bash
node "${cliPath}" validate
\`\`\`

## Step 3: Execute
Read \`.planning/WAVES.md\`. Launch tasks via Agent tool (parallel if independent).
- **coder** →
${GUARDIAN_TDD}
- **reviewer** →
${GUARDIAN_REVIEW}

## Step 4: Verify
\`\`\`bash
node "${cliPath}" verify
\`\`\`
Fix failures if any, re-verify.

## Step 5: Commit & Report
Git commit. Summarize concisely.
`,
		},
		{
			dir: "awsl-plan",
			slash: "/awsl-plan",
			skill: `---
name: awsl-plan
description: Create a plan without executing. Use when the user wants to review before running.
argument-hint: <goal>
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# AWSL Plan Only

Create a plan for: **$ARGUMENTS**

1. Read \`agents/*.md\` and \`.planning/STATE.md\` for context
2. Explore codebase (Glob/Grep/Read)
3. Brainstorm approaches and trade-offs
4. Write structured plan to \`.planning/PLAN.md\` (format: ## task-id: name with Role, Dependencies, Files, Action, Verify, Done)
5. Run validation:
\`\`\`bash
node "${cliPath}" validate
\`\`\`
6. Show PLAN.md and WAVES.md to user
7. Ask if they want to proceed with \`/awsl-go\`
`,
		},
		{
			dir: "awsl-go",
			slash: "/awsl-go",
			skill: `---
name: awsl-go
description: Execute an existing plan from .planning/PLAN.md. Use after /awsl-plan.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, Agent
---

# AWSL Go — Execute Approved Plan

1. Read \`.planning/PLAN.md\` and \`.planning/WAVES.md\`
2. If WAVES.md doesn't exist, run: \`node "${cliPath}" validate\`
3. Execute waves via parallel Agent calls:
   - **coder** →
${GUARDIAN_TDD}
   - **reviewer** →
${GUARDIAN_REVIEW}
   - **tester** →
${GUARDIAN_DEBUG}
4. Verify: \`node "${cliPath}" verify\`
5. Fix failures, re-verify
6. Git commit. Update STATE.md. Report results.
`,
		},
		{
			dir: "awsl-status",
			slash: "/awsl-status",
			skill: `---
name: awsl-status
description: Show project status and progress. Use when user asks about progress or what happened.
allowed-tools: Read, Glob
---

# AWSL Status

Read and present:
1. \`.planning/STATE.md\` — progress
2. \`.planning/PLAN.md\` — tasks
3. \`.planning/WAVES.md\` — execution order
4. \`.planning/VERIFICATION.md\` — test results
5. \`.planning/DESIGN.md\` — design decisions
`,
		},
		{
			dir: "awsl-agents",
			slash: "/awsl-agents",
			skill: `---
name: awsl-agents
description: List or create custom agent definitions.
argument-hint: [list | create <name>]
allowed-tools: Read, Write, Glob
---

# AWSL Agents

$ARGUMENTS

## List: Read \`agents/*.md\` files, show name/role/description.

## Create \`agents/<name>.md\`:
\`\`\`markdown
---
name: agent-name
role: coder|reviewer|tester|architect
description: What this agent does
---

System prompt injected when this agent executes tasks.
\`\`\`

Built-in roles: coder, reviewer, tester, architect
`,
		},
	];
}

// ── Installer ──

function install(targetDir: string, cliPath: string) {
	const skillsDir = path.join(targetDir, "skills");
	fs.mkdirSync(skillsDir, { recursive: true });

	const skills = buildSkills(cliPath);
	for (const skill of skills) {
		const dir = path.join(skillsDir, skill.dir);
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "SKILL.md"), skill.skill);
		console.log(`  + ${skill.slash}`);
	}
}

export function runInstaller() {
	const args = process.argv.slice(2);
	const isGlobal = args.includes("--global");

	const targetDir = isGlobal
		? path.join(os.homedir(), ".claude")
		: path.join(process.cwd(), ".claude");

	const projectRoot = path.resolve(__dirname, "..");
	const cliPath = path.resolve(projectRoot, "dist", "cli.js").replace(/\\/g, "/");

	console.log(`
  ╔═══════════════════════════════════╗
  ║   AWSL Agent Core                 ║
  ║   Conductor + Guardian Engine     ║
  ╚═══════════════════════════════════╝

  Installing to ${targetDir}
  CLI: ${cliPath}
  Mode: Hybrid (CC think + Code validate/verify)
`);

	install(targetDir, cliPath);

	const agentsDir = path.join(process.cwd(), "agents");
	if (!fs.existsSync(agentsDir)) {
		fs.mkdirSync(agentsDir, { recursive: true });
		console.log(`  + agents/ directory`);
	}

	console.log(`
  Done! No API key needed for CC usage.

  /awsl <goal>        CC plan → code validate → CC execute → code verify
  /awsl-quick <goal>  Fast mode
  /awsl-plan <goal>   Plan only, review first
  /awsl-go            Execute approved plan
  /awsl-status        Check progress
  /awsl-agents        Manage agents

  Architecture:
    CC does:   brainstorm, plan writing, code execution (Agent tool)
    Code does: plan validation, topo-sort, test/lint/typecheck
`);
}
