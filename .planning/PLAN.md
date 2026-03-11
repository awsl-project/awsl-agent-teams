# Execution Plan

## task_1: Agent CRUD functions in agents.ts
- **Assignee:** coder
- **Files:** src/agents.ts, src/index.ts

### Action
Add four new exported functions to src/agents.ts:

1. `serializeAgent(agent: TeamAgentDef): string` — Convert a TeamAgentDef back to frontmatter+markdown format. Build YAML frontmatter from name, role, description, model, tools, skills, thinking fields. The markdown body is systemPrompt. Use the `yaml` package's `stringify` for the frontmatter section.

2. `saveAgent(dir: string, agent: Partial<TeamAgentDef> & { name: string }): TeamAgentDef` — Validate agent name matches `/^[a-z][a-z0-9-]*$/` and max 50 chars. If an existing file exists in dir, load it first and merge fields. Serialize and write to `{dir}/{name}.md` atomically (write to .tmp then rename). Return the full TeamAgentDef.

3. `deleteAgent(dir: string, name: string): boolean` — Delete `{dir}/{name}.md` if it exists. Return true if deleted, false if not found. Never delete built-in agents (they have no file).

4. `getAgent(dirs: string[], name: string): TeamAgentDef | undefined` — Load all agents via loadAgents(dirs) and find by name.

Also export `BUILTINS` as a readonly array so dashboard can distinguish built-in vs custom.

Update src/index.ts to re-export: `serializeAgent`, `saveAgent`, `deleteAgent`, `getAgent`, `BUILTINS`.

### Verify
npx tsc --noEmit

### Done
serializeAgent, saveAgent, deleteAgent, getAgent are exported and type-check passes

## task_2: Dashboard API endpoints for agents
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/dashboard.ts

### Action
Add agent CRUD API endpoints to the dashboard HTTP server in src/dashboard.ts. Import `loadAgents`, `saveAgent`, `deleteAgent`, `getAgent`, `BUILTINS` from `./agents.js`.

Add these routes BEFORE the 404 handler:

1. `GET /api/agents` — Load agents from `[path.join(cwd, 'agents')]`. Return JSON array of all TeamAgentDef[]. If query param `name` is present, return single agent or 404.

2. `POST /api/agents` — Create new agent. Use collectBody to parse JSON body with fields: name, role, description, systemPrompt, model?, tools?, skills?, thinkingLevel?. Validate: name required + matches pattern, systemPrompt required + non-empty, name must not already exist in custom agents dir. Call saveAgent(agentsDir, parsed). Return 201 with the created agent.

3. `PUT /api/agents` — Update existing agent. Use collectBody, parse JSON body with name + any updatable fields. Agent must exist (in builtins or files). Call saveAgent(agentsDir, parsed) which merges. Return 200 with updated agent.

4. `DELETE /api/agents` — Delete custom agent. Get `name` from query param. Cannot delete if only exists as builtin (return 400). Call deleteAgent(agentsDir, name). Return 200 with { deleted: boolean }.

Set `const agentsDir = path.join(cwd, 'agents');` at the top of the request handler. Ensure mkdir -p on agentsDir for write operations.

### Verify
npx tsc --noEmit

### Done
GET/POST/PUT/DELETE /api/agents endpoints exist and type-check passes

## task_3: CLI agents subcommands
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/cli.ts

### Action
Enhance the existing `agents` CLI command in src/cli.ts with subcommands. Import `saveAgent`, `deleteAgent`, `getAgent`, `serializeAgent`, `BUILTINS` from `./agents.js`.

Current `agents` command just lists agents. Refactor to support subcommands:

1. `awsl agents` (no subcommand) — Keep existing list behavior
2. `awsl agents show <name>` — Load agent by name, print full details including systemPrompt. Use getAgent().
3. `awsl agents create <name>` — Create new agent. Accept flags: --role (default 'custom'), --description, --prompt (inline text), --prompt-file (read from file), --tools (comma-separated), --model, --skills, --thinking. Validate name pattern. Call saveAgent().
4. `awsl agents edit <name>` — Update existing agent. Same flags as create. Load existing agent first, merge provided flags, call saveAgent().
5. `awsl agents delete <name>` — Delete custom agent file. Confirm it's not a builtin-only agent. Call deleteAgent().
6. `awsl agents reset <name>` — Delete override file for a builtin agent, restoring default. Only works if agent name is in BUILTINS.

Update the `usage()` function to document all new subcommands.

The agentsDir should be `path.join(cwd, 'agents')` where cwd comes from --cwd flag or process.cwd().

### Verify
npx tsc --noEmit

### Done
awsl agents show/create/edit/delete/reset subcommands implemented and type-check passes

## task_4: Dashboard UI agent editor
- **Assignee:** coder
- **Dependencies:** task_2
- **Files:** public/dashboard.html

### Action
Add an 'Agent Roles' (角色管理) collapsible card section to public/dashboard.html, following the existing pixel art UI style.

Add AFTER the existing card sections:

1. **Agent Roles Card** — Collapsible section with header '角色管理' and a [+New] button. Shows agent cards in a grid/flex layout. Each card shows: agent name, role badge, source badge ('built-in' grey / 'custom' green / 'override' yellow). Cards are clickable to open editor.

2. **Agent Editor Modal** — A modal dialog (overlay) with:
   - Name field (text input, readonly when editing existing)
   - Role dropdown (planner, architect, coder, reviewer, tester, custom)
   - Description text input
   - Model text input (optional)
   - Tools text input (comma-separated, optional)
   - Skills text input (comma-separated, optional)
   - Thinking level dropdown (low, medium, high, optional)
   - System Prompt textarea (large, monospaced, min 200px height)
   - Action buttons: [Save] [Reset to Default] (only for builtins) [Delete] (only for custom)

3. **JavaScript integration** — Add functions:
   - `loadAgents()` — GET /api/agents, render agent cards
   - `openAgentEditor(name?)` — Open modal, pre-fill if editing
   - `saveAgent()` — POST (new) or PUT (edit) /api/agents
   - `deleteAgent(name)` — DELETE /api/agents?name=X with confirmation
   - `resetAgent(name)` — DELETE override, reload to show builtin default

Match existing dashboard styling: pixel art aesthetic, dark theme (#0a0a1a background), green accent (#00ff41), monospace fonts, card-based layout with borders.

Call `loadAgents()` on page load alongside existing data loading.

### Verify
npx tsc --noEmit

### Done
Agent Roles card with editor modal renders in dashboard, CRUD operations work via API

## task_5: Remote relay agent commands
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/remote.ts

### Action
Add agent management commands to the RemoteClient's executeCommand switch in src/remote.ts. Import `loadAgents`, `saveAgent`, `deleteAgent` from `./agents.js`.

Add these cases to the switch(action) block:

1. `agents:list` — Load agents from [path.join(this.options.cwd, 'agents')], return TeamAgentDef[].
2. `agents:get` — Get payload.name, find in loaded agents, return agent or null.
3. `agents:save` — Get agent fields from payload, call saveAgent(agentsDir, payload). Return saved agent.
4. `agents:delete` — Get payload.name, call deleteAgent(agentsDir, payload.name). Return { deleted: boolean }.

The agentsDir is `path.join(this.options.cwd, 'agents')`.

### Verify
npx tsc --noEmit

### Done
agents:list, agents:get, agents:save, agents:delete relay commands handled in remote.ts

## task_6: Unit tests for agent CRUD
- **Assignee:** tester
- **Dependencies:** task_1
- **Files:** tests/agents.test.ts

### Action
Create tests/agents.test.ts using node:test and node:assert/strict. Test the new agent CRUD functions:

1. `serializeAgent` — Test that a TeamAgentDef serializes to valid frontmatter + markdown body. Verify round-trip: serialize → parse → same data.
2. `saveAgent` — Create temp dir, save an agent, verify file exists with correct content. Test merging: save partial update, verify fields merged.
3. `deleteAgent` — Save agent, delete it, verify file removed. Test deleting non-existent returns false.
4. `getAgent` — Load agents from temp dir, verify getAgent finds by name. Test not-found returns undefined.
5. Name validation — Test that saveAgent rejects invalid names (uppercase, special chars, too long, empty).
6. Built-in agents — Verify BUILTINS array contains expected agents (planner, architect, coder, reviewer, tester).

Use `fs.mkdtempSync(path.join(os.tmpdir(), 'awsl-test-'))` for temp dirs with `finally` cleanup. Import from '../src/agents.js'.

### Verify
npx tsx tests/agents.test.ts

### Done
All agent CRUD tests pass: serialize, save, delete, get, validation, builtins

## task_7: Documentation update
- **Assignee:** coder
- **Dependencies:** task_2, task_3, task_4, task_5
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files to cover the new custom role prompts feature:

**README.md** (English):
- Add section about custom agent roles under features
- Document CLI commands: `awsl agents show/create/edit/delete/reset` with examples
- Document Dashboard agent editor UI
- Document API endpoints: GET/POST/PUT/DELETE /api/agents

**README.zh-CN.md** (Chinese):
- Mirror all README.md changes in Chinese
- 角色管理 section with CLI and Dashboard usage

**BEST_PRACTICES.md** (Chinese):
- Add practical examples of creating custom agents
- Show how to customize built-in agent prompts
- Document the agent .md file format (YAML frontmatter + markdown body)
- Add tips: when to customize vs create new, how to reset to defaults

### Verify
cat README.md | head -5

### Done
All three docs updated with custom role prompts feature documentation

## task_8: Security review
- **Assignee:** reviewer
- **Dependencies:** task_1, task_2, task_3, task_5
- **Files:** src/agents.ts, src/dashboard.ts, src/cli.ts, src/remote.ts

### Action
Review all new code for security issues:

1. **Path traversal** — Verify agent name validation prevents `../` or absolute paths in saveAgent/deleteAgent. Check that file operations stay within the agents directory.
2. **Input validation** — Verify all API endpoints validate input before processing. Check name regex enforcement.
3. **XSS** — Verify dashboard HTML properly escapes agent data before rendering (name, description, systemPrompt). No innerHTML with unsanitized user input.
4. **File system safety** — Verify atomic writes (tmp+rename pattern). Verify no race conditions in CRUD operations.
5. **Authorization** — Verify DELETE cannot remove built-in agent source files.
6. **Body size** — Verify collectBody's MAX_BODY limit applies to agent endpoints.

Report findings via the report tool. Flag any issues that need fixing.

### Verify
npx tsc --noEmit

### Done
All new code reviewed for path traversal, XSS, input validation, and file safety issues
