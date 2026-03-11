# task_1: Agent CRUD functions in agents.ts

Assignee: coder
Status: done

## Result
All green.

## AWSL_RESULT

### Task 1: Agent CRUD Functions — Complete

Added 3 new exports to `src/agents.ts`:

1. **`PROMPT_TEMPLATES`** — 7 built-in role templates (coder, reviewer, architect, tester, planner, devops, documenter) with description + prompt text
2. **`getPromptTemplates()`** — Returns templates as `Array<{ name, description, prompt }>` for API/CLI consumption
3. **`composePromptPreview(agent, allAgents, skillInstructions)`** — Composes full prompt preview with sections breakdown (base, skills, team roster)

### Files Modified
- **`src/agents.ts`** — Added `PROMPT_TEMPLATES`, `getPromptTemplates()`, `composePromptPreview()`
- **`src/index.ts`** — Re-exported all 3 new exports
- **`src/agents.test.ts`** — Added 7 new tests (templates shape, array conversion, preview composition, no-skills edge case, team roster filtering)

### Test Results
- 24/24 tests pass (17 existing + 7 new)
- TypeScript type-check: clean
- Build: clean