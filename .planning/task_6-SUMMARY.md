# task_6: Unit tests for agent CRUD

Assignee: tester
Status: done

## Result
Type check clean.

## AWSL_RESULT

### Task 6: Unit Tests for Agent CRUD — Complete

Enhanced `tests/agents.test.ts` with comprehensive coverage. Added **7 new describe blocks** and **32 new tests** (25 existing → 57 total).

### Test Suites Added

| Suite | Tests | Coverage |
|-------|-------|----------|
| `loadAgents` | 9 | Multiple dirs, precedence, non-existent dirs, non-.md files, missing name, invalid schema, no frontmatter |
| `PROMPT_TEMPLATES` | 4 | 7 roles, shape validation, Guidelines section, report instruction |
| `getPromptTemplates` | 4 | Array conversion, fields, key matching, value matching |
| `composePromptPreview` | 7 | All sections, self-exclusion, sections breakdown, empty skills, roster format, solo agent, 10-agent roster |
| `saveAgent defaults` | 5 | Default role/description/prompt, empty tools array, full overwrite |
| `deleteAgent edge cases` | 3 | Delete→get undefined, re-create after delete, double delete |

### Test Results
- **57/57 tests pass** (12 suites, 0 failures)
- TypeScript type-check: clean
- Existing `src/agents.test.ts`: 24/24 still pass

### Files Modified
- **`tests/agents.test.ts`** — Added imports for `PROMPT_TEMPLATES`, `getPromptTemplates`, `composePromptPreview` + 7 new describe blocks with 32 tests