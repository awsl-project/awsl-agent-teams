# task_2: Dashboard API endpoints for agents

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task 2: Dashboard API Endpoints for Agents — Complete

Added 2 new API endpoints to `src/dashboard.ts`:

1. **`GET /api/agents/templates`** — Returns all 7 built-in prompt templates as `Array<{ name, description, prompt }>`. Calls `getPromptTemplates()` from agents module.

2. **`POST /api/agents/preview`** — Accepts `{ name }` body, composes full prompt preview with skills and team roster. Returns `{ composed, sections: { base, skills, team } }`. Uses `SkillRegistry.buildInstructions()` + `composePromptPreview()`.

Both endpoints have proper validation (400 for missing name, 404 for nonexistent agent).

### Files Modified
- **`src/dashboard.ts`** — Added 2 endpoints (`/api/agents/templates`, `/api/agents/preview`), imported `getPromptTemplates`, `composePromptPreview`, `SkillRegistry`
- **`src/dashboard-agents.test.ts`** — Added 4 new tests (templates shape, preview composition, preview not found, preview missing name)

### Test Results
- **19/19 tests pass** (15 existing + 4 new)
- TypeScript type-check: clean