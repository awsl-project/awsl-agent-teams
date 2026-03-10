## AWSL_RESULT

### 设计：远程 Timeline 折叠修复

**问题分析**：Timeline 折叠功能已实现（板块级 + 按天），但存在以下问题：

1. **按天折叠状态每次重渲染丢失** — `renderTimeline()` 每次调用都 `el.innerHTML = ''` 重建 DOM，30秒轮询触发 `render()` 后所有日分组恢复展开状态
2. **`clearHistory()` 未适配远程** — 始终调用本地 API `/api/history/clear`，选中远程客户端时应禁用
3. **无视觉上下文** — 无法区分当前 Timeline 显示的是本地还是远程数据

**方案**：在 `renderTimeline()` 中加入折叠状态追踪（JS 变量 `collapsedDates`），以 `viewKey|date` 为 key，每个视图（本地 / 各远程客户端）独立维护折叠状态。重渲染前保存、重建后恢复。

**改动范围**：仅 `public/dashboard.html`，约 20 行 JS 变更

**关键决策**：
| 决策 | 选择 | 理由 |
|------|------|------|
| 状态存储 | JS 变量 Map | 跨重渲染存活，无需持久化 |
| View key | `selectedClient \|\| '_local'` | 每个视图独立状态 |
| Clear History | 远程时禁用 | 远程不支持清除历史 |

**产出文件**：
- `.planning/designs/timeline-remote-collapse.md` — 完整设计文档（含代码示例）
- `.planning/DESIGN.md` — 共享摘要（供 coder 读取）