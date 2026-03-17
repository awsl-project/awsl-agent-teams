# AWSL Agent Teams — AI 多智能体协同开发引擎

> 让 AI 像真正的工程团队一样工作：分工、并行、审查、自愈。

---

## 一句话介绍

AWSL 是一套 **多 AI 智能体协同编排引擎**，将单个 AI 助手升级为一支完整的虚拟开发团队——架构师、程序员、审查者、测试员各司其职，按依赖关系并行执行，独立代码审查，自动修复，通宵无人值守。

---

## 痛点：为什么需要 AWSL？

| 传统 AI 编程的问题 | 实际后果 |
|---|---|
| **单轮对话，上下文耗尽** | 长会话后 AI 开始遗忘需求、重复犯错、输出质量骤降 |
| **自己写、自己审** | 同一个 AI 既写代码又审查，没有对抗性检查，Bug 漏网 |
| **完全串行** | 10 个独立任务花 10 倍时间，无法利用并行能力 |
| **崩溃即归零** | 进程中断后对话上下文全部丢失，从头开始 |
| **巨型提交** | 一个功能一个大 commit，出问题无法 `git bisect`，无法部分回滚 |
| **无法通宵跑** | 遇到限额就停下，需要人工干预和重新启动 |

**AWSL 逐一解决了这些问题。**

---

## 核心架构

```
┌─────────────────────────────────────────────────────┐
│  Conductor（指挥层）—— 做什么、什么时候做              │
│                                                     │
│  头脑风暴 → 调研 → 规划 → 波次执行 → 验证 → 提交     │
│       │       │      │      │       │               │
│       ▼       ▼      ▼      ▼       ▼               │
│    architect  arch  planner coder  reviewer         │
│                             tester                  │
│                                                     │
│  自愈机制:                                           │
│    逐任务审查 (git diff) → 严重问题阻断提交            │
│    验证失败 → 自动修复 (最多 3 轮)                    │
│    任务失败 → 重试 (2 次) → 换方案重规划              │
│    限额触发 → 指数退避 → 自动恢复                     │
├─────────────────────────────────────────────────────┤
│  Guardian（质量层）—— 怎么做得好                      │
│                                                     │
│  ┌── TDD ──┐ ┌── Code Review ──┐ ┌── Debug ──┐     │
│  │先写失败  │ │ 读 git diff     │ │ 隔离复现   │     │
│  │测试 →   │ │ 反模式清单      │ │ 根因分析   │     │
│  │最少代码 │ │ Critical=阻断   │ │ 回归测试   │     │
│  └─────────┘ └────────────────┘ └───────────┘     │
└─────────────────────────────────────────────────────┘
```

**设计理念：** 指挥层管"做什么"，质量层管"做多好"，两层独立演进。

---

## 六大核心能力

### 1. 专业化分工 —— 不是一个 AI 做所有事

| 角色 | 职责 | 技能注入 |
|------|------|---------|
| **Architect** | 需求分析、架构设计 | 苏格拉底式探索 |
| **Planner** | 任务拆解、依赖分析 | 微任务规划 |
| **Coder** | 功能实现 | TDD 红绿重构 |
| **Reviewer** | 代码审查（读真实 git diff） | 反模式清单 |
| **Tester** | 测试设计与执行 | 系统化调试 |
| **自定义** | 安全专家、全栈、DBA... | 用户自定义 |

每个角色拿到 **独立的 200K 上下文窗口**，不存在上下文耗尽问题。

### 2. 波次并行 —— 独立任务同时执行

```
Wave 1:  [task-1: 用户模型]  [task-2: 数据库Schema]    ← 并行
Wave 2:  [task-3: API路由]   [task-4: 中间件]          ← 并行（依赖 wave 1）
Wave 3:  [task-5: 集成测试]                            ← 依赖 wave 2
```

- 自动拓扑排序，无依赖的任务同波次并行
- 可配置并发度（推荐 3-4 个 Agent/波次）
- **大型项目 4-10 倍加速**

### 3. 独立代码审查 —— 写的人不是查的人

每个 Coder 任务完成后：

1. Reviewer 立即读取真实 `git diff`（不是摘要，是逐行代码）
2. 按反模式清单检查：竞态条件、busy-wait、缺失 cleanup、硬编码密钥...
3. **Critical 级别发现 = 任务失败，代码不会被提交**
4. Coder 修复后重新提交，再次审查

> 这不是 AI 的自说自话，而是**两个独立 Agent 之间的对抗性审查**。

### 4. 多语言自动验证 —— 13 种内置检查器

| 语言 | 检查项 | 超时 |
|------|--------|------|
| **TypeScript** | `tsc --noEmit` 类型检查 | 120s |
| **Node.js** | `npm run build` 构建 | 180s |
| **Node.js** | `npm test` 测试 | 180s |
| **Node.js** | `eslint` 代码检查 | 60s |
| **Node.js** | `prettier --check` 格式 | 60s |
| **Node.js** | `npm audit` 安全审计 | 30s |
| **Python** | `pytest` 测试 | 180s |
| **Python** | `mypy` 类型检查 | 120s |
| **Python** | `ruff check` lint | 60s |
| **Go** | `go vet` 静态分析 | 60s |
| **Go** | `go test` 测试 | 180s |
| **Rust** | `cargo clippy` lint | 120s |
| **Rust** | `cargo test` 测试 | 180s |

**全部自动检测，无需配置。** 扔进 Python 项目自动跑 pytest + mypy + ruff，扔进 Go 项目自动跑 go vet + go test。

还支持**自定义验证器**——Playwright E2E、Storybook、集成测试，统统可以加：

```json
// .planning/verify.json
{
  "providers": [
    { "name": "e2e", "command": "npx playwright test", "timeout": 300000 },
    { "name": "api-contract", "command": "npm run test:contract", "timeout": 120000 }
  ]
}
```

### 5. 自愈与断点续跑 —— 通宵无人值守

```
出错？自动处理：
  验证失败  → 读 VERIFICATION.md → 自动修复 → 重新验证（最多 3 轮）
  任务失败  → 带错误上下文重试（2 次）→ 换方案重规划
  限额触发  → 检查点保存 → 指数退避（1m→2m→5m→10m→15m）→ 自动恢复
  进程崩溃  → 重启 → 从检查点续跑（一行命令）
```

所有状态存在 `.planning/` 目录中的纯文本文件里。**没有任何数据只存在内存中。**

### 6. 原子提交 —— 每个任务一个 commit

```
git log --oneline
f78c025  feat: add payment integration       ← task-5
be336ca  feat: add user authentication       ← task-4
a691c46  feat: add database schema           ← task-3
45348be  feat: add user model                ← task-2
05e8860  feat: project setup                 ← task-1
```

- 出问题？`git bisect` 精准定位
- 想回滚？`git revert` 只回滚一个功能
- 代码审查？每个 PR 只看一个任务的变更

---

## 实测数据

> 测试目标：用户认证 + TODO REST API（完整后端应用）

| 指标 | 传统 AI（单 Agent） | AWSL（多 Agent 团队） |
|------|---------------------|----------------------|
| **用时** | ~6 分钟 | ~23 分钟（含全部审查验证） |
| **测试** | 58 个 | 47 个（更精准，少冗余） |
| **源码** | 526 行 / 9 文件 | 378 行 / 10 文件（更精简） |
| **Git 历史** | 1 个提交 | 17 个提交（可回溯） |
| **规格合规** | 部分遗漏 | 高（审查循环兜底） |
| **配置管理** | JWT 硬编码 | 提取到 config.ts |
| **数据结构** | O(n) 线性扫描 | O(1) 索引 Map |
| **代码重复** | 5+ 处重复模式 | 极少 |
| **自动修复** | 无 | 3 轮自动修复 |

**关键洞察：** AWSL 不是最快的，但产出的代码质量显著更高——因为有独立审查和自动修复循环。

---

## 使用场景

### 场景 1：日常开发加速

```bash
/awsl 给用户系统添加 RBAC 权限控制，支持角色继承和资源级别权限
```

AI 团队自动执行：头脑风暴需求 → 调研现有代码 → 拆分任务 → 并行实现 → 审查 → 测试 → 提交。

### 场景 2：通宵无人值守

```bash
awsl queue add "重构支付模块，接入 Stripe SDK" --engine claude-code
awsl queue add "补充支付相关的单元测试和集成测试" --depends-on q_1
awsl queue add "更新 API 文档和 Swagger 定义" --depends-on q_2
awsl queue start
```

下班前排队，第二天早上看结果。限额自动恢复，崩溃自动续跑。

### 场景 3：架构决策

```bash
awsl discuss "微服务 vs 模块化单体，基于我们当前的代码库和团队规模应该选哪个？"
```

多个 Agent 独立分析后辩论，输出有理有据的结论文档。

### 场景 4：多项目管理

通过 Dashboard 面板统一管理所有项目的 AI 构建：

- GitHub 风格热力图看活动频率
- 实时日志流看构建进度
- 浏览器通知看构建结果
- 远程控制多台机器的构建任务

---

## 技术指标

| 指标 | 数值 |
|------|------|
| 每 Agent 上下文窗口 | 200K tokens |
| 默认并发 | 2 Agent/波次 |
| 推荐并发 | 3-4 Agent/波次 |
| 验证器缓存 | 5 分钟 TTL |
| 限额恢复策略 | 指数退避，最多 20 次重试 |
| 自动修复轮数 | 最多 3 轮 |
| 任务重试次数 | 最多 2 次，后触发重规划 |
| 支持语言 | TypeScript, Python, Go, Rust + 任意自定义 |
| 支持引擎 | Claude Code, Codex, 内置引擎（任意 LLM） |
| 状态持久化 | 文件系统（`.planning/`），人类可读 |

---

## 与 Claude 生态多智能体方案对比

Claude 生态中有多种多智能体方案，各有定位。以下是主要竞品的功能对比：

### 竞品概览

| 方案 | 定位 | GitHub |
|------|------|--------|
| **CC Official Swarm** | Claude Code 官方实验性多 Agent 功能（TeammateTool） | [Anthropic 官方](https://code.claude.com/docs/en/agent-teams) |
| **Claude Squad** | tmux 多窗口管理器，一人分饰多 Agent | [smtg-ai/claude-squad](https://github.com/smtg-ai/claude-squad) |
| **Ruflo** | 企业级 Agent 编排平台，60+ Agent + 215 MCP 工具 | [ruvnet/ruflo](https://github.com/ruvnet/ruflo) |
| **Overstory** | Git worktree 隔离 + SQLite 邮件系统 | [jayminwest/overstory](https://github.com/jayminwest/overstory) |
| **AWSL** | Conductor+Guardian 双层架构，面向生产的全流水线 | 本项目 |

### 核心能力对比

| 能力 | CC Official Swarm | Claude Squad | Ruflo | Overstory | **AWSL** |
|------|:-:|:-:|:-:|:-:|:-:|
| **任务自动拆解** | Lead Agent 手动分配 | 手动创建会话 | ADR 驱动 | 手动分配 | **DAG 自动拆解 + 拓扑排序** |
| **并行执行** | Teammate 并行 | tmux 多会话 | Swarm 并行 | Worktree 并行 | **波次级并行（依赖感知）** |
| **独立代码审查** | 无 | 无 | Spec 合规检查 | 无 | **Reviewer 读真实 git diff，Critical 阻断提交** |
| **自动验证** | 无内置 | 无 | 无 | 无 | **13 种内置 + 自定义 Provider** |
| **自动修复** | 无 | 无 | 容错共识 | Watchdog 监控 | **验证失败→修复→重跑（3 轮）** |
| **任务重试+重规划** | 无 | 无 | 有 | 无 | **重试 2 次→换方案重规划** |
| **通宵队列** | 无 | 无 | 有 | 无 | **队列 + 限额指数退避 + 检查点续跑** |
| **限额恢复** | 无 | 无 | 3 层模型路由省 75% 费用 | 无 | **指数退避（1m→15m），最多 20 次** |
| **崩溃恢复** | 丢失上下文 | Git 分支保留代码 | AgentDB 持久化 | SQLite 状态 | **文件级检查点，1 行命令续跑** |
| **原子 Git 提交** | 不管理 | 按分支隔离 | 不管理 | FIFO 合并队列 | **每任务 1 commit，支持 bisect** |
| **可视化面板** | 无 | TUI（终端 UI） | 无 | 无 | **像素风 Web Dashboard + REST API** |
| **远程控制** | 无 | 无 | 无 | 无 | **WebSocket Relay 远程管理** |
| **多语言支持** | N/A | N/A | N/A | 可插拔 Runtime | **TS/Python/Go/Rust 自动检测** |
| **自定义 Agent** | 无 | 支持多种 CLI 工具 | 60+ 内置 Agent | 可插拔 Adapter | **Markdown 定义 + 7 模板** |
| **上下文管理** | 每 Teammate 独立窗口 | 每会话独立 | 分层内存系统 | 每 Worktree 独立 | **每 Agent 独立 200K** |
| **需额外 API Key** | 否（实验功能） | 否 | 是 | 取决于 Runtime | **否（用现有订阅）** |

### 差异化总结

**CC Official Swarm** 是 Anthropic 官方的实验功能，优点是原生集成、无需安装，但缺少质量保障流水线——没有独立审查、没有自动验证、没有崩溃恢复、没有通宵队列。更适合即兴协作，不适合生产级构建。

**Claude Squad** 本质是 tmux 多窗口管理器，解决的是"同时看多个 Agent 工作"的问题。不处理任务拆解、依赖分析、代码审查、验证修复等工程化流程。适合手动管理多个独立任务。

**Ruflo** 走企业级路线，60+ Agent、215 MCP 工具、3 层模型路由，功能最丰富但也最重。适合大型团队和复杂工作流，学习曲线陡峭。需要额外 API Key 和配置。

**Overstory** 用 Git worktree 做代码隔离、SQLite 做通信，架构优雅。但没有质量保障层——没有代码审查、没有自动验证、没有修复循环。更像一个基础设施层。

**AWSL 的独特定位：生产级全流水线。**

1. **唯一做到写-审分离的方案** — Reviewer 读真实 git diff，不是自查自纠
2. **唯一内置多语言验证的方案** — 13 种 Provider 全自动检测，还支持自定义
3. **最完整的自愈体系** — 验证修复（3 轮）+ 任务重试（2 次）+ 动态重规划
4. **最适合通宵构建** — 队列 + 限额恢复 + 检查点续跑 + Dashboard 监控
5. **最轻量的起步成本** — 3 步安装，零额外 API Key，零侵入性

---

## 零成本开始

```bash
# 安装（3 步）
git clone https://github.com/awsl-project/awsl-agent-teams.git
cd awsl-agent-teams && npm install && npm run build

# 在任何项目中使用（CC 模式，无需额外 API Key）
cd your-project
/awsl 你的开发目标

# 或终端模式（通宵任务）
awsl run "你的目标" --engine claude-code
```

**无需额外 API Key** — 使用你现有的 Claude Code 订阅。

**无需额外基础设施** — 本地运行，数据不出本机。

**无需改变工作流** — 在现有项目中直接使用，无侵入性。

---

## 客户价值

### 对开发者

- **4-10 倍开发速度** — 波次并行让独立任务同时执行
- **更高代码质量** — 独立审查 + 13 种自动检查 + 3 轮自动修复
- **零上下文焦虑** — 每个 Agent 独立窗口，不怕丢失上下文
- **通宵生产力** — 下班排队，起床收代码

### 对技术管理者

- **可追溯的 Git 历史** — 每个任务一个原子提交，支持 bisect 和部分回滚
- **确定性质量保障** — 验证结果可复现，不是"AI 觉得没问题"
- **人类可读的审计轨迹** — `.planning/` 目录存储所有决策和验证记录
- **灵活的技术选型** — 支持任意 LLM 提供商，零供应商锁定

### 对企业

- **数据安全** — 本地运行，代码不上传第三方
- **合规友好** — 完整的决策记录和变更审计
- **可扩展** — 自定义 Agent 角色、验证器、质量规则
- **渐进式采用** — 可从单个项目开始试用，无需全面迁移

---

## 快速体验

```bash
# 1. 安装
git clone https://github.com/awsl-project/awsl-agent-teams.git
cd awsl-agent-teams && npm install && npm run build

# 2. 在你的项目中试用
cd /path/to/your-project
/awsl 添加一个用户注册登录功能，使用 JWT 认证

# 3. 看着 AI 团队工作
#    → 自动拆分任务
#    → 并行编码
#    → 独立审查
#    → 自动测试
#    → 逐任务提交

# 4. 打开面板看全局
awsl dashboard
# → http://localhost:3120
```

---

<p align="center">
<strong>AWSL Agent Teams</strong><br>
不是更快的 AI 编程工具，而是一支 AI 工程团队。
</p>
