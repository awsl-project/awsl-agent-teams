# task_7: Update all three documentation files to cover the new custom

Assignee: coder
Status: done

## Result
All three documentation files have been updated.

## AWSL_RESULT

### Task 7 Complete: Documentation Updated for Custom Role Prompts Feature

**Files modified:**

| File | Changes |
|------|---------|
| **README.md** (English) | Expanded Custom Agents section with CLI commands, Dashboard UI, and API table. Added agent subcommands to Auxiliary Commands and CLI Reference. Added Agent Roles management to Dashboard features. Added 4 agent API endpoints. Updated relay commands list. |
| **README.zh-CN.md** (Chinese) | Mirrored all README.md changes in Chinese. Added 通过 CLI/仪表盘管理智能体 sections, 智能体 CRUD API table, agent subcommands in 辅助命令 and CLI 参考, 角色管理 in dashboard features, agent API endpoints, updated relay commands. |
| **BEST_PRACTICES.md** (Chinese) | Expanded Section 5 significantly: added 3 management methods table (file/CLI/dashboard), detailed file format explanation (YAML frontmatter + markdown body), CLI examples for create/show/edit/delete/reset, override mechanism guide, dashboard UI usage steps, "when to customize vs create new" decision table, and practical tips (git tracking, reset workflow). |

**Key documentation additions:**
- CLI commands: `agents show/create/edit/delete/reset` with full flag reference
- Dashboard: Agent Roles card with visual editor modal
- API: GET/POST/PUT/DELETE `/api/agents` endpoints
- Relay: `agents:list/get/save/delete` commands
- Best practices: when to override built-ins vs create new agents, file format guide, reset workflow