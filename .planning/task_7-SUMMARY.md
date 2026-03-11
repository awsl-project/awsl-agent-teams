# task_7: Documentation update

Assignee: coder
Status: done

## Result
All documentation is updated consistently. Here's the summary:

## AWSL_RESULT

### Task 7: Documentation Update — Complete

Updated 3 documentation files to cover all new prompt template and editing features:

| File | Changes |
|------|---------|
| **README.md** (English) | 7 edits: CLI agents section (+templates, prompt, preview, --template), Dashboard managing section (+template selector, fullscreen editor, char count, preview panel), Agent CRUD API table (+2 endpoints), Dashboard features list (+3 features), API endpoints list (+2), relay commands (+2), CLI Reference (+3 commands), auxiliary commands (+3) |
| **README.zh-CN.md** (Chinese) | 7 edits: Same changes mirrored in Chinese — CLI agents section, dashboard section, API table, features list, API endpoints, relay commands, CLI Reference, auxiliary commands |
| **BEST_PRACTICES.md** | 4 edits: Section 1 command list (+3 entries), Section 5 CLI management (+template create, `agents prompt` with examples, `agents preview` with examples), new "内置提示词模板" subsection (7 templates table + usage examples + when-to-use guide), Dashboard UI management section (+template, fullscreen, preview steps) |

### Sections Updated

- **CLI commands**: `agents templates`, `agents prompt <name>` (--show/--set/--file), `agents preview <name>`, `--template` flag
- **Dashboard UI**: template selector dropdown, fullscreen editor overlay, live character count, preview panel with tabs
- **API endpoints**: `GET /api/agents/templates`, `POST /api/agents/preview`
- **Remote relay**: `agents:templates`, `agents:preview`
- **TypeScript build**: clean (no regressions)