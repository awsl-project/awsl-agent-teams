# Design: Enhanced Custom Role Prompts (自定义角色提示词增强)

## Status: APPROVED
## Author: architect
## Date: 2026-03-11

---

## Problem Statement

The basic agent CRUD (create/edit/delete) already works in both the dashboard and CLI.
However, the **prompt editing experience** has significant gaps:

1. **Dashboard textarea too small** (200px min-height) for multi-paragraph system prompts
2. **No prompt templates** — users don't know what a good prompt looks like
3. **CLI editing is awkward** — must pass entire prompt as `--prompt "..."` or via `--prompt-file`
4. **No prompt preview** — can't see the final composed prompt (base + guardian skills + team context)
5. **No shortcut** for "just edit the prompt" without touching other agent fields
6. **No character count** or feedback on prompt size

---

## Design Overview

```
┌─────────────────────────────────────────────────┐
│              Prompt Templates Registry            │
│  (PROMPT_TEMPLATES in src/agents.ts)             │
│  coder | reviewer | architect | tester |         │
│  planner | devops | documenter                   │
└──────────┬──────────────────┬────────────────────┘
           │                  │
    ┌──────▼──────┐   ┌──────▼──────┐
    │  Dashboard  │   │    CLI      │
    │  ─────────  │   │  ─────────  │
    │  Fullscreen │   │  $EDITOR    │
    │  editor     │   │  support    │
    │  Template   │   │  --template │
    │  picker     │   │  `prompt`   │
    │  Preview    │   │  subcommand │
    │  Char count │   │  `preview`  │
    └──────┬──────┘   └──────┬──────┘
           │                  │
    ┌──────▼──────────────────▼──────┐
    │         /api/agents            │
    │  (existing CRUD)               │
    │  + GET /api/agents/templates   │
    │  + GET /api/agents/preview     │
    └────────────────────────────────┘
```

---

## Detailed Design

### 1. Prompt Templates Registry (`src/agents.ts`)

Add `PROMPT_TEMPLATES` constant and `getPromptTemplates()` function.

```typescript
export const PROMPT_TEMPLATES: Record<string, { description: string; prompt: string }> = {
  coder: {
    description: "Full-stack developer with TDD focus",
    prompt: "You are a senior software engineer.\n\n..."
  },
  reviewer: {
    description: "Security-focused code reviewer",
    prompt: "You are a code reviewer focused on security and quality.\n\n..."
  },
  architect: {
    description: "System architecture designer",
    prompt: "You are a senior software architect.\n\n..."
  },
  tester: {
    description: "QA engineer with edge-case focus",
    prompt: "You are a QA engineer.\n\n..."
  },
  planner: {
    description: "Task decomposition specialist",
    prompt: "You decompose complex goals into concrete, verifiable subtasks.\n\n..."
  },
  devops: {
    description: "CI/CD and infrastructure specialist",
    prompt: "You are a DevOps engineer.\n\n..."
  },
  documenter: {
    description: "Technical documentation writer",
    prompt: "You are a technical writer.\n\n..."
  }
};

export function getPromptTemplates(): Array<{ name: string; description: string; prompt: string }> {
  return Object.entries(PROMPT_TEMPLATES).map(([name, t]) => ({ name, ...t }));
}
```

**Decision**: Templates are hardcoded constants, not files. Simpler, no I/O, version-controlled.

### 2. Prompt Composition Preview (`src/agents.ts`)

New function to compose the full agent prompt preview:

```typescript
export function composePromptPreview(
  agent: TeamAgentDef,
  allAgents: TeamAgentDef[],
  skillInstructions: string
): { composed: string; sections: { base: string; skills: string; team: string } } {
  const teamRoster = allAgents
    .filter(a => a.name !== agent.name)
    .map(a => `- **${a.name}** (${a.role}): ${a.description}`)
    .join("\n");
  return {
    composed: `# Agent: ${agent.name} (${agent.role})\n\n${agent.systemPrompt}` +
      (skillInstructions ? `\n\n${skillInstructions}` : '') +
      `\n\n## Team Context\n${teamRoster}\n\n## Shared Memory\n(populated at runtime)`,
    sections: {
      base: agent.systemPrompt,
      skills: skillInstructions || '(none)',
      team: teamRoster,
    }
  };
}
```

### 3. New API Endpoints (`src/dashboard.ts`)

```
GET /api/agents/templates
  → Returns: Array<{ name, description, prompt }>

GET /api/agents/preview?name=<name>
  → Returns: { composed, sections: { base, skills, team } }
```

The preview endpoint calls `composePromptPreview()` with the agent's skill instructions
resolved via `SkillRegistry.buildInstructions(agent.role, agent.skills)`.

### 4. Dashboard Enhancements (`public/dashboard.html`)

#### 4a. Fullscreen Prompt Editor

New overlay that covers the entire viewport:

```html
<div id="promptFullscreen" class="prompt-fullscreen" style="display:none">
  <div class="prompt-fs-header">
    <span class="prompt-fs-title">System Prompt</span>
    <span class="prompt-fs-count" id="pfCharCount">0 chars</span>
    <button onclick="closePromptFullscreen()" class="prompt-fs-close">Done</button>
  </div>
  <textarea id="pfTextarea" class="prompt-fs-textarea"></textarea>
</div>
```

CSS:
```css
.prompt-fullscreen {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: var(--bg); z-index: 500;
  display: flex; flex-direction: column;
}
.prompt-fs-textarea {
  flex: 1; font-family: monospace; font-size: 13px;
  line-height: 1.6; padding: 20px; border: none;
  resize: none; background: var(--bg); color: var(--ink); outline: none;
}
```

Add "⛶" (expand) button next to the System Prompt label in the modal.
The fullscreen textarea syncs bidirectionally with `aePromptTextarea`.

#### 4b. Template Picker

Add a `<select>` dropdown in the modal that loads templates from `/api/agents/templates`.
Selecting a template fills in the textarea (with confirmation if current content is non-empty).

```html
<select id="aeTemplateSelect" onchange="applyTemplate()">
  <option value="">— Use template —</option>
  <!-- dynamically populated -->
</select>
```

#### 4c. Character Count

Real-time character count display next to the System Prompt label.
Updates on every `input` event on the textarea.

#### 4d. Preview Button

Add "Preview" button in modal actions bar.
Fetches `/api/agents/preview?name=X` and shows the composed prompt in a
read-only fullscreen overlay (reusing the fullscreen editor structure but readonly).

### 5. CLI Enhancements (`src/cli.ts`)

#### 5a. `awsl agents prompt <name>` — Focused prompt editing

```
awsl agents prompt <name>              # Opens prompt in $EDITOR
awsl agents prompt <name> --show       # Print current prompt to stdout
awsl agents prompt <name> --set "..."  # Set prompt inline
awsl agents prompt <name> --file path  # Set prompt from file
```

Implementation: Writes current prompt to temp file, opens `$EDITOR` (or `notepad` on Windows),
reads back, saves if changed.

#### 5b. `awsl agents preview <name>` — Show composed prompt

Prints the full composed prompt (base + guardian skills + team context) to stdout
with section headers and character counts.

#### 5c. `--template` flag for create/edit

```
awsl agents create my-coder --template coder
awsl agents create my-reviewer --template reviewer --description "My reviewer"
```

Pre-populates `systemPrompt` (and `role` if not specified) from the template registry.

#### 5d. `$EDITOR` support in `agents edit`

When `awsl agents edit <name>` is called without `--prompt` or `--prompt-file`,
open the current prompt in `$EDITOR` for interactive editing.

### 6. Remote Client (`src/remote.ts`)

Add command handlers:
- `agents:templates` → returns `getPromptTemplates()`
- `agents:preview` → returns `composePromptPreview()` result

### 7. Exports (`src/index.ts`)

Re-export: `PROMPT_TEMPLATES`, `getPromptTemplates`, `composePromptPreview`

---

## File Changes Summary

| File | Changes |
|------|---------|
| `src/agents.ts` | + `PROMPT_TEMPLATES`, + `getPromptTemplates()`, + `composePromptPreview()` |
| `src/dashboard.ts` | + `GET /api/agents/templates`, + `GET /api/agents/preview?name=` |
| `src/cli.ts` | + `agents prompt` subcommand, + `agents preview`, + `--template` flag, + `$EDITOR` |
| `src/remote.ts` | + `agents:templates`, + `agents:preview` commands |
| `src/index.ts` | + re-export new functions |
| `public/dashboard.html` | + fullscreen editor, + template picker, + preview button, + char count |
| `README.md` | + document prompt customization enhancements |
| `README.zh-CN.md` | + mirror documentation |
| `BEST_PRACTICES.md` | + prompt writing tips, template usage examples |

---

## Task Breakdown

### Wave 1 (parallel — no dependencies)

| ID | Task | Assignee | Files |
|----|------|----------|-------|
| task_1 | Add PROMPT_TEMPLATES, getPromptTemplates(), composePromptPreview() to agents.ts + re-export from index.ts | coder | src/agents.ts, src/index.ts |
| task_2 | Add fullscreen prompt editor overlay + char count + expand button to dashboard.html | coder | public/dashboard.html |

### Wave 2 (depends on task_1)

| ID | Task | Assignee | Files |
|----|------|----------|-------|
| task_3 | Add /api/agents/templates and /api/agents/preview endpoints to dashboard.ts | coder | src/dashboard.ts |
| task_4 | Add CLI: agents prompt, agents preview, --template flag, $EDITOR support | coder | src/cli.ts |
| task_5 | Add agents:templates and agents:preview to remote client | coder | src/remote.ts |

### Wave 3 (depends on task_2 + task_3)

| ID | Task | Assignee | Files |
|----|------|----------|-------|
| task_6 | Wire dashboard template picker + preview button to new API endpoints | coder | public/dashboard.html |

### Wave 4 (depends on all above)

| ID | Task | Assignee | Files |
|----|------|----------|-------|
| task_7 | Update README.md, README.zh-CN.md, BEST_PRACTICES.md | coder | README.md, README.zh-CN.md, BEST_PRACTICES.md |

---

## Key Decisions & Rationale

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Templates as hardcoded constants, not files | Simpler, no I/O, version-controlled with codebase |
| 2 | Fullscreen editor via fixed overlay, not new page | Preserves SPA architecture, no routing needed |
| 3 | `$EDITOR` with `notepad` fallback on Windows | Most reliable cross-platform interactive editing |
| 4 | Preview shows all composed sections | Debugging agent behavior requires seeing the full prompt |
| 5 | `agents prompt` as dedicated subcommand | Most common operation deserves a shortcut |
| 6 | 7 built-in templates covering common roles | Good coverage without overwhelming choice |
| 7 | Templates only set prompt text, not tools/model/skills | Keep templates focused; other fields are orthogonal |
| 8 | Bidirectional sync between modal textarea and fullscreen | No data loss when switching between compact/fullscreen editing |
