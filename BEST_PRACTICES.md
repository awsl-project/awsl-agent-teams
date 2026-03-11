# AWSL Best Practices

## 0. 架构一句话

AWSL 有两种运行模式：

**CC 模式**（在 Claude Code 中交互使用）：
```
/awsl "goal"
  → CC 分析 + 写 PLAN.md        (CC 思考)
  → node cli.js validate        (代码：解析、校验、拓扑排序 → WAVES.md)
  → CC Agent tool 执行每个任务   (CC 全家桶：Read/Write/Edit/Bash)
  → node cli.js verify          (代码：跑测试、lint、类型检查)
  → CC 修复失败项 + git commit
```

**终端模式**（完全无人值守的 Agent Teams）：
```
awsl run "goal" --engine claude-code
  → architect brainstorm        (claude -p: 苏格拉底探索)
  → architect research ×2       (claude -p ×2 并行: 分析代码库)
  → planner plan                (claude -p: 生成结构化任务 DAG)
  → coder/tester/reviewer ×N    (claude -p ×N: 按 wave 并行执行)
  → LLM review → REVIEW.md      (claude -p: 审查者检查规格合规+代码质量)
  → verify → VERIFICATION.md   (代码：tsc + npm test + eslint)
  → auto-fix (最多3轮)          (claude -p: 读取两份报告 → 修复 → 重新验证)
  → git checkpoint per wave     (代码：原子提交)
```

两种模式都不需要额外 API key。

## 1. 选对命令

### CC 模式（在 Claude Code 中）

```
需求不明确，要先想清楚    →  /awsl         (完整流水线，含 brainstorm)
需求明确，直接干          →  /awsl-quick   (跳过 brainstorm，最少步骤)
大项目，想先看计划        →  /awsl-plan    (只出计划) → /awsl-go (确认后执行)
改 bug、小功能           →  /awsl-quick   (最快)
看进度                   →  /awsl-status
管理 agent 团队          →  /awsl-agents
```

### 终端模式（在终端中）

```
完全放权，无人值守构建    →  awsl run "goal" --engine claude-code
快速构建，跳过研究        →  awsl run "goal" --engine claude-code --quick
只生成计划，不执行        →  awsl run "goal" --plan-only
执行已有计划             →  awsl run --execute-plan
检查代码质量             →  awsl review
排队多任务，通宵执行     →  awsl queue add "goal" + awsl queue start
定时调度任务             →  awsl queue add "goal" --at "03:00"
一句话排队（先预览）     →  awsl queue split "先做A，然后B，最后C"
一句话排队（直接添加）   →  awsl queue plan "先做A，然后B，最后C"
一键启动所有服务          →  awsl start
启动并配置远程面板        →  awsl start --server http://server:3120
停止所有服务              →  awsl stop
查看服务状态              →  awsl status
讨论架构/设计问题          →  awsl discuss "question"
定时讨论（带辩论）         →  awsl queue add --discuss "question" --rounds 2
查看睡前模式仪表盘        →  awsl dashboard
后台启动仪表盘            →  awsl dashboard --bg
停止后台仪表盘            →  awsl dashboard stop
查看昨晚工作总结          →  awsl summary
查看指定日期的夜间工作    →  awsl summary --date 2026-03-10
管理多项目                →  awsl projects
自动发现项目              →  awsl projects scan ~/dev
查看提示词模板            →  awsl agents templates
编辑提示词（$EDITOR）     →  awsl agents prompt coder
预览合成提示词            →  awsl agents preview coder
```

### 怎么选模式？

| 场景 | 推荐 |
|------|------|
| 快速功能开发，人在电脑前 | CC 模式 (`/awsl`) — 快，6 分钟出结果 |
| 大项目要审计划 | CC 模式 (`/awsl-plan` → `/awsl-go`) |
| 睡前构建、CI/CD | 终端模式 (`--engine claude-code`) — 全自动，有自愈 |
| 追求最高代码质量 | 终端模式 — reviewer 循环审查 + 自动修复 |
| 通宵多项目构建 | 任务队列 (`awsl queue start`) — 排队 + 限额恢复，真正的睡前模式 |
| 改 bug | CC 模式 (`/awsl-quick`) — 最快 |
| 架构决策、设计权衡 | 讨论模式 (`awsl discuss`) — 多角度分析 |

## 2. 写好 Goal

Goal 是所有 agent 的起点。写得越清楚，结果越好。

**差：**
```
/awsl 做个网站
```

**好：**
```
/awsl 用 Express + TypeScript 构建用户认证 REST API，包含：
- POST /register (邮箱+密码，bcrypt 加密)
- POST /login (返回 JWT)
- GET /me (需要 Bearer token)
- 用 Zod 做入参校验
- 用 Jest 写单元测试
- 错误统一返回 { error: string, code: number }
```

**规则：**
- 写明技术栈（不要让 agent 猜）
- 列出具体端点/功能/文件
- 说明约束（数据库类型、不允许用什么库、性能要求等）
- 写明测试框架（Vitest / Jest / pytest）
- 写明数据格式（例如 `{total, done, pending}` 而不是 "返回统计信息"）

**终端模式 Goal 示例（实测 10/10 tasks 通过）：**
```
awsl run "Build a User Auth + TODO REST API with Express + TypeScript.
User Auth: POST /auth/register (email+password, bcrypt hash, Zod validation),
POST /auth/login (return JWT, 24h expiry), GET /auth/me (Bearer token required).
TODO (auth required): POST /todos (title required, description optional,
status default pending), GET /todos (list user's todos, ?status filter,
?page&limit pagination), GET /todos/:id (404 if not found or not owned),
PUT /todos/:id (partial update, own only), DELETE /todos/:id (own only),
GET /todos/stats ({total,done,pending} for user).
Middleware: auth (verify JWT), error handler (unified {error,code} format),
request logger (method,path,status,duration).
Use Zod for all validation, bcryptjs for passwords, jsonwebtoken for JWT,
Vitest + supertest for tests. Data in memory, no DB." --engine claude-code
```

越具体 → agent 越不需要猜 → 结果越好。

## 3. 先 Plan 再 Go

大项目（>5 个文件）建议分两步：

```
/awsl-plan Design a microservice architecture with user, order, payment services
```

这会：
1. CC 分析代码库 + 头脑风暴
2. CC 写 `.planning/PLAN.md`
3. 代码自动校验 + 计算执行波次 → `.planning/WAVES.md`

检查 PLAN.md：
- 任务拆分是否合理（每个 task 是否只改 2-3 个文件）
- 依赖关系是否正确（能并行的有没有被串行化）
- role 是否合适（写代码的用 coder，不要用 reviewer）
- verify 字段是否有可执行命令（`npm test` 而不是 "检查是否工作"）

满意后：
```
/awsl-go
```

不满意？直接修改 `.planning/PLAN.md`，再 `/awsl-go`。修改后会自动重新 validate。

## 4. 理解执行流程

### PLAN.md 格式

代码支持三种格式，按优先级排序：

**1. JSON（推荐，planner 默认输出）：**

```json
{
  "summary": "计划摘要",
  "tasks": [
    {
      "id": "task_1",
      "name": "创建用户模型",
      "assignee": "coder",
      "dependencies": [],
      "files": ["src/models/user.ts", "src/types.ts"],
      "action": "创建 User 接口和 Prisma schema...",
      "verify": "npx tsc --noEmit",
      "done": "User 模型定义完成，类型检查通过"
    }
  ]
}
```

**2. Markdown 标题格式（手动编辑友好）：**

```markdown
## task-1: 创建用户模型
- **Role:** coder
- **Dependencies:** (none)
- **Files:** src/models/user.ts, src/types.ts
- **Action:** 创建 User 接口和 Prisma schema...
- **Verify:** npx tsc --noEmit
- **Done:** User 模型定义完成，类型检查通过

## task-2: 写用户 API
- **Role:** coder
- **Dependencies:** task-1
- **Files:** src/routes/user.ts
- **Action:** 实现 CRUD 端点...
- **Verify:** npm test -- user.test.ts
- **Done:** 所有用户 API 测试通过
```

**3. XML `<task>` 块：**

```xml
<task>
  <name>创建用户模型</name>
  <assignee>coder</assignee>
  <dependencies></dependencies>
  <files>src/models/user.ts, src/types.ts</files>
  <action>创建 User 接口和 Prisma schema...</action>
  <verify>npx tsc --noEmit</verify>
  <done>User 模型定义完成</done>
</task>
```

> Markdown 标题支持多种格式：`## task-1: 名称`、`## 1. 名称 (coder)`、`### 名称` 都可以。字段标签支持中英文（如 `**角色:**` 和 `**Role:**`）。

### WAVES.md（代码自动生成）

```
Wave 1: task-1          ← 无依赖，先执行
Wave 2: task-2          ← 依赖 task-1，等 Wave 1 完成
```

同一 wave 的任务 CC 会用 **并行 Agent 调用** 同时执行。

### 代码做了什么

`validate` 命令（纯代码逻辑，不调 LLM）：
- 解析 PLAN.md 的 markdown 结构
- 校验 task id 唯一性、role 合法性
- 检测依赖环（A→B→C→A）
- 移除无效依赖（引用不存在的 task）
- 拓扑排序计算波次
- 输出 WAVES.md

`verify` 命令（纯代码逻辑，不调 LLM）：
- 提取 PLAN.md 中每个 task 的 verify 命令并执行
- 自动检测并运行：`tsc --noEmit`、`npm test`、`eslint`
- 输出 `.planning/VERIFICATION.md`（确定性检查结果）

**REVIEW.md vs VERIFICATION.md 分离：**

| 文件 | 写入者 | 内容 |
|------|--------|------|
| `REVIEW.md` | Phase 3 LLM 审查者 | `[CRITICAL]`/`[PASS]`/`[WARN]` 级别的发现（规格合规 + 代码质量） |
| `VERIFICATION.md` | Phase 3b 确定性检查 | tsc、eslint、npm test 的通过/失败结果 |

**为什么分离？** 之前两者都写入 `VERIFICATION.md`，确定性检查会覆盖 LLM 审查者的发现。分离后：
- LLM 审查者的代码质量发现不会丢失
- Auto-fix 读取 **两个** 文件，同时修复代码质量问题和测试/类型错误
- 两种报告独立演进，互不干扰

**验证器超时和缓存：**
- TypeScript 类型检查：120 秒超时
- 测试运行（npm test）：180 秒超时
- ESLint：60 秒超时
- 重复运行 `awsl verify` 时，未变更的检查会使用缓存（5 分钟有效），跳过不必要的重新执行

## 5. 自定义 Agent 团队

在 `agents/` 目录放 markdown 文件，CC 会读取并注入到对应 role 的子 agent prompt。

### 三种管理方式

| 方式 | 适用场景 |
|------|---------|
| **手动创建文件** | 需要 git 追踪、团队协作 |
| **CLI 命令** | 终端快速操作、脚本自动化 |
| **仪表盘 UI** | 可视化编辑、不熟悉文件格式时 |

### 文件格式

Agent 定义文件是 **YAML frontmatter + Markdown body** 格式：

```markdown
---
name: api-expert
role: coder
description: 精通 OpenAPI 的 REST API 专家
tools: read,write,edit,bash
skills: tdd,debug
thinking: high
model: anthropic:claude-sonnet-4-20250514
---

你是一位 REST API 专家。遵循 OpenAPI 3.0 规范。
始终在实现代码的同时生成 OpenAPI 规格文件。
使用正确的 HTTP 状态码和错误格式。
```

- `---` 之间是 YAML frontmatter，定义元数据（name、role、tools 等）
- `---` 之后的 Markdown 正文就是 **系统提示词**（systemPrompt）— 这是用户最需要自定义的部分
- 文件名必须是 `{name}.md`，name 只允许小写字母、数字和连字符（`/^[a-z][a-z0-9-]*$/`，最长 50 字符）

### 用 CLI 管理智能体

**创建新智能体：**
```bash
# 最简方式 — 用内联 prompt
awsl agents create my-expert --role coder --prompt "你是 Rust 专家。只用 safe Rust，不用 unsafe。"

# 从文件读取 prompt（适合长提示词）
awsl agents create my-expert --role coder --prompt-file ./prompts/rust-expert.md

# 用内置模板作为起点
awsl agents create my-devops --role coder --template devops

# 完整参数
awsl agents create api-dev \
  --role coder \
  --description "REST API 开发专家" \
  --prompt "你是 REST API 专家。遵循 RESTful 最佳实践。" \
  --tools read,write,edit,bash \
  --skills tdd,debug \
  --thinking high \
  --model anthropic:claude-sonnet-4-20250514
```

**查看和编辑：**
```bash
# 查看完整详情（含系统提示词）
awsl agents show coder

# 编辑已有智能体（只更新指定字段，其他保留）
awsl agents edit coder --prompt "你是一位资深 Go 开发者。只用标准库。"
awsl agents edit coder --thinking high --tools read,write,bash
```

**提示词专用编辑命令（`agents prompt`）：**
```bash
# 在 $EDITOR 中打开提示词编辑（Windows 默认 notepad，Unix 默认 vi）
awsl agents prompt coder

# 打印当前提示词到 stdout
awsl agents prompt coder --show

# 内联设置提示词
awsl agents prompt coder --set "你是 Go 专家。只用标准库。"

# 从文件设置提示词
awsl agents prompt coder --file ./prompts/go-expert.md
```

**预览合成提示词（`agents preview`）：**
```bash
# 查看 coder 最终接收到的完整提示词（基础 + Guardian 技能 + 团队上下文）
awsl agents preview coder
```

预览会显示各段落的字符数，帮助你了解提示词的组成和长度。

**覆盖内置智能体：**
```bash
# 编辑内置 coder 的提示词 → 创建 agents/coder.md 覆盖文件
awsl agents edit coder --prompt "你是 Python 专家。使用 pytest 而不是 Jest。"

# 不满意？恢复内置默认值（删除覆盖文件）
awsl agents reset coder
```

**删除：**
```bash
# 删除自定义智能体
awsl agents delete my-expert

# 注意：不能删除内置智能体（planner/architect/coder/reviewer/tester），只能 reset
```

### 内置提示词模板

AWSL 提供 7 个内置提示词模板，覆盖常见角色：

| 模板 | 说明 |
|------|------|
| `coder` | 全栈开发者（内置 Agent tool 子 agent 并行） |
| `reviewer` | 安全导向的代码审查者 |
| `architect` | 系统架构设计师 |
| `tester` | 测试设计与执行 |
| `planner` | 任务分解与规划 |
| `devops` | CI/CD、容器化、基础设施 |
| `documenter` | 技术文档撰写 |

```bash
# 列出所有模板及描述
awsl agents templates

# 用模板创建智能体（模板预填充 prompt 和 role）
awsl agents create my-tester --template tester

# 显式 --prompt 覆盖模板内容
awsl agents create my-tester --template tester --prompt "自定义提示词..."
```

**什么时候用模板：**
- 不知道怎么写提示词 → 先用模板，再微调
- 需要快速创建标准角色 → 一行命令搞定
- 仪表盘上也可以通过下拉菜单选择模板应用

### 用仪表盘 UI 管理

打开 `awsl dashboard`，找到 **角色管理** 卡片：

1. **查看** — 所有智能体显示为卡片，含角色徽章和来源标识（`built-in` 灰色 / `custom` 绿色 / `override` 黄色）
2. **创建** — 点击 `[+New]`，填写名称、角色、描述和系统提示词，保存
3. **模板** — 提示词文本框上方有模板下拉菜单，选择后点 "Apply" 一键填充提示词并设置角色/描述
4. **编辑** — 点击卡片打开编辑器，修改后保存。长提示词可点 "Expand" 切换全屏编辑（等宽字体大文本框 + 实时字符计数）
5. **预览** — 编辑模式点击 "Preview" 查看合成后的完整提示词（分页：合成结果 / 基础 / 技能 / 团队上下文）
6. **恢复默认** — 被覆盖的内置智能体显示 `[Reset to Default]` 按钮
7. **删除** — 自定义智能体显示 `[Delete]` 按钮

### 示例：前端项目团队

`agents/react-dev.md`:
```markdown
---
name: react-dev
role: coder
description: React + TypeScript 前端开发
---

你是 React 18 + TypeScript 专家。

规范：
- 函数组件 + hooks，不用 class
- 用 Zustand 管状态，不用 Redux
- CSS 用 Tailwind，不写自定义 CSS
- 组件放 src/components/，hooks 放 src/hooks/
- 每个组件配一个 .test.tsx
```

`agents/ui-reviewer.md`:
```markdown
---
name: ui-reviewer
role: reviewer
description: 前端代码审查 + 无障碍检查
---

你是前端代码审查专家。额外检查：
- 无障碍 (a11y)：aria 标签、键盘导航、颜色对比度
- 性能：不必要的 re-render、大 bundle、图片未优化
- 响应式：移动端适配
```

或者用 CLI 快速创建（等效）：
```bash
awsl agents create react-dev --role coder --description "React + TypeScript 前端开发" \
  --prompt-file ./prompts/react-dev.md
awsl agents create ui-reviewer --role reviewer --description "前端代码审查 + 无障碍检查" \
  --prompt-file ./prompts/ui-reviewer.md
```

### YAML 数组语法

tools 和 skills 支持 YAML 数组格式（推荐）：
```yaml
tools:
  - read
  - write
  - bash
```
传统逗号分隔格式仍然兼容：`tools: read,write,bash`

### Schema 校验

frontmatter 会做 TypeBox schema 校验。无效配置会输出友好错误（含文件名和具体问题），该 agent 被跳过。

### 什么时候自定义 vs 创建新的

| 场景 | 推荐做法 |
|------|---------|
| 希望 coder 用不同的语言/框架 | **覆盖内置** — `awsl agents edit coder --prompt "..."` |
| 需要多个不同专长的 coder | **创建新的** — `awsl agents create rust-dev --role coder ...` |
| 需要更严格的审查标准 | **覆盖内置** — `awsl agents edit reviewer --prompt "..."` |
| 需要领域专家（安全、DBA、前端） | **创建新的** — 给每个领域一个专属 agent |
| 临时调整后想恢复 | **先覆盖，用完 reset** — `awsl agents reset coder` |

### 规则

- role 决定 Guardian 技能注入（`coder` → TDD，`reviewer` → 两阶段审查，`tester` → 系统化调试）
- 自定义 agent 的 system prompt 会附加到 Guardian 技能之后
- 覆盖文件保存在 `agents/` 目录，原始内置定义不会被修改
- 建议把 `agents/` 目录提交到 git — 团队共享自定义智能体配置

## 6. 利用 .planning/ 做持续开发

`.planning/` 是项目记忆，跨 session 持久。

**第一天：**
```
/awsl 构建用户认证模块
```
→ 产出：
- `.planning/PLAN.md` — 任务计划
- `.planning/WAVES.md` — 执行波次
- `.planning/STATE.md` — 进度和决策
- `.planning/REVIEW.md` — LLM 审查者发现（规格合规 + 代码质量）
- `.planning/VERIFICATION.md` — 确定性检查结果（tsc、eslint、测试）

**第二天：**
```
/awsl-status
```
→ 查看昨天的进度和决策

```
/awsl 在昨天的认证模块基础上，添加 OAuth2 (Google + GitHub) 登录
```
→ CC 会读取 `.planning/` 中的已有上下文，不会重复已完成的工作

**规则：**
- 不要删 `.planning/` 目录（除非要从头开始）
- `.planning/STATE.md` 可以手动编辑，加入你的决策
- 提交 `.planning/` 到 git — 它是项目文档的一部分

## 7. 并发锁保护

AWSL 使用文件锁（`.planning/.lock`）防止同一项目同时运行多个 AWSL 会话导致冲突。

**RunContext（推荐）：**
锁管理现在通过 `RunContext` 统一处理：
- `RunContext.acquire(cwd, opts)` — 需要独占访问的命令使用，失败时抛出异常
- `RunContext.tryAcquire(cwd, opts)` — 队列等场景使用，失败返回 `null` 而非抛出
- RunContext 自动注册 SIGINT/SIGTERM 处理器，使用正确的 `cwd`（修复了旧版 `process.cwd()` bug）
- 务必使用 `try/finally` + `ctx.release()` 或 `ctx.run(fn)` 确保清理

**自动行为：**
- `validate` 获取锁 → 成功后保持锁（CC 接着执行）
- `verify` 结束后自动释放锁
- `run` 全程持锁，结束释放
- CC 意外退出 → SIGINT 自动释放锁
- 锁超过 30 分钟 → 自动判定为过期锁，清除
- 锁持有进程已死 → 自动清除

**手动操作：**
```bash
awsl lock                  # 查看锁状态
awsl unlock                # 释放自己的锁
awsl unlock --force        # 强制释放（别人的锁也能解）
awsl validate --force      # 强制覆盖已有锁
```

**多项目同时运行：**
- 不同目录的项目互不影响（锁是每个项目独立的）
- 同一项目不能同时运行多个 AWSL，第二个会被拒绝

**Windows / macOS 兼容：**
- Windows 不支持 SIGTERM 信号，已做平台适配
- PID 存活检测在两个平台都正常工作

## 8. Guardian 技能

Guardian 是质量保证层，按 role 自动注入到每个子 agent：

| Role | 自动注入的 Guardian 技能 |
|------|------------------------|
| coder | TDD (RED-GREEN-REFACTOR) — 先写测试，再写实现 |
| reviewer | 两阶段审查 — 先查 spec 合规，再查代码质量 |
| tester | 系统化调试 — 复现→隔离→根因→修复 |

**TDD 流程（coder 自动执行）：**
1. 写失败测试 → 2. 确认 RED → 3. 写最少代码通过 → 4. 确认 GREEN → 5. 重构

**两阶段审查（reviewer 自动执行）：**
1. Stage 1：spec 合规（是否满足需求）
2. Stage 2：代码质量（安全、性能、可维护性）
3. Critical 发现 → 任务失败，必须修复

## 9. 沙箱配置（内置引擎）

内置引擎（`--engine builtin`）默认对每个智能体启用沙箱，限制写路径和 bash 命令。

### 开关控制

```typescript
await executeTeam(goal, agents, cwd, model, concurrency, {
  sandbox: true,   // 默认：使用角色默认策略
  // sandbox: false,  // 完全禁用沙箱
  // sandbox: { writePaths: [...], bash: { mode: "...", patterns: [...] } },  // 自定义
});
```

### 各角色默认策略

| 角色 | 写路径 | Bash 模式 | 说明 |
|------|--------|-----------|------|
| `coder` | `[cwd]` | 黑名单（denylist） | 禁止 `rm -rf /`、`sudo`、`mkfs` 等危险命令，其他放行 |
| `tester` | `[cwd]` | 白名单（allowlist） | 只允许 `npm test`、`npx tsc`、`npx vitest`、`node`、`cat`、`ls` 等 |
| `reviewer` | `[cwd]` | 白名单（allowlist） | 只允许 `cat`、`ls`、`grep`、`git log`、`git diff`、`git show` |
| `architect` | `[cwd]` | 白名单（allowlist） | 只允许 `cat`、`ls`、`grep`、`find`、`tree` |
| `planner` | `[cwd]` | 白名单（allowlist） | 只允许 `cat`、`ls`、`find`、`wc` |

### 按智能体自定义

在 `TeamAgentDef` 或智能体定义文件中覆盖：

```typescript
// 代码中
const agentDef: TeamAgentDef = {
  name: "my-coder",
  role: "coder",
  sandbox: {
    writePaths: ["/project", "/tmp/build"],
    bash: {
      mode: "allowlist",
      patterns: ["npm ", "node ", "npx ", "git "]
    }
  }
}
```

### 禁用沙箱

```typescript
// 全局禁用
await executeTeam(goal, agents, cwd, model, concurrency, {
  sandbox: false,
});
```

### 工作原理

- **白名单模式**：命令必须以允许列表中的某个前缀开头，否则拒绝
- **黑名单模式**：命令不能包含禁止列表中的任何模式，否则拒绝
- **写路径**：`write`/`edit` 工具写入前检查路径是否在 `writePaths` 内
- **Windows 兼容**：路径比较不区分大小写

### 注意事项

| 项目 | 说明 |
|------|------|
| **仅限 builtin 引擎** | claude-code 引擎由 Claude Code 自身管理权限，不受此沙箱影响 |
| **不是完美隔离** | 没有容器化，聪明的 agent 理论上可绕过 bash 模式匹配 |
| **默认开启** | 不需要额外配置，角色默认策略自动生效 |
| **可扩展** | 未来可添加网络隔离、资源限制等，不影响现有接口 |

## 10. 测试策略

AWSL 在三个环节自动处理测试，大多数情况不需要额外操作。

### 自动覆盖的测试

| 环节 | 谁做 | 做什么 |
|------|------|--------|
| 写代码时 | coder agent (TDD) | 自动先写失败测试 → 再写实现 → 确认通过 |
| verify 阶段 | 代码自动执行 | 跑 PLAN.md 中每个 task 的 verify 命令 + `tsc --noEmit` + `npm test` + `eslint` |
| review 阶段 | reviewer agent | 检查测试覆盖率、边界用例是否遗漏 |

**关键：** coder role 的 agent 会被注入 TDD 技能（RED-GREEN-REFACTOR），你在 goal 里写"实现用户注册 API"，agent **会自动先写测试再写实现**，不需要额外要求。

### 需要你主动处理的测试

| 测试类型 | 怎么做 |
|---------|--------|
| 给已有代码补测试 | 直接用 AWSL，goal 写明补测试 |
| 集成测试 / E2E 测试 | 在 PLAN.md 里加专门的测试 task |
| 特定边界场景测试 | 在 goal 里列出要覆盖的场景 |

### 示例：补测试

```
/awsl-quick 给 src/services/payment.ts 补充单元测试，覆盖：
- 正常支付流程
- 余额不足
- 重复支付幂等性
- 超时重试
用 Vitest，mock 外部 API 调用
```

### 示例：在 PLAN.md 中加集成测试 task

大项目建议在计划中显式包含测试任务，放在最后一个 wave：

```markdown
## task-5: 集成测试
- **Role:** coder
- **Dependencies:** task-1, task-2, task-3, task-4
- **Files:** tests/integration/api.test.ts
- **Action:** 写端到端集成测试，启动真实服务器，测试完整用户注册→登录→获取信息流程
- **Verify:** npm test -- integration
- **Done:** 集成测试全部通过
```

### Verify 字段怎么写

verify 字段决定了 `awsl verify` 能否自动跑测试。**必须是可执行命令，不能是自然语言。**

| 差 | 好 |
|----|-----|
| 检查功能是否正常 | `npm test -- user.test.ts` |
| 确认类型无误 | `npx tsc --noEmit` |
| 看看有没有 lint 问题 | `npx eslint src/routes/user.ts` |
| 手动测试 API | `curl -s http://localhost:3000/health \| node -e "process.exit(JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).status==='ok'?0:1)"` |

### 测试框架建议

在 goal 里**写明测试框架**，避免 agent 猜错：

```
/awsl 用 Express 构建 REST API，用 Vitest 写测试（不要用 Jest）
```

常见搭配：
- Node.js 项目：Vitest / Jest
- React 前端：Vitest + Testing Library
- Python：pytest
- Go：标准 testing 包

## 11. 处理失败

**validate 失败：**
- 通常是 PLAN.md 格式问题
- 看错误信息，修改 PLAN.md，重新 validate
- 常见：依赖环、未知 role、重复 task id

**planner 输出解析失败（"No parseable tasks"）：**
- 解析器支持三种格式：JSON（优先）、XML `<task>` 块、Markdown 标题格式
- 大多数情况下 planner 会输出 JSON，但某些模型可能输出纯 markdown
- Markdown 格式要求：`## task-1: 名称` 标题 + `- **Role:** coder` 等字段
- 排查：查看 `.planning/` 目录下是否有 PLAN.md，手动确认格式是否正确

**verify 失败（测试/lint/类型检查不过）或 review 发现 critical 问题：**
- **终端模式：** 代码自动启动修复 agent（读取 REVIEW.md + VERIFICATION.md）→ 重新 verify → 最多 3 轮，全自动
- **CC 模式：** CC 读取 REVIEW.md + VERIFICATION.md → Agent 修复 → 重新 verify

**单个 task Agent 失败：**
- **终端模式：** 自动重试 2 次，用不同 prompt（包含上次错误信息）→ 再失败才 replan
- **CC 模式：** 修改 PLAN.md 中该 task 的 Action 字段 → `/awsl-go`

**reviewer 发现 critical 问题：**
- **终端模式：** 代码自动阻断该 task，标记 failed，触发重试/replan
- **CC 模式：** 依赖 CC 遵守 SKILL.md 指令

**全部失败：**
- Goal 写得太模糊 → 重写，更具体
- `/awsl-status` 或 `.planning/STATE.md` 查看详情

## 12. 典型工作流

### 新项目从零开始

```bash
mkdir my-app && cd my-app
git init
# 安装 AWSL skills（只需一次）
cd /path/to/awsl-agent-teams && node dist/cli.js init --global

# 在 Claude Code 中：
/awsl 用 Express + TypeScript + Prisma + PostgreSQL 构建 TODO 应用，包含 CRUD API、用户认证、单元测试
```

### 给已有项目加功能

```
# 在 Claude Code 中，cd 到项目目录：
/awsl 在现有项目基础上添加 WebSocket 实时通知功能，当 TODO 状态变化时推送给所有连接的客户端
```

### 重构

```
/awsl-plan 将 src/api/ 下的所有路由从 Express 迁移到 Hono，保持所有现有测试通过
# 审查计划...
/awsl-go
```

### Debug

```
/awsl-quick 修复 src/auth/login.ts 中登录后 JWT 过期时间不正确的问题，token 应该 24 小时过期但实际 1 小时就过期了
```

### 终端全自动模式（推荐：真正放权的 Agent Teams）

```bash
# 在终端跑，不需要 API key，用 CC 订阅认证
cd my-project
git init && git commit --allow-empty -m "init"   # 需要 git repo
awsl run "Build a REST API with auth" --engine claude-code
```

代码完全控制流程：
- 自动规划 → 校验 → 按 wave 并行执行 → 测试 → 修复 → 重试
- 失败自动重试 2 次，再失败 replan
- 每个 wave 成功后 git checkpoint
- verify 失败自动修复（最多 3 轮）
- reviewer critical 发现直接阻断
- 文件冲突自动检测，冲突 task 串行化

**实测数据（User Auth + TODO API 复杂项目）：**
```
Phase 0a Brainstorm:   ~2.5 min (1 architect agent)
Phase 0  Research:     ~2.3 min (2 architect agents 并行)
Phase 1  Planning:     ~2.3 min (1 planner agent)
Phase 2  Execution:    ~8 min   (7 waves, 10 tasks, 并行度 2)
Phase 3  Review+Verify:~1.5 min (LLM reviewer → REVIEW.md; tsc + npm test → VERIFICATION.md)
Phase 3b Auto-Fix:     ~6 min   (reads both files; 3 rounds: 6/8 → 6/8 → 7/8 passed)
Total:                 ~23 min
Result:                SUCCESS (10/10 tasks verified)
Git:                   17 commits (per-task + wave checkpoints)
```

**对比 CC 模式同一项目：**
```
CC 模式:  ~6 min, 58 tests, 1 commit, 526 行源码
终端模式: ~23 min, 47 tests, 17 commits, 378 行源码
```

终端模式更慢但代码更精简、更 spec-compliant — reviewer→fixer 循环的价值。

### 终端模式选项

```bash
# 跳过 brainstorm 和 research，直接规划执行（省 5 分钟）
awsl run "goal" --engine claude-code --quick

# 4 路并行（默认 2）
awsl run "goal" --engine claude-code --concurrency 4

# 只生成计划，人工审核后再执行
awsl run "goal" --engine claude-code --plan-only
# 审核 .planning/PLAN.md 后：
awsl run --execute-plan --engine claude-code

# 指定工作目录
awsl run "goal" --engine claude-code --cwd /path/to/project

# 跳过所有验证（快速迭代/外部 CI 时使用）
awsl run "goal" --engine claude-code --no-verify
```

### `--no-verify` 验证总开关

`--no-verify` 是验证的总开关（master switch），禁用后会跳过 **所有** 验证相关步骤：

| 跳过的阶段 | 说明 |
|-----------|------|
| Phase 3: Reviewer agent | 不启动 LLM 审查者（不生成 REVIEW.md） |
| Phase 3: Provider verify | 不执行 tsc、npm test、eslint（不生成 VERIFICATION.md） |
| Phase 3b: Auto-fix loop | 不进入自动修复循环 |

**不受影响的阶段：**
- Phase 4: Task auto-retry（任务自动重试）— 仍然运行，因为它处理的是 **执行失败**（agent 崩溃、超时等），不是验证失败

**何时使用 `--no-verify`：**
- 快速迭代原型，不需要质量门禁
- 外部 CI/CD 已有完整的测试和 lint 流程
- 信任代码质量，只需要 agent 写代码
- 调试 AWSL 本身，排除验证阶段的干扰

**何时不要用：**
- 通宵无人值守构建（验证是质量保障的核心）
- 多模块大项目（需要 reviewer 捕获跨模块问题）
- 任何需要高代码质量的场景

### 终端使用 builtin 引擎（需要 ANTHROPIC_API_KEY）

```bash
# 用其他 LLM provider
export ANTHROPIC_API_KEY=sk-...
cd my-project
awsl run "Build a REST API with auth" --engine builtin
```

## 13. 静态代码审查

`awsl review` 是无需 LLM 的确定性代码扫描，可以独立使用：

```bash
awsl review                    # 扫描当前目录
awsl review --cwd /path/to    # 扫描指定目录
```

扫描规则：

| 规则 | 严重度 | 检测内容 |
|------|--------|---------|
| `no-any` | warning | 显式 `any` 类型 |
| `no-console-log` | warning | 生产代码中的 `console.log`（排除测试文件） |
| `no-empty-catch` | warning | 空的 catch 块（吞掉错误） |
| `todo-comment` | info | TODO/FIXME/HACK 注释 |
| `no-hardcoded-secrets` | critical | 硬编码的密码/API key/token |
| `file-too-long` | warning | 超过 500 行的文件 |
| `no-tests` | critical | 项目没有任何测试文件 |

输出格式：
```
Review: 0 critical, 3 warnings, 1 info across 14 files.
```

- **critical = 不通过**：必须修复
- **warning = 建议**：改了更好
- **info = 信息**：留意即可

报告自动保存到 `.planning/REVIEW.md`。

> **注意区分：** `awsl review`（CLI 静态扫描）和 Phase 3 LLM 审查者都写入 `REVIEW.md`，但终端模式流水线中是 LLM 审查者写入。确定性检查（tsc、eslint、测试）的结果写入 `VERIFICATION.md`。Auto-fix 读取两个文件。

## 14. 断点续跑（崩溃恢复）

CC 意外退出（断网、关机、kill -9）后，AWSL 可以从断点恢复继续执行。

### 恢复机制原理

AWSL 采用 **文件即状态** 的设计，所有关键信息持久化到 `.planning/` 目录：

```
.planning/
├── .lock                 ← 锁文件（记录 PID、启动时间）
├── STATE.md              ← 进度、决策、阻塞项
├── PLAN.md               ← 任务 DAG（不会丢）
├── WAVES.md              ← 波次调度（不会丢）
├── task_*-SUMMARY.md     ← 已完成任务的结果（不会丢）
├── CHECKPOINT.json       ← 限额恢复检查点（自动管理）
├── QUEUE.json            ← 任务队列（自动管理）
├── HISTORY.json          ← 睡前模式执行历史（自动管理）
└── .fix-attempts         ← 自动修复计数器
```

崩溃后这些文件全部保留，下次启动时系统自动识别并恢复。

### 锁的自动清除

CC 崩溃后锁不会永远卡住，系统有三重保障：

| 检测方式 | 说明 |
|---------|------|
| **进程存活检查** | 用 `kill(pid, 0)` 探测锁持有进程是否还活着，已死则自动清除（最主要的防护） |
| **3 小时超时** | 锁持有超过 3 小时自动判定过期，清除（长任务安全） |
| **手动强制释放** | `awsl unlock --force` 立即清除 |
| **信号处理** | SIGINT/SIGTERM 时自动释放锁 + 重置 running 任务为 pending |
| **异常捕获** | uncaughtException/unhandledRejection 时自动释放锁 |
| **awsl stop** | 停止所有服务时自动释放锁 + 重置队列状态 |

### 恢复操作步骤

**CC 模式（在 Claude Code 中）：**

```
# 1. 查看上次执行状态
/awsl-status

# 2. 如果锁还在，先释放
awsl unlock --force        # 在终端执行

# 3. 继续执行已有计划（不会重新规划，直接跑未完成的任务）
/awsl-go
```

**终端模式：**

```bash
# 1. 检查锁状态
awsl lock

# 2. 锁还在就释放（通常系统会自动清除）
awsl unlock --force

# 3. 继续执行已有计划
awsl run --execute-plan --engine claude-code
```

### 恢复时发生了什么

```
重新启动
  │
  ├─ 检测 .planning/.lock
  │   ├─ PID 已死 → 自动清除锁 ✓
  │   ├─ 超过 3 小时 → 自动清除锁 ✓
  │   └─ 仍在运行 → 拒绝启动（防冲突）
  │
  ├─ 读取 STATE.md → 知道上次做到哪了
  │
  ├─ 扫描 task_*-SUMMARY.md → 识别已完成的任务
  │
  ├─ Planner 基于已有状态重新规划
  │   └─ 跳过已完成的任务，只执行剩余任务
  │
  ├─ 失败任务 → 重试最多 2 次（携带上次错误信息）
  │   └─ 重试仍失败 → 换方案重规划（replan）
  │
  └─ 验证失败 → 自动修复循环（最多 3 轮）
```

### 注意事项

| 项目 | 说明 |
|------|------|
| **内存状态会丢失** | `SharedMemory` 是进程内存态，崩溃后丢失。但关键数据已写入 `.planning/` 文件，不影响恢复 |
| **半完成的代码** | 正在执行中的任务可能产生不完整的代码变更，planner 重启后能看到文件实际状态并据此调整 |
| **Git 检查点** | 每个 wave 成功后有原子提交，崩溃最多丢失当前 wave 的进度，已完成 wave 的代码安全 |
| **信号处理** | `Ctrl+C` (SIGINT) 和 `SIGTERM` 有优雅退出逻辑会释放锁；`kill -9` 或断电只能靠下次启动时的 stale 检测 |
| **Windows 注意** | Windows 不支持 SIGTERM，但 PID 存活检测和超时机制正常工作 |

### 最佳实践

- **不要删 `.planning/` 目录** — 它是恢复的基础
- **提交 `.planning/` 到 git** — 即使机器换了也能恢复
- **大项目优先用 `--plan-only` → `--execute-plan`** — 计划和执行分离，崩溃后只需重新执行
- **检查 git log** — wave checkpoint 提交记录清晰标记了哪些任务已完成
- **崩溃后先 `/awsl-status`** — 了解当前状态再决定下一步

## 15. 在其他项目中启用 AWSL

AWSL 不只能在 awsl-agent-teams 仓库里用。任何项目都可以两步启用。

### 第一步：全局安装技能（只需一次）

```bash
cd /path/to/awsl-agent-teams
npm run build
node dist/cli.js init --global
```

之后在 Claude Code 中的任何项目都能用 `/awsl`、`/awsl-plan`、`/awsl-go` 等命令。

### 第二步：在项目中放 CLAUDE.md

在你的项目根目录创建 `CLAUDE.md`，加入自动队列规则：

```markdown
# CLAUDE.md

## AWSL 自动队列

当用户的消息包含多条可执行需求（编号列表、分点、或明显独立的任务）时：

第一步 — 分析并提取每条需求，展示给用户确认：
  检测到 N 条需求：
  1. <需求摘要>
  2. <需求摘要>
  要使用 /awsl-plan 生成执行计划吗？

第二步 — 用户确认后，使用 /awsl-plan 将所有需求作为目标生成计划。
第三步 — 展示计划摘要，询问："要立刻开始执行吗？"
第四步 — 用户确认后，使用 /awsl-go 执行。

不触发的情况：追问、讨论、单个需求的子项。
```

### 效果

在 Claude Code 中直接分点甩需求：

```
1. 添加 JWT 用户认证
2. 构建 Stripe 支付模块
3. 写集成测试
```

Claude Code 会自动：
- 识别这是批量需求（≥2 条）
- 调用 `/awsl-plan` 生成计划
- 展示计划摘要
- 问你"要立刻开始执行吗？"
- 确认后自动执行

### 进阶：项目专属 CLAUDE.md

除了自动队列规则，还可以在 CLAUDE.md 中加入项目特定的指令：

```markdown
# CLAUDE.md

## 项目信息
- 技术栈：React 18 + TypeScript + Zustand + Tailwind
- 测试框架：Vitest + Testing Library
- 构建工具：Vite

## AWSL 自动队列
（同上）

## 代码规范
- 函数组件 + hooks，不用 class 组件
- 状态管理只用 Zustand，不用 Redux
- CSS 只用 Tailwind utility classes
```

这些信息会被 Claude Code 和 AWSL 智能体读取，产出更贴合项目的代码。

### 可选：自定义智能体

在项目根目录创建 `agents/` 目录，放入领域专家的 `.md` 文件：

```
my-project/
├── CLAUDE.md              ← 项目指令 + 自动队列规则
├── agents/
│   ├── react-dev.md       ← React 前端专家
│   └── ui-reviewer.md     ← UI 审查专家
├── src/
└── ...
```

详见 [自定义 Agent 团队](#5-自定义-agent-团队)。

### 总结

| 步骤 | 操作 | 频率 |
|------|------|------|
| 全局安装技能 | `node dist/cli.js init --global` | 一次 |
| 项目放 CLAUDE.md | 加自动队列规则 | 每个项目一次 |
| 放 agents/*.md | 领域专家定义 | 可选 |
| 分点甩需求 | 直接列出，自动走队列 | 每次使用 |

## 16. 夜间工作总结（`awsl summary`）

通宵构建后，用 `awsl summary` 快速回顾昨晚做了什么。

### 基本用法

```bash
# 早上醒来第一件事 — 查看昨晚的成果
awsl summary

# 查看前天晚上的工作
awsl summary --date 2026-03-09

# 多项目概览（汇总所有注册项目的数据）
awsl summary --all-projects

# 自定义时间范围（比如通宵到早上 8 点）
awsl summary --from 20:00 --to 08:00
```

### 数据来源

| 数据 | 来源 |
|------|------|
| 任务完成/失败数 | `.planning/HISTORY.json`（队列执行历史） |
| Git 提交记录 | `git log`（指定时间范围内的提交） |
| 耗时、token 消耗 | HISTORY.json 中的任务统计 |
| 智能体分布 | HISTORY.json 中的 wave 信息 |

### 时间范围自动检测

不指定 `--date` 时，AWSL 自动判断：

| 当前时间 | 行为 |
|---------|------|
| 凌晨（< 06:00） | 总结"昨晚"：昨天 22:00 → 今天 06:00 |
| 夜间（>= 22:00） | 总结"今晚"：今天 22:00 → 明天 06:00 |
| 白天（06:00-22:00） | 总结"昨晚"：昨天 22:00 → 今天 06:00 |

### 推荐工作流

**睡前：**
```bash
awsl queue start              # 启动队列，去睡觉
```

**早上：**
```bash
awsl summary                  # 一眼看昨晚成果
awsl queue list               # 查看还有没有任务在跑
git log --oneline -20         # 看详细提交
awsl dashboard                # 打开仪表盘看更多细节
```

**复盘过去几天：**
```bash
awsl summary --date 2026-03-08
awsl summary --date 2026-03-09
awsl summary --date 2026-03-10
```

### 提示

- `--all-projects` 适合管理多个项目的开发者，一条命令看所有项目的夜间进度
- 如果 HISTORY.json 为空但有 git 提交，summary 仍然能统计 git 活动
- summary 输出的格式适合复制到 Slack/日报中作为工作汇报

## 17. 讨论模式 vs 构建模式

AWSL 不只能写代码，还能让多个智能体协作讨论。关键是选对模式。

### 什么时候用讨论模式

| 场景 | 推荐 |
|------|------|
| 架构决策："微服务还是单体？" | 讨论模式 |
| 设计权衡："SQL vs NoSQL 对我们的场景哪个合适？" | 讨论模式 |
| 算法选择："用什么搜索策略？" | 讨论模式 |
| 技术评估："React vs Vue vs Svelte 怎么选？" | 讨论模式 |
| 代码审查策略："如何组织测试结构？" | 讨论模式 |
| 直接写代码："构建 REST API" | 构建模式（`/awsl`） |
| 修 bug："修复登录 500 错误" | 构建模式（`/awsl-quick`） |
| 添加功能："加个支付模块" | 构建模式 |

**规则：** 需要 **思考和决策** 的问题用讨论模式，需要 **写代码** 的任务用构建模式。

### 用法

```bash
# 直接讨论
awsl discuss "How should we design the authentication system?"

# 通过队列（适合排队多个讨论 + 构建任务）
awsl queue add --discuss "What database schema fits our use case?" --rounds 2

# 通宵讨论（适合复杂问题，让 agent 慢慢想）
awsl queue add --discuss --at 03:00 "Analyze microservices vs monolith trade-offs"
```

### 讨论轮次（`--rounds`）

| 轮次 | 效果 | 适用场景 |
|------|------|---------|
| 1（默认） | 每个 agent 独立给出观点，直接综合 | 简单问题、信息收集 |
| 2 | agent 互相回应，有一轮辩论 | 大多数架构/设计问题 |
| 3 | 两轮辩论，观点充分碰撞 | 复杂权衡、有争议的决策 |

**提示：** 复杂问题建议用 `--rounds 2` 或 `--rounds 3`，让 agent 有机会互相挑战和补充。

### 查看结果

讨论结果保存在 `.planning/DISCUSSION-{timestamp}.md`，包含：
- 每个 agent 的独立观点
- 辩论轮次中的互相回应
- 最终综合答案（共识、分歧、建议、待解决问题）

```bash
# 查看最近的讨论记录
ls .planning/DISCUSSION-*.md

# 讨论也会出现在夜间总结中
awsl summary
```

### 提示

- **定时讨论** — 复杂问题用 `--at` 安排在夜间，不占用白天的使用额度
- **讨论 + 构建** — 先用讨论模式做决策，再用构建模式实现：
  ```bash
  awsl queue add --discuss "设计数据库 schema" --rounds 2
  awsl queue add "按照讨论结果实现数据库模块" --depends-on q_1
  ```
- **多问题排队** — 可以排队多个讨论，通宵一起处理
- **仪表盘查看** — `GET /api/discussions` 端点可以在仪表盘上查看讨论历史

## 18. 双层并行架构

AWSL 在两个层级同时实现并行开发：

### 第一层：AWSL 编排并行（planner 控制）

planner 将目标拆成多个独立任务，按波次（wave）并行执行。每个任务是一个独立的 `claude -p` 进程。

```
Wave 1: [architect]         ← 先做设计
Wave 2: [coder, coder]     ← 功能 A + 功能 B 同时跑
Wave 3: [tester, reviewer] ← 测试 + 审查同时跑
```

**关键规则：** 同一 wave 内的任务**文件不能重叠**。planner 会按功能模块拆分（不是按前后端），确保每个 coder 独占自己的文件。

### 第二层：CC Agent Tool 并行（coder 内部控制）

coder 默认启用了 Claude Code 的 Agent tool，可以在任务内部再开子 agent 并行工作：

```
coder 接到任务："实现用户设置页面"
  ├─ 子 agent 1 → 后端 API (src/settings.ts)
  └─ 子 agent 2 → 前端界面 (public/settings.html)
```

coder 自己决定什么时候用子 agent，不需要你干预。

### 两层叠加效果

```
AWSL 启动 3 个 coder 并行（第一层）
  coder-1（认证模块）内部开 2 个子 agent（第二层）
  coder-2（支付模块）内部开 2 个子 agent（第二层）
  coder-3（通知模块）内部开 1 个子 agent（第二层）
= 实际同时工作的 agent 可达 3 + 5 = 8 个
```

### 怎么确认 CC 有并行

1. coder 的 `tools` 包含 `Agent`（内置默认开启）
2. 自定义 agent 想启用：`tools: read,write,edit,bash,grep,glob,agent`
3. coder 提示词里已有并行指引，CC 会在有多个独立文件变更时主动开子 agent

### 什么时候不要并行

| 场景 | 原因 |
|------|------|
| 修改同一个文件的不同部分 | 子 agent 可能产生冲突 |
| 后一步依赖前一步的输出 | 必须串行 |
| 简单的单文件修改 | 开子 agent 反而更慢（有启动开销） |

## 19. 不要做的事

| 不要 | 为什么 | 应该 |
|------|--------|------|
| 一句话 goal | Agent 会瞎猜技术栈 | 写明技术栈和具体要求 |
| 删 .planning/ | 丢失项目记忆 | 保留或提交到 git |
| 一个 task 改 5+ 文件 | 范围太大容易出错 | 拆成多个小 task |
| 超大 goal 不分阶段 | CC 会生成过多 task，质量下降 | 拆成多个 /awsl 调用 |
| 所有 task 串行依赖 | 浪费并行能力 | 尽量减少依赖，让同 wave 任务多 |
| role 乱标 | Guardian 技能不会正确注入 | coder 写代码，reviewer 审查，tester 测试 |
| verify 字段写自然语言 | 代码无法自动执行 | 写可执行命令：`npm test`、`tsc --noEmit` |
| 不写测试框架 | Agent 可能选错框架 | 在 goal 里明确：用 Vitest / Jest / pytest |
| 大项目不加集成测试 task | 单元测试通过不代表整体工作 | PLAN.md 最后加一个集成测试 task |
| 用构建模式做决策 | 写出来的代码可能方向错 | 先用讨论模式确定方案，再构建 |

## 19. 限额自动恢复

AWSL 自动检测 token 限额错误并等待恢复，不需要手动干预。

### 工作原理

```
执行中
  │
  ├─ claude -p 返回限额错误（429、rate limit、overloaded...）
  │
  ├─ 标记任务为 rate_limited（不是 failed）
  │
  ├─ 保存检查点 → .planning/CHECKPOINT.json
  │   ├─ 当前波次编号
  │   ├─ 已完成任务列表 + 结果
  │   ├─ 失败任务列表
  │   └─ 限额重试计数
  │
  ├─ 指数退避等待
  │   1min → 2min → 5min → 10min → 15min（上限）
  │
  ├─ 恢复执行
  │   ├─ 跳过已完成的任务
  │   └─ 只重试被限额中断的任务
  │
  └─ 最多重试 20 次（可配置 maxRateLimitRetries）
```

### CHECKPOINT.json 格式

```json
{
  "wave": 2,
  "completedTasks": ["task_1", "task_2", "task_3"],
  "taskResults": {
    "task_1": "实现了用户模型...",
    "task_2": "完成了认证路由...",
    "task_3": "完成了中间件..."
  },
  "failedTasks": [],
  "rateLimitRetries": 3,
  "savedAt": "2024-01-15T22:30:00.000Z"
}
```

### 配置选项

```typescript
await executeTeam(goal, agents, cwd, model, concurrency, {
  maxRateLimitRetries: 20,        // 限额重试上限（默认 20）
  rateLimitBackoff: [60000, 120000, 300000, 600000, 900000],  // 退避时间表（毫秒）
  resumeFromCheckpoint: true,     // 从检查点恢复（默认 true）
});
```

### 检测的错误模式

以下模式会被识别为限额错误（不区分大小写）：
- `rate limit` / `rate_limit`
- `too many requests`
- `quota exceeded`
- `overloaded`
- `token limit`
- `429`
- `capacity`
- `throttl`

### 注意事项

- 限额重试 **不消耗** 普通任务重试次数（maxRetries）
- 检查点在任务全部完成后自动清除
- 崩溃后重启，检查点仍然有效 — 自动恢复
- 退避等待期间进程保持前台运行（不要关终端！）

### 数据完整性与实时同步

- **原子文件写入** — QUEUE.json、CHECKPOINT.json、HISTORY.json、VERIFICATION.md 等状态文件通过「写临时文件 → rename」模式落盘，即使进程崩溃也不会产生半写文件
- **队列文件锁** — 面板 API 和队列执行器通过文件互斥锁协调读写，避免并发冲突导致数据丢失
- **实时推送 + 增量同步** — 任务完成后立即通过 WebSocket 推送状态变更（不等 30 秒轮询）；初次连接全量同步后，后续只传输 diff，降低带宽消耗
- **重连快照** — WebSocket 断线重连后自动推送完整状态快照，确保面板数据一致

## 20. 任务队列（睡前模式）

排队多个目标，一键启动，通宵执行。每个任务自带限额恢复能力。

### 基本用法

```bash
# 添加任务
awsl queue add "构建用户认证 REST API，Express + TypeScript + JWT" --engine claude-code
awsl queue add "在认证模块基础上添加 RBAC 权限系统" --depends-on q_1
awsl queue add "给所有模块写集成测试" --depends-on all

# 查看队列
awsl queue list

# 查看单个任务详情（goal、状态、依赖、时间戳、耗时、结果摘要、错误信息）
awsl queue show q_1

# 开始执行（前台守护进程，睡前运行）
awsl queue start
```

### 自然语言排队

不想一条条 `queue add`？一句话搞定。有三种方式添加任务，适用不同场景：

| 命令 | 说明 | 适用场景 |
|------|------|---------|
| `queue split` | **推荐。** 先预览再确认，不满意可以取消 | 日常使用，想确认拆分结果再添加 |
| `queue plan` | 直接添加，无预览（向后兼容） | 脚本自动化、确定不需要预览 |
| `queue add` | 手动添加单个任务 | 精确控制每个任务的 goal 和依赖 |

**`queue split`（推荐）：**

```bash
awsl queue split "先构建用户认证 REST API（Express + JWT），然后在认证基础上加 RBAC 权限，最后写集成测试" --engine claude-code
```

输出预览表格，等待确认：
```
Planned tasks:

  #   Deps       Goal
  ─────────────────────────────────────────────────
  1   (none)     构建用户认证 REST API（Express + JWT）
  2   1          在认证基础上添加 RBAC 权限系统
  3   all        写集成测试

确认添加 3 个任务到队列？(y/N)
```

输入 `y` 后才添加到队列。使用 `--yes` 跳过确认（适合脚本）：
```bash
awsl queue split "..." --yes
```

**`queue plan`（无预览，向后兼容）：**

```bash
awsl queue plan "先构建用户认证，然后加支付，最后测试" --engine claude-code
```

直接添加到队列，不显示预览，不要求确认。

**关键词推断规则：**
- "先...然后...最后" → 顺序依赖链
- "在...基础上" → 依赖前一个任务
- 并列无序的任务 → 无依赖，可以并行
- "所有完成后" / "最后" → `depends-on all`

**选项继承：** `--engine`、`--quick`、`--concurrency` 会应用到所有解析出的任务。

**提示：** `queue split` 自带预览，不满意直接输入 `n` 取消。`queue plan` 添加后可用 `awsl queue list` 确认，不满意用 `awsl queue clear` 重来。

### 依赖管理

```bash
# 无依赖 — 排到就执行
awsl queue add "独立任务"

# 指定依赖 — 等 q_1 完成后执行
awsl queue add "依赖任务" --depends-on q_1

# 多依赖 — 等 q_1 和 q_2 都完成后执行
awsl queue add "多依赖任务" --depends-on q_1,q_2

# 全部依赖 — 等前面所有任务完成后执行
awsl queue add "最后执行" --depends-on all
```

### 定时调度（`--at`）

用 `--at` 参数可以让任务在指定时间才开始执行，而不是排到就立刻跑。

```bash
# 时间格式
awsl queue add "goal" --at "03:00"              # 今天凌晨 3 点（已过则明天）
awsl queue add "goal" --at "2026-03-10 03:00"   # 指定日期时间
awsl queue add "goal" --at "+30m"               # 30 分钟后
awsl queue add "goal" --at "+2h"                # 2 小时后
```

**工作原理：**
- `--at` 添加任务时，自动注册系统级定时任务（Windows: `schtasks` / Unix: `at`）
- 到达调度时间后，操作系统自动触发 `queue start --once`
- **无需保持 `queue start` 常驻运行** — 操作系统负责定时触发
- `queue list` 和 `queue show` 会显示调度时间
- 可以与 `--depends-on` 组合使用 — 同时满足依赖完成 + 到达调度时间才会执行
- 删除任务或修改时间会自动清理/更新系统定时任务

**一次性模式 `--once`：**
```bash
awsl queue start --once    # 处理当前可执行的任务后立即退出，不轮询等待
```
系统定时任务触发时自动使用 `--once` 模式。你也可以手动使用它来做一次性处理。

**适用场景：**
- 凌晨 3 点跑大任务（避开白天的 rate limit 高峰）
- 排队多个任务，间隔执行（避免连续触发限额）
- 延后执行不紧急的任务
- 不想占用终端保持 `queue start` 运行

### 队列选项

```bash
awsl queue add "goal" \
  --engine claude-code \     # 执行引擎
  --quick \                  # 跳过 brainstorm/research
  --concurrency 3 \          # 并行度
  --model anthropic:... \    # 模型
  --depends-on q_1,q_2 \     # 依赖
  --at "03:00" \             # 定时调度
  --auto-push                # 完成后自动 git push
```

### QUEUE.json 格式

队列状态自动持久化到 `.planning/QUEUE.json`：

```json
{
  "tasks": [
    {
      "id": "q_1",
      "goal": "构建 REST API",
      "status": "done",
      "options": { "quick": true },
      "scheduledAt": "2024-01-15T22:00:00.000Z",
      "startedAt": "2024-01-15T22:00:01.000Z",
      "completedAt": "2024-01-15T22:25:00.000Z",
      "result": { "success": true, "summary": "10/10 tasks completed" }
    },
    {
      "id": "q_2",
      "goal": "添加认证",
      "status": "running",
      "dependsOn": ["q_1"],
      "runAt": "2024-01-16T03:00:00.000Z",
      "scheduledAt": "2024-01-15T22:00:05.000Z",
      "startedAt": "2024-01-16T03:00:01.000Z"
    }
  ],
  "createdAt": "2024-01-15T22:00:00.000Z",
  "updatedAt": "2024-01-15T22:25:01.000Z"
}
```

### 典型睡前工作流

```bash
# 1. 排好队列（二选一）

# 方式 A：一句话自然语言（推荐用 split，先预览再确认）
awsl queue split "先用 Express+TS 构建电商 API（商品、购物车、订单、支付），然后加用户系统（注册登录个人中心），再加后台管理，最后全面集成测试" --engine claude-code

# 方式 B：逐条添加（精确控制依赖）
awsl queue add "用 Express+TS 构建电商 API：商品、购物车、订单、支付" --engine claude-code
awsl queue add "添加用户系统：注册、登录、个人中心、地址管理" --depends-on q_1
awsl queue add "添加后台管理：商品管理、订单管理、数据看板" --depends-on q_1,q_2
awsl queue add "全面集成测试 + 性能测试" --depends-on all

# 2. 确认队列
awsl queue list

# 3. 开始执行，去睡觉
awsl queue start

# 4. 第二天早上查看结果
awsl queue list
/awsl-status
git log --oneline

# 5. 打开像素风仪表盘查看历史
awsl dashboard
# 浏览器打开 http://localhost:3120
```

### 注意事项

| 项目 | 说明 |
|------|------|
| **定时调度** | `--at` 自动注册系统定时任务，无需保持进程运行。Windows 用任务计划程序，Unix 用 `at` |
| **前台进程** | 不使用 `--at` 时，`queue start` 在前台运行，关终端会停止执行。用 `tmux` 或 `screen` 保持会话 |
| **限额恢复** | 每个任务自动带限额恢复（指数退避 + 检查点） |
| **锁管理** | 任务间自动交接锁，无需手动管理 |
| **自动提交** | 每个任务完成后（成功或失败），自动 commit QUEUE.json + HISTORY.json，可通过 `git log` 追踪进度 |
| **自动推送** | 加 `--auto-push` 可在每次 commit 后自动 `git push`。支持 per-task（`queue add --auto-push`）或全局（`queue start --auto-push`）。push 失败不阻塞后续任务 |
| **中断恢复** | Ctrl+C 中断后，已完成任务状态保留。重新 `queue start` 会跳过已完成的任务 |
| **失败处理** | 单个任务失败不影响后续无依赖任务的执行 |
| **日志** | 所有日志输出到 stderr，可重定向：`awsl queue start 2>queue.log` |

### 仪表盘进阶功能

`awsl dashboard` 不只是看历史，还能实时监控和操作队列。

**实时日志流：**
- 点击底部 "LIVE LOG" 栏展开日志面板
- 通过 SSE (Server-Sent Events) 实时显示 agent 的 stdout/stderr
- 按任务 ID 和 agent 名称着色，自动滚动
- 适合远程监控：浏览器打开 `http://<IP>:3120` 即可

**浏览器通知：**
- 页面首次打开时会请求通知权限（点允许）
- 任务失败时弹出 "Task q_N failed: ..."
- 队列全部完成时弹出 "Queue complete: X done, Y failed"
- **注意：** 需要浏览器标签页保持打开状态；HTTPS 或 localhost 下才有效

**耗时趋势图：**
- 在热力图下方，展示最近 30 天的每日构建总耗时
- 纯 SVG 折线图，hover 可看具体数值
- 帮助发现构建越来越慢、rate limit 越来越频繁等趋势

**队列操作面板：**
- 直接在看板输入框添加任务，不用切终端
- 添加任务表单支持日期时间选择器，可设置 `runAt` 定时调度
- 每个 pending 任务旁有删除按钮 (×)
- 底部有"CLEAR ALL"清空按钮
- Timeline 标题栏有"Clear History"按钮，可一键清除所有执行历史（带确认对话框，操作不可逆）
- 操作通过 REST API 完成，实时刷新显示

**队列定时调度 UI：**
- 队列表格新增 "Run At" 列，显示每个任务的生效执行时间
- 任务自身设置的 `runAt` 直接显示时间
- 从依赖链继承的时间（父依赖的 `runAt` 优先级更高）带箭头 (↑) 标识
- 优先级逻辑：父依赖的 `runAt` 优先；无父时间时使用子任务自身的时间
- 点击 pending 任务的时间单元格，弹出编辑对话框，可设置/修改/清除调度时间
- 后端接口：`POST /api/queue/set-time`，body 为 `{ id, runAt }`（`runAt` 为 null 时清除）
- 底层调用 `queue.ts` 的 `setRunAt(id, runAt)` 方法

**日期筛选器：**
- 使用日期筛选器分析生产力趋势：按天查看每日完成量，按月对比不同月份的效率，自定义范围聚焦特定项目周期
- 快捷按钮：今日、本周、本月、全部 — 一键切换常用时间范围
- 月份选择器和自定义起止日期支持更精确的筛选
- 所有面板组件（统计卡片、热力图、耗时趋势、时间线）都会根据筛选条件实时更新

**多机聚合性能优化：**
- 聚合阶段使用原地 `push` 代替重复 `concat`，减少内存分配
- 队列依赖查找通过 ID→task 映射表 + 缓存，从 O(Q²) 降到 O(Q)
- Timeline 渲染复用 `stats()` 预计算的按日分组数据，无 filter 时跳过二次分组
- 脏检查机制：数据未变时跳过全量重渲染（30s 轮询周期内常见）

**Agent 分析面板：**
- 统计汇总：使用的 agent 角色数、平均并行度、峰值并行度、总波次数
- 角色卡片：每个 agent 角色（coder/reviewer/tester 等）的参与次数
- 运行详情：Timeline 中展开每条记录可看到：
  - 参与的 agent 角色（彩色徽章）
  - 波次分解（每波并行了哪些角色、几个 agent 同时跑）
- 数据来源：orchestrator 执行时收集 wave 和 agent 信息，写入 HISTORY.json
- 远程客户端的数据同样参与聚合统计

**项目管理面板：**

管理多个 AWSL 项目的统一入口。所有项目注册到 `~/.awsl/projects.json`，面板实时展示每个项目的状态。

- **项目卡片** — 每个已注册项目显示为一张卡片，包含：
  - 状态指示灯（idle/active/running/locked/missing）
  - 队列进度条（pending/done/failed 比例）
  - 上次运行信息（时间、状态、耗时）
- **选中项目** — 点击项目卡片后：
  - 显示操作按钮（查看队列、添加任务、启动执行）
  - 可直接在面板上操作该项目的任务队列
- **注册项目** — 三种方式：
  - CLI：`awsl projects add /path/to/project --name my-app`
  - API：`POST /api/projects/add {path, name?, tags?}`
  - 自动注册：运行 `awsl run` 或 `awsl queue start` 时自动注册当前目录
- **自动发现** — `awsl projects scan ~/dev` 递归扫描目录，自动注册含 `.planning/` 或 `.git` 的项目
- **跨项目队列操作** — 通过面板 API 向任意已注册项目添加任务、启动执行，无需切换目录

CLI 命令：
```bash
awsl projects                            # 列出所有项目及状态
awsl projects add [path] [--name N]      # 注册项目
awsl projects remove <path|name>         # 取消注册
awsl projects scan [dir]                 # 自动发现
```

**后台启动仪表盘：**
```bash
# 后台模式 — 启动后立即返回终端，PID 保存到 .planning/.dashboard.pid
awsl dashboard --bg
# 输出：Dashboard running at http://localhost:3120 (PID 12345)
#       Stop with: awsl dashboard stop

# 停止后台仪表盘
awsl dashboard stop
# 输出：Dashboard stopped (PID 12345)
```

适用场景：
- 不想占用一个终端窗口来跑仪表盘
- 搭配 `awsl queue start` 使用，先启动仪表盘再启动队列
- 远程服务器上长期运行仪表盘

**典型工作流 — 一键启动：**
```bash
# 进入项目目录，一条命令启动所有服务
cd /your/project
awsl start --server http://server-ip:3120 --id my-laptop

# 输出：
#   Dashboard: started (pid 12345) → http://localhost:3120
#   Remote:    connected to http://server-ip:3120 (pid 12346)

# 查看状态
awsl status

# 全部停止（释放锁 + 重置 running 任务为 pending）
awsl stop
```

首次 `awsl start --server <url>` 会保存远程配置到 `.planning/remote.json`，之后直接 `awsl start` 就行。

### 远程控制

将面板部署到服务器上，通过 WebSocket 中继远程控制本地开发机。

**架构：**
- **面板（服务器）** — Docker 部署 `docker compose up -d`，提供 Web UI + WebSocket 中继
- **本地机器** — `awsl start` 启动仪表盘 + 远程连接
- **浏览器/手机** — 打开面板 URL，通过 REST API 向本地机器发送命令

**连接本地机器：**
```bash
# 最简方式：一条命令搞定
awsl start --server http://server:3120

# 带自定义 ID
awsl start --server http://server:3120 --id my-laptop

# 也可以分步操作
awsl remote init http://server:3120 --id my-laptop  # 保存配置 + 连接

# 支持自动重连（断线后指数退避重试：5s→10s→20s→30s 上限）
```

**通过 API 远程控制：**
```bash
# 查看已连接客户端
curl http://server:3120/api/clients
# 返回: [{"id":"my-laptop","hostname":"...","cwd":"...","status":{...}}]

# 向远程机器添加队列任务
curl -X POST http://server:3120/api/clients/command \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-laptop","action":"queue:add","payload":{"goal":"构建 REST API","engine":"claude-code"}}'

# 在远程机器上启动队列
curl -X POST http://server:3120/api/clients/command \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-laptop","action":"queue:start"}'

# 查看远程机器系统信息
curl -X POST http://server:3120/api/clients/command \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-laptop","action":"system:info"}'
```

**支持的远程命令：**

| 命令 | 说明 |
|------|------|
| `queue:add` | 添加任务 `{goal, engine?, quick?, dependsOn?, runAt?}` |
| `queue:remove` | 删除任务 `{id}` |
| `queue:clear` | 清空队列 |
| `queue:list` | 列出队列任务 |
| `queue:get` | 查看单个任务 `{id}` |
| `queue:set-time` | 设置调度时间 `{id, runAt}` |
| `queue:start` | 启动队列执行 `{engine?, once?}` |
| `system:info` | 获取系统信息（CPU、内存、Node 版本等） |

**注意事项：**
- 面板绑定 `0.0.0.0`（所有网卡），确保防火墙允许端口访问
- 当前版本没有认证机制，建议在内网或 VPN 环境使用
- 客户端每 30 秒推送一次状态更新，服务端每 30 秒心跳检测
- 90 秒无响应的客户端会被自动断开

> 完整部署指南（systemd、PM2、Docker、Nginx 反向代理、内网穿透等）见 [DEPLOY.md](DEPLOY.md)。
