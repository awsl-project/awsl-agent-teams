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
  → verify                      (代码：tsc + npm test + eslint)
  → auto-fix (最多3轮)          (claude -p: 修复 → 重新验证)
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
```

### 怎么选模式？

| 场景 | 推荐 |
|------|------|
| 快速功能开发，人在电脑前 | CC 模式 (`/awsl`) — 快，6 分钟出结果 |
| 大项目要审计划 | CC 模式 (`/awsl-plan` → `/awsl-go`) |
| 睡前构建、CI/CD | 终端模式 (`--engine claude-code`) — 全自动，有自愈 |
| 追求最高代码质量 | 终端模式 — reviewer 循环审查 + 自动修复 |
| 改 bug | CC 模式 (`/awsl-quick`) — 最快 |

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

CC 会按这个格式写计划，你也可以手动编辑：

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
- 输出 `.planning/VERIFICATION.md`

## 5. 自定义 Agent 团队

在 `agents/` 目录放 markdown 文件，CC 会读取并注入到对应 role 的子 agent prompt。

**示例：前端项目团队**

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

**规则：**
- role 决定 Guardian 技能注入（`coder` → TDD，`reviewer` → 两阶段审查，`tester` → 系统化调试）
- 自定义 agent 的 system prompt 会附加到 Guardian 技能之后
- 用 `/awsl-agents create <name>` 快速创建

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
- `.planning/VERIFICATION.md` — 测试结果

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

## 9. 测试策略

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

## 10. 处理失败

**validate 失败：**
- 通常是 PLAN.md 格式问题
- 看错误信息，修改 PLAN.md，重新 validate
- 常见：依赖环、未知 role、重复 task id

**verify 失败（测试/lint/类型检查不过）：**
- **终端模式：** 代码自动启动修复 agent → 重新 verify → 最多 3 轮，全自动
- **CC 模式：** CC 读取 VERIFICATION.md → Agent 修复 → 重新 verify

**单个 task Agent 失败：**
- **终端模式：** 自动重试 2 次，用不同 prompt（包含上次错误信息）→ 再失败才 replan
- **CC 模式：** 修改 PLAN.md 中该 task 的 Action 字段 → `/awsl-go`

**reviewer 发现 critical 问题：**
- **终端模式：** 代码自动阻断该 task，标记 failed，触发重试/replan
- **CC 模式：** 依赖 CC 遵守 SKILL.md 指令

**全部失败：**
- Goal 写得太模糊 → 重写，更具体
- `/awsl-status` 或 `.planning/STATE.md` 查看详情

## 11. 典型工作流

### 新项目从零开始

```bash
mkdir my-app && cd my-app
git init
# 安装 AWSL skills（只需一次）
cd /path/to/pi-agent-teams && node dist/cli.js init --global

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
Phase 3  Verify:       ~1.5 min (reviewer + tsc + npm test)
Phase 3b Auto-Fix:     ~6 min   (3 rounds: 6/8 → 6/8 → 7/8 passed)
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

# 跳过验证（不推荐）
awsl run "goal" --engine claude-code --no-verify
```

### 终端使用 builtin 引擎（需要 ANTHROPIC_API_KEY）

```bash
# 用其他 LLM provider
export ANTHROPIC_API_KEY=sk-...
cd my-project
awsl run "Build a REST API with auth" --engine builtin
```

## 12. 静态代码审查

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

报告自动保存到 `.planning/REVIEW.md`，终端模式的 reviewer agent 会参考此报告。

## 13. 不要做的事

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
