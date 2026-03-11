# Design: Custom Role Prompts (Dashboard + CLI)

## Socratic Brainstorming

### 1. Explore — What is the user actually trying to achieve?

The user wants to **customize agent role prompts** (the system instructions that define how each agent behaves) from **two surfaces**:
- **Dashboard (web panel)**: Visual editor for creating/editing agent definitions
- **Local terminal (CLI)**: Commands for managing agent definitions

Currently, agents can be customized only by manually creating `.md` files in `./agents/`. There's no UI, no API, and the CLI only has a read-only `agents` list command.

### 2. Explore — Constraints

- Current agent system uses file-based `.md` definitions with YAML frontmatter
- Dashboard communicates via raw HTTP (no framework, `http.createServer`)
- Remote clients communicate via WebSocket relay (`relay.ts`)
- TypeScript strict mode, ES module imports with `.js` extensions
- Must update README.md, README.zh-CN.md, BEST_PRACTICES.md per CLAUDE.md rules

### 3. Explore — Three Alternatives

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **A: Agent CRUD API + File Storage** | REST endpoints + dashboard editor + CLI commands. Reads/writes `./agents/*.md` files. | Full-featured, leverages existing format, proper separation | Most work |
| **B: Prompt Override Layer** | Keep existing loading, add `.planning/prompt-overrides.json` merge layer | Lighter, non-destructive | Override merging is fragile, confusing mental model |
| **C: JSON Config Store** | Store agent definitions in `.planning/agents.json` instead of `.md` files | Easier API parsing | Breaks existing convention, loses markdown readability |

### 4. Challenge — Assumptions & Risks

- **Assumption**: Users want to customize both built-in agents AND create new ones → **Valid** (the feature request is about customizing "role prompts", implying both)
- **Risk**: Editing built-in agents could break orchestration → **Mitigated**: overrides create files in `./agents/`, originals stay in code
- **Risk**: Concurrent edits from multiple dashboard sessions → **Low risk**: file writes are atomic (write-tmp-then-rename)
- **Risk**: Malformed YAML from user input → **Mitigated**: validate before saving, return clear errors
- **Risk**: Agent name conflicts with special characters → **Mitigated**: sanitize name to `[a-z0-9-]` pattern

### 5. Decision

**Approach A: Agent CRUD API + File Storage**

Rationale:
- Builds on the existing `.md` file format — no migration, no new storage layer
- Proper REST API works for dashboard, CLI, and future integrations
- Built-in agents stay read-only in code; "customizing" a built-in creates an override file in `./agents/`
- The `.md` format is human-readable and git-trackable
- Simplest conceptual model: what you see in `./agents/` is what you get

---

## Architecture

### Data Model

No changes to `TeamAgentDef` interface. The existing structure already has everything needed:

```typescript
// src/agents.ts (existing — no changes needed)
interface TeamAgentDef {
  name: string;          // unique identifier, also filename
  role: string;          // architect, coder, reviewer, tester, planner, custom
  description: string;   // human-readable purpose
  model?: string;        // optional model override
  tools?: string[];      // allowed tools
  skills?: string[];     // explicit skill names
  thinkingLevel?: string; // low, medium, high
  systemPrompt: string;  // THE ROLE PROMPT — this is what users customize
  source: "file" | "builtin";
}
```

### New Functions in `src/agents.ts`

```typescript
/** Serialize a TeamAgentDef to frontmatter + markdown body */
export function serializeAgent(agent: TeamAgentDef): string;

/** Save agent to a directory as {name}.md */
export function saveAgent(dir: string, agent: Partial<TeamAgentDef> & { name: string }): void;

/** Delete agent file from directory */
export function deleteAgent(dir: string, name: string): boolean;

/** Get a single agent by name from loaded agents */
export function getAgent(dirs: string[], name: string): TeamAgentDef | undefined;
```

### API Endpoints (in `src/dashboard.ts`)

All endpoints operate on `./agents/` relative to the dashboard's `cwd`.

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `GET` | `/api/agents` | List all agents | — | `TeamAgentDef[]` |
| `GET` | `/api/agents?name=X` | Get single agent | — | `TeamAgentDef` |
| `POST` | `/api/agents` | Create new agent | `{ name, role, description, systemPrompt, model?, tools?, skills?, thinkingLevel? }` | `TeamAgentDef` |
| `PUT` | `/api/agents` | Update agent | `{ name, ...fields }` | `TeamAgentDef` |
| `DELETE` | `/api/agents?name=X` | Delete custom agent | — | `{ deleted: boolean }` |

**Validation rules:**
- `name`: required, must match `/^[a-z][a-z0-9-]*$/`, max 50 chars
- `role`: required, must be one of `planner|architect|coder|reviewer|tester|custom` or any string
- `systemPrompt`: required, non-empty string
- Cannot DELETE a built-in agent (only its override file)
- Cannot create an agent with name that matches built-in unless it's explicitly an override

### CLI Commands (in `src/cli.ts`)

```
awsl agents                     # List all agents (existing, enhanced output)
awsl agents show <name>         # Show full agent definition with prompt
awsl agents create <name>       # Create new agent interactively or with flags
  --role <role>                 # Role (default: custom)
  --description <desc>          # Short description
  --prompt <text>               # System prompt (inline)
  --prompt-file <path>          # System prompt from file
  --tools <t1,t2>              # Tools list
  --model <model>               # Model override
awsl agents edit <name>         # Edit agent prompt (opens $EDITOR or accepts flags)
  --prompt <text>               # New system prompt
  --prompt-file <path>          # New system prompt from file
  --role <role>                 # Update role
  --description <desc>          # Update description
awsl agents delete <name>       # Delete custom agent file
awsl agents reset <name>        # Delete override, restore built-in default
```

### Dashboard UI (in `public/dashboard.html`)

Add a new collapsible card section **"Agent Roles"** (角色管理) in the dashboard:

#### Layout
```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Agent Roles (角色管理)                        [+New] │
├─────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │ planner  │ │architect │ │  coder   │ │ reviewer │   │
│ │ built-in │ │ built-in │ │ custom ✎│ │ custom ✎│   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│ ┌──────────┐ ┌──────────┐                              │
│ │  tester  │ │my-agent  │                              │
│ │ built-in │ │ custom ✎│                              │
│ └──────────┘ └──────────┘                              │
└─────────────────────────────────────────────────────────┘
```

#### Agent Editor Modal
When clicking an agent card or [+New]:

```
┌─────────────────────────────────────────────────────────┐
│ Edit Agent: coder                              [×Close] │
├─────────────────────────────────────────────────────────┤
│ Name:        [coder          ]  (readonly if editing)   │
│ Role:        [coder     ▾]                              │
│ Description: [Full-stack TypeScript developer        ]  │
│ Model:       [                ] (optional)              │
│ Tools:       [read,write,edit,bash              ]       │
│ Skills:      [                ] (optional)              │
│ Thinking:    [medium    ▾]                              │
│                                                         │
│ System Prompt (角色提示词):                              │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ You are a senior full-stack TypeScript developer.   │ │
│ │                                                     │ │
│ │ ## Guidelines                                       │ │
│ │ - Write complete, runnable code...                  │ │
│ │ - Use strict TypeScript...                          │ │
│ │                                                     │ │
│ │                                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [Save]  [Reset to Default]  [Delete]                    │
└─────────────────────────────────────────────────────────┘
```

#### UI Behavior
- **Built-in agents**: Clicking opens editor pre-filled with built-in values. Saving creates `./agents/{name}.md` (override). Shows "Reset to Default" button.
- **Custom agents**: Full CRUD. Shows "Delete" button.
- **Card badges**: "built-in" (grey), "custom" (green), "override" (yellow — custom file overriding a built-in)
- **System prompt textarea**: Large, monospaced font, supports markdown preview toggle
- **Validation**: Real-time name validation, prevent save with empty prompt

### Relay Integration

For remote clients, add new relay command types:

```typescript
// New commands supported by RemoteClient
"agents:list"   → returns TeamAgentDef[]
"agents:get"    → { name: string } → TeamAgentDef | null
"agents:save"   → { name, role, description, systemPrompt, ... } → TeamAgentDef
"agents:delete" → { name: string } → { deleted: boolean }
```

The dashboard sends these via `POST /api/clients/command` to manage agents on remote machines.

---

## Implementation Plan

### Files to Modify

| File | Changes |
|------|---------|
| `src/agents.ts` | Add `serializeAgent()`, `saveAgent()`, `deleteAgent()`, `getAgent()` |
| `src/dashboard.ts` | Add `/api/agents` CRUD endpoints |
| `src/cli.ts` | Add `agents show/create/edit/delete/reset` subcommands, update `usage()` |
| `public/dashboard.html` | Add Agent Roles card, editor modal, API integration JS |
| `src/remote.ts` | Handle `agents:*` relay commands |
| `src/index.ts` | Re-export new functions from agents.ts |
| `README.md` | Document new feature |
| `README.zh-CN.md` | Mirror documentation |
| `BEST_PRACTICES.md` | Add usage examples |

### Task Breakdown

#### Wave 1 (parallel — no dependencies)

**task_1**: `agents.ts` — Add `serializeAgent`, `saveAgent`, `deleteAgent`, `getAgent`
- Assignee: coder
- Files: `src/agents.ts`, `src/index.ts`

**task_2**: `dashboard.ts` — Add `/api/agents` CRUD endpoints
- Assignee: coder
- Files: `src/dashboard.ts`
- Depends on: task_1

**task_3**: `cli.ts` — Add `agents show/create/edit/delete/reset` subcommands
- Assignee: coder
- Files: `src/cli.ts`
- Depends on: task_1

#### Wave 2 (parallel — depends on wave 1)

**task_4**: `dashboard.html` — Add Agent Roles card + editor modal + JS integration
- Assignee: coder
- Files: `public/dashboard.html`
- Depends on: task_2

**task_5**: `remote.ts` — Handle `agents:*` relay commands
- Assignee: coder
- Files: `src/remote.ts`
- Depends on: task_1

#### Wave 3 (parallel — depends on wave 2)

**task_6**: Documentation — Update README.md, README.zh-CN.md, BEST_PRACTICES.md
- Assignee: coder
- Files: `README.md`, `README.zh-CN.md`, `BEST_PRACTICES.md`
- Depends on: task_4, task_5

**task_7**: Review all changes
- Assignee: reviewer
- Depends on: task_1, task_2, task_3, task_4, task_5

#### Wave 4

**task_8**: Tests
- Assignee: tester
- Files: `tests/agents.test.ts`
- Depends on: task_7

---

## Key Decisions Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Use existing `.md` file format | No migration, git-trackable, human-readable |
| 2 | CRUD via REST API in dashboard.ts | Standard pattern, consistent with existing `/api/queue/*` endpoints |
| 3 | CLI subcommands under `agents` | Natural extension of existing `agents` command |
| 4 | Built-ins are read-only, overrides create files | Prevents corruption, clear mental model |
| 5 | Agent name validation: `[a-z][a-z0-9-]*` | Safe for filenames, URL paths, YAML keys |
| 6 | System prompt is the markdown body (not a separate field) | Consistent with existing `.md` format |
| 7 | Dashboard uses modal editor (not inline) | More space for prompt editing, cleaner UX |
| 8 | Relay support for remote agent management | Enables centralized control from dashboard |
