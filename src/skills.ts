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

You MUST follow the RED-GREEN-REFACTOR cycle strictly.

### Workflow — One Feature at a Time

1. **Create the test file FIRST** (e.g. \`foo.test.ts\`) BEFORE creating the implementation file.
2. Write ONE failing test case for the smallest unit of behavior.
3. Run the test — confirm it FAILS (red). If it passes, your test is wrong.
4. Create or edit the implementation file — write the MINIMUM code to make the test pass.
5. Run the test — confirm it PASSES (green).
6. Write the NEXT test case. Repeat until the feature is complete.
7. Refactor while green — clean up, extract, rename. Run tests after each change.

### Mandatory Test Scenarios

For every endpoint/function, you MUST test:
- **Happy path**: valid input → expected output
- **Validation**: invalid/missing input → proper error (400, not 500)
- **Not found**: non-existent resource → 404
- **Edge cases**: empty string, 0, negative numbers, very long strings, special characters
- **Idempotency**: calling the same operation twice has expected behavior

### Test Quality Rules

- Each test must have a descriptive name: \`it("returns 404 when todo does not exist")\`
- Each test must have at least ONE \`expect()\` assertion — no empty test bodies
- Use \`describe()\` blocks to group related tests
- Test ONE behavior per test — if a test name has "and", split it
- Always test the response status code AND the response body

### What Gets You Rejected

- Writing implementation code before the test file exists → task FAILS
- Zero test files → task FAILS
- Tests that only check status codes but not response bodies → WARN
- Tests without descriptive names → WARN`,
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

You will receive the actual git diff or file contents. READ THE CODE LINE BY LINE.
Your job is to find REAL bugs — not cosmetic issues.

### Stage 1: Spec Compliance (Does it work?)

Check each requirement from the task description. For each one:
- Is it implemented? (not "partially" — fully or not)
- Does the implementation handle the stated edge cases?
- Would a manual test of this feature pass?

If ANY requirement is missing or broken → [FAIL] severity: critical.

### Stage 2: Bug Hunting (Read every line)

For EACH function/handler in the diff, check:

**A. Input handling:**
- What happens if the input is undefined/null/empty string/0?
- What happens if required fields are missing?
- Is the validation BEFORE the business logic (not after)?

**B. Error paths:**
- Does every \`try\` have a meaningful \`catch\` (not empty)?
- Does the error response include useful information (not generic "error")?
- Can an error leave the system in an inconsistent state?

**C. Return values:**
- Does every code path return a value (no falling through)?
- Are HTTP status codes correct? (201 for create, 404 for not found, 400 for bad input)
- Is the response shape consistent across endpoints?

**D. Data integrity:**
- Can two concurrent requests corrupt shared state?
- Does deletion actually remove from the store (not just filter a copy)?
- Are IDs unique and collision-free?

### Severity Decision Tree

\`\`\`
Will this cause wrong behavior in production?
  YES → Is data corrupted or lost?
    YES → critical
    NO  → major
  NO  → Is it misleading to future developers?
    YES → minor
    NO  → don't report it
\`\`\`

### Output Format (STRICT — follow exactly)

For each finding:
\`\`\`
[FAIL] task_id: <one-line description> (severity: critical)
Location: file.ts:42
Bug: <what goes wrong and when>
Fix: <specific code change>
\`\`\`

If no issues found:
\`\`\`
[PASS] task_id: All requirements met, code quality acceptable
\`\`\`

### What is NOT a finding
- Style preferences (single vs double quotes, trailing commas)
- Missing JSDoc comments
- "Could be more efficient" without a concrete performance problem
- Unused imports (linter catches these)`,
};

export const SKILL_BROWSER_VERIFY: Skill = {
	name: "browser-verify",
	description: "Verify frontend pages in a real browser via browser-bridge",
	activatesFor: ["tester", "reviewer"],
	instructions: `## Guardian Skill: Browser Verification (Frontend)

When the task touches a **frontend page** (HTML/CSS/React/Vue/Svelte/etc.), you MUST
not declare it done from source code alone — open the running page in a real browser
and confirm it actually renders and works. You drive the user's already-open browser
through the \`browser-bridge-cli\` command (it reuses their real, logged-in session).

### Step 0 — Resolve the preview URL
Find the URL of the running app, in this order:
1. \`memory_read\` the key \`preview_url\` (an earlier agent may have stored it).
2. Read \`.awsl.json\` → \`browser.previewUrl\`.
3. If neither exists and you start a dev server yourself, store the URL you used:
   \`memory_write preview_url "http://localhost:5173"\` so reviewers and the
   verification gate can reuse it.

If you cannot determine a URL and cannot start the app, SKIP browser checks and say
so in your report — do NOT fail the task for a missing URL.

### Step 1 — Check the bridge is connected
\`\`\`
browser-bridge-cli info      # must show an activeClient (not null)
\`\`\`
If the bridge is down or no browser is paired, do NOT retry in a loop. Report
"browser bridge not connected — visual verification skipped" and continue with the
non-browser parts of your task.

### Step 2 — Open the page WITHOUT hijacking the user's tab
Use a fresh tab so you never disturb what the user is looking at:
\`\`\`
browser-bridge-cli new-tab "<previewUrl>"     # note the "Created tab <id>"
browser-bridge-cli tabs                         # confirm the tab + its id
\`\`\`
Always \`close-tab <id>\` when you are done.

### Step 3 — Assert the page is actually healthy (not blank, not erroring)
Prefer programmatic DOM/console checks (these work even when you cannot see images):
\`\`\`
browser-bridge-cli eval "JSON.stringify({title:document.title, textLen:document.body.innerText.length, root:!!document.querySelector('#app,#root,main'), overlay:!!document.querySelector('vite-error-overlay,#nextjs__container_errors,.error-overlay')})" -t <id>
\`\`\`
A page PASSES only if: it has a title, \`textLen\` is non-trivial (not a blank page),
the expected root element exists, and there is NO framework error overlay. Also use
\`browser-bridge-cli network -l 50 -t <id>\` to spot failed (4xx/5xx) requests, and
\`query "<css>"\` to assert task-specific elements (the button/form/text you built).

### Step 4 — Capture a screenshot artifact
\`\`\`
browser-bridge-cli screenshot -o .planning/screenshots/<task-id>.png -t <id>
\`\`\`
Save it under \`.planning/screenshots/\` so a human can eyeball the result. If you run
under an engine that can read images, open the screenshot and visually confirm layout
(no overlap, no truncation, responsive looks right).

### Step 5 — Report
List, per page checked: the URL, PASS/FAIL, what you asserted, the screenshot path,
and any console/network errors. A frontend task with no passing browser check (and no
documented skip reason) is NOT done.

### Safety
This drives the user's REAL browser. Reading, eval-for-inspection, query and
screenshot are safe. Do NOT submit forms, click buy/pay/send, or change account state
to "verify" unless the task explicitly requires it and you note it in your report.`,
};

export const SKILL_FRONTEND: Skill = {
	name: "frontend",
	description: "Frontend implementation discipline — structure, a11y, states, API wiring",
	activatesFor: ["coder"],
	instructions: `## Guardian Skill: Frontend Implementation

When the task builds a **UI** (HTML/CSS/React/Vue/Svelte/etc.), follow this discipline.
This skill pairs with \`browser-verify\` — you BUILD here, the tester/reviewer VERIFIES in a
real browser. Make their job possible: leave a runnable page and a known preview URL.

### Component structure
- One component = one responsibility. Type every prop/input; no untyped \`any\` props.
- Derive state, don't duplicate it. Lift state only as high as it must go.
- Keep side effects (fetch, subscriptions) out of render; clean them up on unmount.

### The four states are MANDATORY (not just the happy path)
For anything that loads data, you MUST handle and render:
1. **loading** — a spinner/skeleton, never a blank frozen screen
2. **error** — a readable message + a retry path, never a silent failure
3. **empty** — a deliberate "nothing here yet" state, never a broken-looking blank
4. **success** — the actual content

### Wire to the REAL contract
- Match the backend's actual response shape and types. Do NOT invent or hardcode a shape.
- Read the API types/schema (or the \`backend\` agent's output in shared memory) first.
- Handle non-2xx responses; don't assume every request succeeds.

### Accessibility & responsiveness (baseline, not optional)
- Semantic HTML (\`button\`, \`label\`, \`nav\`, \`main\`); every input has a label; images have alt.
- Keyboard-operable: focus states visible, no mouse-only interactions.
- Mobile-first / responsive — no fixed-pixel layouts that overflow on small screens.

### Match the existing design, avoid generic AI look
- Reuse the project's existing design tokens, components, and styling approach.
- Do NOT introduce a new UI library or a generic purple-gradient template unasked.

### Hand off to verification
After the page builds, start (or confirm) a dev server and store the URL so the
verification gate and reviewers can reuse it:
\`memory_write preview_url "http://localhost:5173"\`. A frontend task is NOT done until
a \`browser-verify\` pass exists (or a documented skip reason).`,
};

export const SKILL_BACKEND: Skill = {
	name: "backend",
	description: "Backend implementation discipline — layering, validation, status codes, safety",
	activatesFor: ["coder"],
	instructions: `## Guardian Skill: Backend Implementation

When the task builds an **API / server / data layer**, follow this discipline.
This skill pairs with \`tdd\` — write the test first, then the minimal handler.

### Layering — keep concerns separate
- route/controller → service → store/model. HTTP concerns (req/res/status) live ONLY in
  the route layer. The service layer takes plain args and returns plain values/throws.
- Don't reach across layers (no SQL in a route handler, no \`res.send\` in a service).

### Validate at the boundary, BEFORE business logic
- Parse/validate every input with a schema at the edge. Reject bad input with **400**,
  never let it reach the DB and surface as a 500.
- Treat all client input as hostile: missing fields, wrong types, empty string, 0,
  negative, oversized, and injection payloads.

### Correct, consistent HTTP semantics
- Status codes: 200 read · 201 create · 204 delete · 400 bad input · 401 unauthenticated ·
  403 forbidden · 404 not found · 409 conflict · 422 unprocessable · 500 unexpected.
- One consistent response envelope across endpoints; errors carry a stable \`code\` +
  human message. NEVER leak stack traces, SQL, or internal paths to the client.

### Safety
- No secrets in code or logs — read from env/config; never log tokens, passwords, PII.
- Guard shared state against concurrent writes (atomic ops / transactions); don't
  read-modify-write without protection.
- Make mutations idempotent where a retry could double-apply (payments, sends, creates).
- Schema/migrations are explicit and reversible; never mutate prod data ad hoc.

### Done means tested
Every endpoint has tests for happy path, validation failure (400), not-found (404),
and at least one edge case — see the \`tdd\` skill.`,
};

export const SKILL_CLEAN_GIT: Skill = {
	name: "commit",
	description: "Clean git hygiene — atomic commits, zero AI attribution, safe push",
	activatesFor: ["coder", "reviewer"],
	instructions: `## Guardian Skill: Clean Git Hygiene

The Conductor commits per task/wave and pushes for you. Your job is to leave a clean,
reviewable working tree — and if you ever do touch git directly, leave NO trace that an
assistant was involved.

### Default: don't touch git yourself
- Do NOT run \`git commit\`, \`git push\`, \`git reset\`, or \`git rebase\` unless the task
  explicitly tells you to. The orchestrator stages your declared files and commits them.
- Keep your changes scoped to the files the task declared — don't leave unrelated edits.

### If you DO commit — the message must look human-authored
- NEVER add \`Co-Authored-By: Claude\` (or any \`...@anthropic.com\` co-author).
- NEVER add \`Generated with Claude Code\`, a \`🤖\` trailer, or any "as an AI" / tool /
  model attribution anywhere in the subject or body.
- Conventional-commit style: \`type(scope): summary\` where type ∈
  feat·fix·refactor·test·docs·chore·build·perf. Imperative mood, subject ≤ 72 chars.
- One logical change per commit. Explain the WHY in the body when it isn't obvious.

### Pushing is dangerous — hard rules
- NEVER \`git push --force\` / \`--force-with-lease\` to a shared branch.
- NEVER push directly to \`main\` / \`master\` without explicit confirmation; push the
  working branch and let a human open the PR.
- NEVER use \`--no-verify\` — do not skip commit/push hooks.

### Never commit
- Secrets, \`.env\`, credentials, tokens.
- Build artifacts, \`node_modules\`, large binaries — respect \`.gitignore\`.`,
};

export const SKILL_PLANNING: Skill = {
	name: "planning",
	description: "Break work into micro-tasks with verify criteria",
	activatesFor: ["planner"],
	instructions: `## Guardian Skill: Micro-Task Planning

### Task Sizing Rules
- ONE deliverable per task — one function, one endpoint, one component
- MAX 2-3 files modified per task
- Each task independently verifiable and committable
- Tasks in the same wave MUST be independent (no shared file writes)

### Every Task MUST Have These Fields

\`\`\`json
{
  "id": "task_N",
  "description": "Create POST /todos endpoint with Zod validation",
  "assignee": "coder",
  "dependencies": ["task_1"],
  "files": ["src/routes/todos.ts", "src/routes/todos.test.ts"],
  "verify": "npx vitest run src/routes/todos.test.ts",
  "doneCriteria": "POST /todos returns 201 with valid input, 400 with invalid input. Tests pass."
}
\`\`\`

### Verify Field Rules
- MUST be a runnable command (not prose)
- MUST target the specific test file for this task
- Good: \`npx vitest run src/store.test.ts\`
- Bad: \`check that it works\` or \`npm test\` (too broad)

### Task Ordering Template

For a typical REST API, use this wave structure:
1. **Wave 1** (parallel): project setup + types/schemas + store/model
2. **Wave 2** (parallel): route handlers (one task per endpoint group)
3. **Wave 3** (parallel): middleware + error handling
4. **Wave 4**: integration tests (depends on all routes)
5. **Wave 5**: final cleanup + documentation

### Anti-Patterns
- "Implement the auth module" → split into: schemas, store, register endpoint, login endpoint, auth middleware, tests
- "Set up the project" → specify exactly: init package.json with dependencies X Y Z, create tsconfig with strict:true, create src/index.ts entry point
- Task with 5+ dependencies → redesign to parallelize
- Two tasks writing the same file → merge into one or create interface first`,
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
	SKILL_BROWSER_VERIFY,
	SKILL_FRONTEND,
	SKILL_BACKEND,
	SKILL_CLEAN_GIT,
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
