## Socratic Brainstorming: Clear History 按钮样式修复

### 问题分析

找到了问题所在。在 `public/dashboard.html:949`，Clear History 按钮使用了内联样式：

```html
<button onclick="clearHistory()" style="float:right;font-size:12px;padding:2px 10px;cursor:pointer;background:var(--ink2);color:var(--ink4);border:1px solid var(--ink3);font-family:inherit">Clear History</button>
```

关键问题：
- `background: var(--ink2)` → `#4a4a5e`（深色背景）
- `color: var(--ink4)` → `#b8b8c8`（浅灰文字）

而同一行的其他按钮（Collapse, Collapse Days, Expand Days）使用 `.tl-collapse-btn` 类：
- `background: none`（透明背景）
- `color: var(--ink2)`（深色文字）
- `border: 1px solid var(--border)`（浅色边框）

### 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 复用 `.tl-collapse-btn` | 直接加现有 class | 最简单，风格统一 | 不区分危险操作 |
| B. 新建 danger 样式 | 透明底 + 红色边框/文字 | 暗示破坏性操作 | 过度设计，一个按钮不值得 |
| C. 调整内联样式 | 改为浅色背景 | 快速修复 | 内联样式仍不优雅 |

### 决策

**选择方案 A**：复用 `.tl-collapse-btn` class，保留 `float:right` 定位。

理由：
1. **最简单** — 不新增任何 CSS
2. **视觉统一** — 和同行按钮风格一致
3. **安全性已有保障** — 点击时有 `confirm()` 确认弹窗，无需视觉上额外警告
4. **消除内联样式** — 更易维护

### 具体改动

文件：`public/dashboard.html:949`

将：
```html
<button onclick="clearHistory()" style="float:right;font-size:12px;padding:2px 10px;cursor:pointer;background:var(--ink2);color:var(--ink4);border:1px solid var(--ink3);font-family:inherit">Clear History</button>
```

改为：
```html
<button class="tl-collapse-btn" onclick="clearHistory()" style="float:right">Clear History</button>
```

仅保留 `float:right` 用于右对齐定位，其余样式全部由 `.tl-collapse-btn` 类接管。

## AWSL_RESULT

**设计决策**：Clear History 按钮复用现有 `.tl-collapse-btn` CSS class，移除深色内联样式，仅保留 `float:right` 定位。

**改动范围**：仅 `public/dashboard.html` 一行代码。

**理由**：最简方案，风格统一，`confirm()` 弹窗已足够防误操作。