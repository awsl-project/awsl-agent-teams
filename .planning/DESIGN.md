## AWSL_RESULT

### 分析结论

Timeline 里的 `[clear]` 实际上是**项目筛选重置**（清除 `filterProj`），它本身功能正常——只在选中某个项目筛选后才显示。

真正缺失的是：**清除历史记录**功能未接入 Dashboard。

### 现状

| 组件 | 状态 |
|------|------|
| `clearHistory()` 后端函数 | 已实现 (`src/history.ts:98-107`) |
| `POST /api/history/clear` API | 未实现 |
| Dashboard "Clear History" 按钮 | 未实现 |
| 筛选 `[clear]` 重置 | 正常工作 (`dashboard.html:909`) |

### 设计方案：3 处改动，2 个文件

1. **`src/dashboard.ts`** — import 加上 `clearHistory`，新增 `POST /api/history/clear` 端点（仿照已有的 `/api/queue/clear`）
2. **`public/dashboard.html`** — Timeline 卡片底部加 "Clear History" 按钮（复用 Queue 的 `queue-actions` 样式）
3. **`public/dashboard.html`** — 加 JS `clearHistory()` 函数，带 `confirm()` 确认弹窗，调用 API 后刷新

### 关键决策
- 用 `confirm()` 防止误删（历史不可恢复）
- 复用已有 `clearHistory()` 后端函数，不写新逻辑
- UI 模式完全对齐 Queue 的 "Clear All" 按钮
- 不动现有的筛选 `[clear]`，它工作正常

### 产出文件
- `memory/design-timeline-clear.md` — 完整设计文档