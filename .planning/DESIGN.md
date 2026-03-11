## AWSL_RESULT

### Design: Custom Role Prompts (Dashboard + CLI)

**Design document saved to:** `.planning/DESIGN-custom-role-prompts.md`

---

### Socratic Analysis Summary

**核心需求**: 用户希望通过 Dashboard 和 CLI 两个入口自定义 Agent 的角色提示词（system prompt），而不是手动编辑 `.md` 文件。

**评估了 3 种方案**:
| 方案 | 选择 | 原因 |
|------|------|------|
| A: Agent CRUD API + 文件存储 | **✓ 采用** | 复用已有 `.md` 格式，标准 REST API，可 git 追踪 |
| B: Prompt Override 覆盖层 | ✗ | 合并逻辑复杂，心智模型混乱 |
| C: JSON 配置存储 | ✗ | 打破现有约定，丢失 markdown 可读性 |

---

### Key Architecture Decisions

1. **复用 `.md` 文件格式** — 无需迁移，git 可追踪，人类可读
2. **内置 Agent 只读，自定义通过 `./agents/{name}.md` 覆盖** — 防止破坏，清晰心智模型
3. **REST API 在 dashboard.ts** — `GET/POST/PUT/DELETE /api/agents`
4. **CLI 子命令** — `agents show/create/edit/delete/reset`
5. **Dashboard 模态编辑器** — 大文本区域编辑提示词，支持所有字段
6. **Relay 支持** — `agents:list/get/save/delete` 命令，远程管理

### Files to Modify (8 files)

| Wave | File | Changes |
|------|------|---------|
| 1 | `src/agents.ts` | Add `serializeAgent()`, `saveAgent()`, `deleteAgent()`, `getAgent()` |
| 1→2 | `src/dashboard.ts` | Add `/api/agents` CRUD endpoints |
| 1→2 | `src/cli.ts` | Add `agents show/create/edit/delete/reset` subcommands |
| 2 | `public/dashboard.html` | Add Agent Roles card + editor modal |
| 2 | `src/remote.ts` | Handle `agents:*` relay commands |
| 3 | `README.md`, `README.zh-CN.md`, `BEST_PRACTICES.md` | Documentation |

### Task Graph (8 tasks, 4 waves)

```
Wave 1: task_1 (agents.ts CRUD functions)
Wave 2: task_2 (API endpoints) + task_3 (CLI commands) + task_5 (relay)  [parallel]
Wave 3: task_4 (dashboard UI) + task_6 (docs) + task_7 (review)         [parallel]
Wave 4: task_8 (tests)
```