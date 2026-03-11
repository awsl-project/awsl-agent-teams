# task_5: Remote relay agent commands

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task 5: Remote Relay Agent Commands — Complete

Added 2 new remote commands to `src/remote.ts`:

1. **`agents:templates`** — Returns all 7 built-in prompt templates via `getPromptTemplates()`. No payload required.
2. **`agents:preview`** — Accepts `{ name }` payload, resolves the agent (builtin or custom), composes full prompt with skills + team roster via `composePromptPreview()`. Returns `{ composed, sections: { base, skills, team } }`. Throws if agent not found.

### Files Modified
- **`src/remote.ts`** — Added `agents:templates` and `agents:preview` command cases + imported `getPromptTemplates`, `composePromptPreview`, `SkillRegistry`
- **`src/remote-agents.test.ts`** — Added 2 new test functions with 26 assertions (templates shape, all 7 names present, preview composition, custom agent preview, missing agent error)

### Test Results
- **45/45 remote-agents tests pass** (20 existing + 25 new)
- **24/24 agents tests pass** (no regressions)
- TypeScript type-check: clean
- Build: clean