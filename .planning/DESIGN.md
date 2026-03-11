## AWSL_RESULT

### Design: Enhanced Custom Role Prompts (自定义角色提示词增强)

**核心发现**: Agent CRUD 基础设施已经存在（dashboard 的角色管理 + CLI 的 `awsl agents` 命令）。用户需要的是**提示词编辑体验的增强**。

### 设计要点

**3 个核心问题 → 3 个解决方案**:

| 问题 | 解决方案 |
|------|---------|
| Dashboard 文本框太小，编辑长提示词体验差 | 全屏编辑器 overlay + 字符计数 |
| 用户不知道怎么写好的提示词 | 7 个内置角色模板 (coder/reviewer/architect/tester/planner/devops/documenter) |
| CLI 编辑提示词不方便，看不到最终效果 | `$EDITOR` 交互编辑 + `agents prompt` 快捷命令 + `agents preview` 预览合成提示词 |

### 文件变更

| 文件 | 变更 |
|------|------|
| `src/agents.ts` | + `PROMPT_TEMPLATES`, `getPromptTemplates()`, `composePromptPreview()` |
| `src/dashboard.ts` | + `GET /api/agents/templates`, `GET /api/agents/preview` |
| `src/cli.ts` | + `agents prompt`, `agents preview`, `--template` flag, `$EDITOR` support |
| `src/remote.ts` | + `agents:templates`, `agents:preview` commands |
| `public/dashboard.html` | + 全屏编辑器、模板选择器、预览按钮、字符计数 |
| 文档 x3 | README.md, README.zh-CN.md, BEST_PRACTICES.md |

### 4 波执行计划 (7 个任务)

- **Wave 1**: 模板注册表 + 全屏编辑器 UI (并行)
- **Wave 2**: API 端点 + CLI 命令 + 远程客户端 (并行)
- **Wave 3**: Dashboard 接线 (模板选择器 + 预览按钮连接 API)
- **Wave 4**: 文档更新

### 产出文件
- `.planning/DESIGN-custom-role-prompts.md` — 完整设计文档
- `.planning/shared-memory.json` — 共享内存（供其他 agent 读取）