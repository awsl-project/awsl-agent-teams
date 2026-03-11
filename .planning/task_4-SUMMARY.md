# task_4: Add an 'Agent Roles' (角色管理) collapsible card section to publ

Assignee: coder
Status: done

## Result
All 25 tests pass. Type-check clean.

## AWSL_RESULT

### Task 4 Complete: Agent Roles (角色管理) Dashboard UI

**Added to `public/dashboard.html`:**

| Component | Description |
|-----------|-------------|
| **Agent Roles Card** | Collapsible `角色管理` section with `[+New]` and `[Collapse]` buttons. Displays agent cards in a flex grid. Each card shows: name, role badge (color-coded), source badge (`built-in` grey / `custom` green / `override` yellow), and truncated description. Cards are clickable to open editor. |
| **Agent Editor Modal** | Overlay modal with fields: Name (readonly when editing), Role (dropdown), Description, Model, Tools (comma-separated), Skills (comma-separated), Thinking Level (dropdown), System Prompt (monospace textarea, 200px min height). Action buttons: `[Save]`, `[Reset to Default]` (only for overridden builtins), `[Delete]` (only for custom/override agents), `[Cancel]`. |
| **JavaScript CRUD** | `loadAgentRoles()` — GET /api/agents, `openAgentEditor(name?)` — open modal pre-filled or blank, `saveAgentFromEditor()` — POST (new) or PUT (edit), `deleteAgentFromEditor()` — DELETE with confirmation, `resetAgentToDefault()` — DELETE override to restore builtin default. |
| **Auto-refresh** | `loadAgentRoles()` + `renderAgentRoles()` called on init and in 30s refresh interval. |

**CSS added:** ~160 lines matching existing dashboard style (card-based layout, var() colors, responsive breakpoints).

**Verification:**
- `npx tsc --noEmit` — clean, no errors
- `tests/agents.test.ts` — **25/25 passed**
- All UI follows existing patterns (card layout, badge styling, modal overlay, responsive `@media` rules)