/**
 * Guardian — composable quality enforcement skills.
 *
 * Guardian skills auto-activate based on agent role, injecting
 * methodology into each agent's system prompt. This ensures
 * every agent follows disciplined engineering practices.
 *
 * Conductor handles the "what" and "when" (planning, waves, parallelism).
 * Guardian handles the "how" (TDD, debugging, review methodology).
 */

export interface Skill {
	name: string;
	description: string;
	/** Roles that auto-activate this skill */
	activatesFor: string[];
	/** Workflow instructions injected into agent prompt */
	instructions: string;
}

// ─── Guardian Skills ─────────────────────────────────────────

export const SKILL_TDD: Skill = {
	name: "tdd",
	description: "Enforces RED-GREEN-REFACTOR cycle",
	activatesFor: ["coder"],
	instructions: `## Guardian Skill: Test-Driven Development (TDD)

You MUST follow the RED-GREEN-REFACTOR cycle strictly:

### RED Phase
1. Write a failing test FIRST for the feature/behavior
2. Run the test — confirm it FAILS (red)
3. If you wrote implementation code before a test, DELETE it and start over

### GREEN Phase
4. Write the MINIMUM code to make the test pass
5. Run the test — confirm it PASSES (green)
6. Do NOT add extra functionality beyond what the test requires

### REFACTOR Phase
7. Clean up the code while keeping tests green
8. Extract duplicates, rename for clarity, simplify
9. Run tests again — confirm still green
10. Commit

### Rules
- NEVER write implementation before tests
- One test at a time — small increments
- Each commit should have: test + minimal implementation
- If a test is hard to write, the design needs rethinking
- Target: every public function/endpoint has a test`,
};

export const SKILL_SYSTEMATIC_DEBUG: Skill = {
	name: "debug",
	description: "Four-phase root cause analysis",
	activatesFor: ["tester", "coder"],
	instructions: `## Guardian Skill: Systematic Debugging

When encountering a bug or test failure, follow this 4-phase process.
Do NOT guess-and-check. Do NOT make random changes.

### Phase 1: Reproduce
1. Create a minimal reproduction case
2. Document: input, expected output, actual output
3. Identify: is it consistent or intermittent?

### Phase 2: Isolate
4. Binary search: which component/layer fails?
5. Add logging at boundaries to trace data flow
6. Find the exact line/function where behavior diverges from expectation

### Phase 3: Root Cause
7. Why does this code behave unexpectedly?
8. Is it a logic error, state issue, race condition, or wrong assumption?
9. Check: is this a symptom of a deeper design problem?

### Phase 4: Fix & Verify
10. Fix the root cause, not the symptom
11. Write a regression test that catches this specific bug
12. Verify the fix doesn't break other tests
13. Document what went wrong and why in your report`,
};

export const SKILL_BRAINSTORM: Skill = {
	name: "brainstorm",
	description: "Socratic requirements refinement before coding",
	activatesFor: ["architect", "planner"],
	instructions: `## Guardian Skill: Socratic Brainstorming

Before designing or planning, systematically explore requirements:

### Explore
1. What is the user actually trying to achieve? (not just what they asked for)
2. What are the constraints? (performance, compatibility, timeline)
3. What alternatives exist? List at least 3 approaches
4. What are the trade-offs of each approach?

### Challenge
5. What assumptions am I making? Are they valid?
6. What could go wrong? What are the edge cases?
7. What's the simplest solution that works?
8. What will be hardest to change later? (lock-in decisions)

### Decide
9. Pick the approach with the best trade-off profile
10. Document WHY this approach was chosen (not just what)
11. List the key decisions and their rationale
12. Save the design document to shared memory`,
};

export const SKILL_CODE_REVIEW: Skill = {
	name: "review",
	description: "Two-stage code review with quality gate",
	activatesFor: ["reviewer"],
	instructions: `## Guardian Skill: Two-Stage Code Review

### Stage 1: Spec Compliance
1. Read the original task requirements (from shared memory or context)
2. Check: does the implementation match the spec?
3. Check: are all requirements addressed?
4. Check: are the done criteria met?
5. Check: do the verification steps pass?
6. If ANY spec requirement is missed → FAIL with specific details

### Stage 2: Code Quality
7. Security: OWASP Top 10, input validation, auth checks, no secrets in code
8. Correctness: edge cases, error handling, null checks
9. Maintainability: naming, structure, complexity, DRY
10. Performance: obvious bottlenecks, N+1 queries, unnecessary allocations
11. Tests: coverage, meaningful assertions, edge case tests

### Output Format
For each finding:
- [PASS/FAIL/WARN] Category: Description
- Location: file:line
- Severity: critical/major/minor
- Suggestion: specific fix

### Quality Gate
- ANY critical finding → task FAILS (must be fixed)
- Major findings → task WARN (should be fixed)
- Minor findings → noted but doesn't block`,
};

export const SKILL_PLANNING: Skill = {
	name: "planning",
	description: "Break work into micro-tasks with verify criteria",
	activatesFor: ["planner"],
	instructions: `## Guardian Skill: Micro-Task Planning

Each task you create should be completable in 2-5 minutes by an agent.

### Task Sizing Rules
- ONE deliverable per task (one function, one endpoint, one component)
- MAX 2-3 files modified per task
- Each task independently verifiable
- Each task independently committable

### Task Quality Checklist
- [ ] Clear action (what to do, not what to think about)
- [ ] Specific files listed
- [ ] Concrete verify step (test command or check)
- [ ] Definition of done (observable outcome)
- [ ] Dependencies are minimal and explicit

### Anti-Patterns
- "Implement the auth module" ← too big, split into: schema, handler, middleware, tests
- "Set up the project" ← vague, be specific: init package.json, add tsconfig, create entry point
- Task with 5+ dependencies ← redesign to parallelize more`,
};

export const SKILL_SUBAGENT_DEV: Skill = {
	name: "dispatch",
	description: "Dispatch parallel subagents with built-in review",
	activatesFor: [],
	instructions: `## Guardian Skill: Subagent-Driven Development

When dispatching work to other agents:

### Before Dispatch
1. Ensure the task spec is "clear enough for an enthusiastic junior engineer"
2. Include: exact files, expected inputs/outputs, test criteria
3. Provide context from prior tasks (don't assume knowledge)

### During Execution
4. Each subagent gets a FRESH context (no accumulated garbage)
5. Tasks in the same wave are independent (no shared mutable state)
6. Memory is the ONLY communication channel between agents

### After Completion — Two-Stage Review
7. Stage 1: Does the output match the task spec?
8. Stage 2: Is the code quality acceptable?
9. If either fails → create a fix task, don't just accept it`,
};

// ─── Skill Registry ──────────────────────────────────────────

const BUILTIN_SKILLS: Skill[] = [
	SKILL_TDD,
	SKILL_SYSTEMATIC_DEBUG,
	SKILL_BRAINSTORM,
	SKILL_CODE_REVIEW,
	SKILL_PLANNING,
	SKILL_SUBAGENT_DEV,
];

export class SkillRegistry {
	private skills = new Map<string, Skill>();

	constructor() {
		for (const s of BUILTIN_SKILLS) {
			this.skills.set(s.name, s);
		}
	}

	register(skill: Skill) {
		this.skills.set(skill.name, skill);
	}

	forRole(role: string): Skill[] {
		return [...this.skills.values()].filter(s => s.activatesFor.includes(role));
	}

	get(name: string): Skill | undefined {
		return this.skills.get(name);
	}

	all(): Skill[] {
		return [...this.skills.values()];
	}

	/** Build Guardian instructions for an agent based on its role + explicit skills */
	buildInstructions(role: string, explicitSkills?: string[]): string {
		const active = new Set<string>();

		for (const s of this.forRole(role)) {
			active.add(s.name);
		}

		if (explicitSkills) {
			for (const name of explicitSkills) {
				active.add(name);
			}
		}

		if (active.size === 0) return "";

		const sections = [...active]
			.map(name => this.skills.get(name))
			.filter((s): s is Skill => !!s)
			.map(s => s.instructions);

		return `\n# Guardian (Active Skills)\n\n${sections.join("\n\n")}`;
	}
}
