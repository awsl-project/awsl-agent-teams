## AWSL_RESULT

### Design: Collapsible Timeline

**Goal**: 两级折叠 — 整个 Timeline 板块可折叠 + 按天折叠

**Approach**: CSS class toggle（与现有 entry 展开/收起模式一致）

**Key decisions**:

1. **Section-level collapse** — Timeline 标题栏增加 `Collapse/Expand` 按钮，点击后隐藏整个 `#tl` 容器和筛选栏，标题保持可见
2. **Day-level collapse** — 每天的条目用 `<div class="date-group">` 包裹，日期标题增加 `▸` 箭头和条目计数 `(N)`，点击日期标题折叠/展开该天
3. **No persistence** — 折叠状态不持久化，刷新/重渲染时重置（最简方案）
4. **Default: all expanded** — 默认全部展开，不改变现有行为

**Scope**: 仅修改 `public/dashboard.html`（~50 行 CSS + ~30 行 JS）

**Files produced**:
- `.planning/designs/timeline-collapsible.md` — 完整设计文档
- `.planning/MEMORY.json` — 共享内存（供 coder/reviewer/tester 读取）