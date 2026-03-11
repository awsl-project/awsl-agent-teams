# task_3: CLI agents subcommands

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task 3: CLI Agents Subcommands — Complete

Added 3 new subcommands and 1 new flag to the `agents` CLI command in `src/cli.ts`:

| Subcommand | Description |
|------------|-------------|
| `awsl agents templates` | Lists all 7 built-in prompt templates with descriptions |
| `awsl agents prompt <name>` | Focused prompt editing — opens `$EDITOR` (fallback: `notepad`/`vi`) |
| `awsl agents prompt <name> --show` | Print current prompt to stdout |
| `awsl agents prompt <name> --set "..."` | Set prompt inline |
| `awsl agents prompt <name> --file <path>` | Set prompt from file |
| `awsl agents preview <name>` | Shows full composed prompt (base + skills + team context) with section char counts |
| `--template <name>` flag on create/edit | Pre-populates `systemPrompt` and `role` from template registry |

**Implementation details:**
- `$EDITOR` support uses `spawnSync` with `shell: true` for cross-platform compatibility
- Template flag applies only if `--prompt`/`--prompt-file` not explicitly given (explicit overrides template)
- Preview uses `SkillRegistry.buildInstructions()` to resolve skills for accurate preview
- `usage()` documentation updated with all new commands

### Files Modified
- **`src/cli.ts`** — Added imports for `PROMPT_TEMPLATES`, `getPromptTemplates`, `composePromptPreview`, `SkillRegistry`; added `--template` to `parseAgentFlags()`; added `templates`, `prompt`, `preview` subcommands; updated `usage()` and error message

### Files Modified (Tests)
- **`tests/cli-agents.test.ts`** — Added 12 new tests (templates listing, prompt --show/--set/--file, prompt not-found, editor no-changes, preview, preview not-found, create with template, invalid template, edit with template)

### Test Results
- `npx tsc --noEmit` — clean, no errors
- `tests/cli-agents.test.ts` — 25/25 passed (13 existing + 12 new)
- `src/agents.test.ts` — 24/24 passed (no regressions)