## AWSL_RESULT

### 设计完成：Dashboard Projects 管理页面

**核心发现：后端已 100% 完成**，`src/projects.ts` (ProjectManager) + 10+ API 端点 + 13 个测试全部就绪。本次开发**纯前端**，只修改 `public/dashboard.html`。

---

### 方案选择

| 方案 | 评估 |
|------|------|
| **A: 新增 Projects 卡片区（类似 Machines）** | **✅ 选中** — 与现有 UI 模式一致，改动最小 |
| B: Tab 导航系统 | ❌ 过度重构 |
| C: 扩展现有侧边栏 | ❌ 空间不足，队列管理体验差 |

### 关键决策

| 决策 | 理由 |
|------|------|
| 复用 Machines 卡片交互模式 | 用户已熟悉：选卡片 → 操作栏 → Queue 面板切换 |
| 无需后端改动 | 所有 API 已存在且测试通过 |
| 上下文优先级：Project > Machine > Local | 避免歧义，同时只有一个上下文活跃 |
| Projects 区块始终可见 | 主要功能，空状态显示 Scan/Add 按钮 |
| 30s 轮询刷新项目状态 | 队列运行时状态会变化 |

### 交互模型

```
选中项目 → Queue 面板切换到该项目队列
         → Timeline 加载该项目历史
         → 所有操作路由到 /api/projects/* 端点
         → 状态栏显示 "@ project-name"
```

### 项目卡片布局

```
┌─────────────────────────────┐
│ ● project-name              │
│ C:/Users/.../project-path   │
│ Queue: 3 pending, 1 running │
│ Last: 2h ago ✓              │
│ ████████░░ 80%              │
└─────────────────────────────┘
```

### 实现波次（3 waves，全部在 dashboard.html）

- **Wave 1**: CSS 样式 + HTML 结构 + JS 状态变量
- **Wave 2**: loadProjects() + renderProjectsPage() + selectProject() + 操作函数
- **Wave 3**: Queue/Timeline 路由切换 + 接入刷新周期

### 修改文件

- `public/dashboard.html` — ~450 行新增（200 CSS + 250 JS）

### 设计文档

已存储到 `.planning/memory.json` 的 `design` 键中。