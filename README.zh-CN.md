[English](./README.md) | **中文**

# AWSL Agent Core

Claude Code 多智能体编排引擎。
两种模式，一个目标：**快速交付高质量代码**。

> **[安装教程](./INSTALL.md)** | **[最佳实践](./BEST_PRACTICES.md)**

## 为什么需要 AWSL？

### 问题

当你用 Claude Code 构建项目时，你是在一个对话中工作 — 一个上下文窗口、一个智能体、一次机会。小任务没问题，但项目变大后，问题就来了：

- **上下文窗口耗尽** — 长会话积累噪音。随着对话增长，LLM 的注意力退化，导致遗忘需求、重复犯错、幻觉状态。
- **没有并行能力** — 可以并发的任务被串行执行。10 个任务的项目花 10 倍于单个任务的时间。
- **没有内建质量门禁** — 写代码的智能体同时也是"审查者"。没有对抗性检查，没有独立验证。Bug 漏网是因为写的人就是查的人。
- **崩溃无法恢复** — Claude Code 崩溃后，整个对话上下文丢失。从头开始，重新解释一切。
- **巨型提交** — 整个功能落在一个大提交里。出问题不能 bisect，想部分回滚也不行。

### 构想

AWSL 按照真实工程团队的方式来做软件开发 — **专业分工、并行执行、独立审查、持久状态**。

不再是一个智能体在一个对话里包揽一切，AWSL 将目标分解为 **有向无环图（DAG）** 形式的微任务，分配给专业智能体（编码者、审查者、测试者、架构师），按 **拓扑排序的波次** 执行，独立任务并发运行。

每个智能体都以 **全新的 200K token 上下文** 启动 — 没有累积的噪音，没有退化的注意力。跨任务知识通过文件产物和结构化内存流转，而不是不断膨胀的聊天记录。

### 设计哲学

**Conductor + Guardian：关注点分离**

AWSL 的架构将编排分为两个独立层：

```
  Conductor（宏观）              Guardian（微观）
  ┌──────────────────┐          ┌──────────────────┐
  │ 任务分解          │          │ TDD 执行保障      │
  │ 波次并行          │          │ 系统化调试        │
  │ 全新上下文        │  ─────>  │ 两阶段代码审查    │
  │ 状态持久化        │  <─────  │ 质量门禁          │
  │ 原子提交          │          │ 苏格拉底式设计    │
  │ 动态重规划        │          │ 微任务粒度控制    │
  └──────────────────┘          └──────────────────┘
```

- **Conductor** 负责 **做什么** 和 **何时做** — 分解目标、调度波次、管理依赖、检查点进度、从失败中恢复。
- **Guardian** 负责 **怎么做好** — 为编码者强制 TDD、为审查者运行两阶段审查、为架构师引导苏格拉底式探索。Guardian 技能按角色自动注入。

这种分离意味着编排逻辑和质量保障独立演进。你可以自定义智能体而不触碰调度器，也可以改变执行策略而不影响质量门禁。

**文件即状态：天生抗崩溃**

所有关键状态以纯文件形式存在于 `.planning/` 目录中 — 任务计划、执行进度、完成摘要、验证结果。没有任何重要信息仅存在于内存中。进程死掉后，下次运行读取文件，从断点续跑。不需要回放对话，不需要重新提示。

**零 API 密钥**

两种模式都复用你现有的 Claude Code 订阅。CC 模式使用 Claude Code 内置的 Agent 工具；终端模式启动 `claude -p` 子进程。无需单独的 Anthropic API 密钥，不会有额外的 token 计费。

### 你能获得什么

| 优势 | 实现方式 |
|------|---------|
| **大项目快 4-10 倍** | 波次并行 — 独立任务通过并行智能体并发执行 |
| **更高的代码质量** | 写的人 ≠ 审的人。专职审查者智能体捕获编码者遗漏的规格偏差、安全问题和代码异味 |
| **每任务全新上下文** | 每个智能体获得干净的 200K token 窗口。无上下文腐化，无注意力退化 |
| **崩溃恢复** | `.planning/` 持久化所有状态。进程死掉 → 重启 → 从最后检查点恢复 |
| **可二分查找的 Git 历史** | 每个完成的任务一次原子提交。`git bisect` 可用，部分回滚可用 |
| **自愈能力** | 测试失败 → 自动修复智能体 → 重新验证（最多 3 轮）。任务失败 → 带错误上下文重试（最多 2 次）→ 换方案重规划 |
| **规格合规** | 审查者→修复者循环捕获单次会话遗漏的需求。基准测试显示终端模式产出更符合规格的代码 |
| **无供应商锁定** | 内置引擎支持任意 LLM 提供商（Anthropic、OpenAI 等）。Claude Code 引擎使用你现有的订阅 |
| **可定制团队** | 在 `agents/` 中放一个 markdown 文件即可创建领域专家。前端专家、安全审查者、API 专家 — 你的团队，你做主 |

### 基准测试：单智能体 vs 智能体团队

在相同任务上的真实基准测试 — **用户认证 + TODO REST API**（Express + TypeScript + Zod + JWT + bcrypt + Vitest）：

```
                        单次 CC 会话             AWSL 终端模式
                        ─────────────────       ──────────────────
耗时                    ~6 分钟                  ~23 分钟
测试                    58 个测试                47 个测试
源代码                  526 行（9 个文件）        378 行（10 个文件）
Git 历史                1 次提交                 17 次提交（每任务）
规格合规                部分                     高（审查者循环）
配置管理                JWT 密钥硬编码            提取到 config.ts
Store 效率              线性扫描 O(n)            索引化 Map O(1)
代码重复                5+ 重复模式              极少
自愈                    无                       3 轮自动修复
```

终端模式更慢，但产出 **更精简、更干净、更符合规格的代码** — 这就是审查者→修复者反馈循环的价值。

CC 模式 **快 4 倍**，写更多测试 — 适合有人在场、随时补位的场景。

## 两种模式

AWSL 支持两种运行模式：

| | CC 模式（Claude Code 技能） | 终端模式（Agent Teams） |
|---|---|---|
| **方式** | 在 Claude Code 中使用 `/awsl` | 终端运行 `awsl run --engine claude-code` |
| **API 密钥** | 不需要（CC 订阅即可） | 不需要（使用 `claude -p`） |
| **控制方式** | 技能提示词引导 CC | 代码控制一切 |
| **自主性** | 人在回路中 | 完全自主 |
| **自愈能力** | 手动修复 | 自动修复循环（最多 3 次） |
| **适用场景** | 交互式开发 | 无人值守批量构建 |

## 快速开始

### 模式一：CC 技能（交互式）

```bash
# 从源码克隆编译（尚未发布到 npm）
git clone https://github.com/awsl-project/awsl-agent-teams.git
cd awsl-agent-teams && npm install && npm run build

# 将技能安装到 Claude Code
node dist/cli.js init --global

# 在 Claude Code 中：
/awsl 构建一个带认证和限流的 REST API
```

### 模式二：终端 Agent Teams（自主模式）

```bash
# 无需 API 密钥 — 使用你的 Claude Code 订阅
cd my-project && git init
awsl run "构建带认证的 REST API" --engine claude-code
```

完整流水线自动运行：

```
头脑风暴 → 调研 → 规划 → 执行（波次） → 验证 → 自动修复 → 提交
```

## CC 模式命令

| 命令 | 功能 |
|---------|-------------|
| `/awsl <目标>` | 全流水线 — 头脑风暴、规划、并行执行、验证、提交 |
| `/awsl-quick <目标>` | 快速模式 — 跳过头脑风暴和调研，直接规划和执行 |
| `/awsl-plan <目标>` | 仅规划 — 执行前先审查 |
| `/awsl-go` | 执行 `/awsl-plan` 生成的已审批计划 |
| `/awsl-status` | 查看进度、阻塞项、决策记录 |
| `/awsl-agents` | 列出或创建自定义智能体定义 |

## 终端模式

终端模式是真正的 **Agent Teams** 体验。代码控制整个编排流程 — 启动后无需人工干预。

### 用法

```bash
awsl run "目标" --engine claude-code [选项]
```

### 选项

| 选项 | 默认值 | 说明 |
|--------|---------|-------------|
| `--engine claude-code` | auto | 使用 Claude Code CLI 作为执行引擎 |
| `--quick` | false | 跳过头脑风暴和调研阶段 |
| `--concurrency <n>` | 2 | 每波次最大并行智能体数 |
| `--no-verify` | false | 跳过验证阶段 |
| `--no-commit` | false | 跳过 git 提交 |
| `--plan-only` | false | 仅生成计划，不执行 |
| `--execute-plan` | false | 执行已有的 `.planning/PLAN.md` |
| `--force` | false | 覆盖已有锁 |
| `--cwd <path>` | `.` | 工作目录 |

### 流水线阶段

```
阶段 0a: 头脑风暴    架构师智能体探索需求（苏格拉底方法）
阶段 0b: 调研        并行智能体分析现有代码库
阶段 1:  规划        规划师智能体创建结构化任务 DAG
阶段 2:  执行        编码/测试/审查智能体按拓扑序波次运行
阶段 3:  验证        基于代码的验证（tsc, npm test, eslint）
阶段 3b: 自动修复    验证失败 → 编码修复 → 重新验证（最多 3 轮）
阶段 4:  重规划      任务失败 → 重试 2 次 → 换方案重新规划
```

### 自愈特性

| 特性 | 说明 |
|---------|-------------|
| **自动修复循环** | 验证失败 → 启动编码智能体 → 重新验证 → 最多 3 次 |
| **任务自动重试** | 失败任务携带错误上下文重试 2 次，然后再重规划 |
| **审查硬阻塞** | 严重级别的发现 = 任务失败，必须修复 |
| **文件冲突检测** | 同波次任务共享文件 → 自动分配到不同波次 |
| **Git 检查点** | 每个成功波次后原子提交（可二分查找） |
| **跨波次上下文** | 第 N+1 波次的智能体可看到第 N 波次的实际文件内容 |
| **限额自动恢复** | Token 限额 → 保存检查点 → 指数退避等待（1m→2m→5m→10m→15m）→ 自动重试（最多 20 次） |
| **任务队列（睡前模式）** | 排队多个目标 → `awsl queue start` → 无人值守顺序执行，自带限额恢复 |

### 输出示例

```
━━━ 阶段 2：执行（7 个波次） ━━━

  波次 1/7: coder              ← 项目初始化
  波次 2/7: coder              ← 类型与模式定义
  波次 3/7: coder, coder       ← Store + 中间件（并行！）
  波次 4/7: coder              ← 应用组装
  波次 5/7: coder, coder       ← 认证路由 + TODO 路由（并行！）
  波次 6/7: tester, reviewer   ← 测试 + 审查（并行！）
  波次 7/7: coder              ← 修复审查发现

━━━ 结果 ━━━
  [✓] task_1 (coder): 已验证
  [✓] task_2 (coder): 已验证
  ...
  [✓] task_10 (coder): 已验证
  结果: 成功 — 全部 10 个任务完成。
```

### 辅助命令

```bash
awsl validate          # 验证 .planning/PLAN.md → 计算波次
awsl verify            # 运行测试、lint、类型检查（来自 PLAN.md）
awsl review            # 静态代码审查（无 LLM）— 检测 any、密钥、缺失测试
awsl lock              # 查看当前锁状态
awsl unlock [--force]  # 释放锁
awsl agents            # 列出可用智能体
```

## 任务队列（睡前模式）

排队多个目标，让 AWSL 通宵执行 — 完全无人值守，自带限额自动恢复。

### 用法

```bash
# 添加任务到队列
awsl queue add "构建用户认证模块" --engine claude-code
awsl queue add "添加支付集成" --depends-on q_1
awsl queue add "写端到端测试" --depends-on all  # 等待所有前置任务完成

# 或者：用自然语言一句话描述，自动拆分为多个任务并推断依赖
awsl queue plan "先构建用户认证，然后加支付模块，最后写集成测试" --engine claude-code

# 查看队列
awsl queue list

# 开始执行（前台守护进程）
awsl queue start
```

### 自然语言队列规划

一句话描述多个任务 — AWSL 使用 Claude 自动解析为结构化队列任务，并推断依赖关系。

```bash
awsl queue plan "先构建用户认证，然后加支付模块，最后写集成测试" --engine claude-code
```

输出：
```
Planned 3 task(s):

  ID       Deps       Goal
  ------------------------------------------------------------
  q_1      (none)     构建用户认证模块
  q_2      q_1        添加支付模块
  q_3      all        写集成测试
```

自动检测排序关键词：
- 顺序执行："先...然后...最后"、"first...then...finally"
- 依赖关系："在...基础上"、"based on"、"after"
- 无序任务：没有排序词的任务默认无依赖，可并行

### 队列选项

| 选项 | 说明 |
|--------|-------------|
| `--quick` | 跳过头脑风暴和调研 |
| `--engine <type>` | 执行引擎（claude-code 或 builtin） |
| `--concurrency <n>` | 最大并行智能体数 |
| `--model <model>` | 覆盖默认模型 |
| `--depends-on <ids>` | 逗号分隔的任务 ID，或 `all` |

### 限额自动恢复

执行过程中遇到 token 限额时：

1. **检测** — 模式匹配 stderr/stdout（429、"rate limit"、"overloaded" 等）
2. **检查点** — 保存进度到 `.planning/CHECKPOINT.json`（已完成任务、结果、波次位置）
3. **退避** — 指数延迟等待：1 分钟 → 2 分钟 → 5 分钟 → 10 分钟 → 15 分钟（上限）
4. **重试** — 恢复当前波次，跳过已完成的任务
5. **限制** — 最多 20 次限额重试（可通过 `maxRateLimitRetries` 配置）

检查点是人类可读的 JSON。下次运行时，AWSL 自动检测并从检查点恢复。

## 睡前模式仪表盘

像素风复古仪表盘，可视化你的通宵构建历史。

```bash
awsl dashboard              # 在 http://localhost:3120 打开
awsl dashboard --port 8080  # 自定义端口
```

功能：
- **RPG 风格状态栏** — 完成/失败计数、总耗时、成功率（像素进度条）
- **日历热力图** — GitHub 贡献图风格，展示每日活动（最近 90 天）
- **耗时趋势图** — SVG 折线图，展示最近 30 天的构建耗时变化
- **时间线** — 按日期分组的运行记录，支持按项目筛选
- **项目侧边栏** — 所有项目列表，彩色徽章 + 任务计数
- **队列监控** — 当前队列状态实时刷新（30 秒间隔）
- **队列操作** — 直接在看板上添加、删除、清空队列任务
- **实时日志流** — 基于 SSE 的实时日志面板，展示 agent 的 stdout/stderr
- **浏览器通知** — 任务失败和队列完成时弹出提醒（需授权）
- **像素艺术风格** — Press Start 2P 字体、复古动画

API 端点：
- `GET /api/history` — 执行历史
- `GET /api/stats` — 聚合统计
- `GET /api/queue` — 当前队列状态
- `GET /api/logs` — SSE 实时 agent 日志流
- `POST /api/queue/add` — 添加任务 `{goal, engine?, quick?, dependsOn?}`
- `DELETE /api/queue/remove?id=q_1` — 删除任务
- `POST /api/queue/clear` — 清空所有任务

## 架构

```
awsl run "构建一个 REST API"
 │
 ▼
╔══════════════════════════════════════════════════════════╗
║                   AWSL 编排器                             ║
║                                                          ║
║  ┌─ Conductor ──────────────────────────────────────┐    ║
║  │                                                  │    ║
║  │  头脑风暴 → 调研 → 规划 → 执行 → 验证            │    ║
║  │       │       │      │      │      │              │    ║
║  │       ▼       ▼      ▼      ▼      ▼              │    ║
║  │   architect architect planner coder  reviewer     │    ║
║  │   (claude -p) (claude -p)    (claude -p)          │    ║
║  │                                                   │    ║
║  │  自愈机制:                                        │    ║
║  │    验证失败 → 自动修复 (3x)                       │    ║
║  │    任务失败 → 重试 (2x) → 重规划                  │    ║
║  │    文件冲突 → 自动分波                            │    ║
║  │    严重审查 → 硬阻塞                              │    ║
║  └───────────────────────────────────────────────────┘    ║
║                                                          ║
║  引擎: claude-code (每任务 claude -p)                    ║
║        builtin (pi-agent-core + 任意 LLM 提供商)        ║
╚══════════════════════════════════════════════════════════╝
 │
 ▼
输出: .planning/ 产物 + 代码 + 每任务 git 提交
```

## Conductor

Conductor 是编排引擎，负责 **做什么** 以及 **何时做**。

- **任务分解** — 将目标拆分为微任务（每个 2-5 分钟）
- **波次并行** — 拓扑排序，独立任务并发运行
- **全新上下文** — 每个任务获得全新的 200k token 上下文（无上下文腐化）
- **状态持久化** — `.planning/` 目录跨会话持久保存
- **原子提交** — 每个完成的任务一次 git 提交（可二分查找）
- **动态重规划** — 失败触发不同方案的恢复

## Guardian

Guardian 是质量保障层，负责 **如何做好**。

Guardian 技能根据智能体角色自动激活：

| 智能体角色 | Guardian 技能 |
|------------|----------------|
| `coder` | TDD（红/绿/重构）、系统化调试 |
| `architect` | 苏格拉底式头脑风暴 |
| `planner` | 微任务规划 |
| `reviewer` | 两阶段代码审查、质量门禁 |
| `tester` | 系统化调试 |

**TDD** — 强制执行 红-绿-重构。先写失败测试，最少代码使其通过，然后重构。

**两阶段审查** — 第一阶段：是否符合规格？第二阶段：代码质量是否达标？严重发现会阻塞任务。

**苏格拉底式头脑风暴** — 通过针对性问题探索需求，挑战假设，记录决策。

## 内置智能体

| 名称 | 角色 | 说明 |
|------|------|-------------|
| planner | 规划师 | 将目标分解为结构化微任务 |
| architect | 架构师 | 设计系统架构和接口 |
| coder | 编码者 | 实现代码，强制 TDD |
| reviewer | 审查者 | 两阶段审查 + 质量门禁 |
| tester | 测试者 | 设计和运行测试，调试失败 |

## 自定义智能体

在项目中创建 `agents/<name>.md`：

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

### Frontmatter 字段

| 字段 | 说明 |
|-------|-------------|
| `name` | 智能体标识（必填） |
| `role` | `planner`、`architect`、`coder`、`reviewer`、`tester` 或 `custom` |
| `description` | 该智能体的功能描述 |
| `tools` | 逗号分隔：`read,write,edit,bash` |
| `skills` | 要激活的 Guardian 技能：`tdd,debug,brainstorm,review,planning` |
| `thinking` | LLM 思考级别：`low`、`medium`、`high` |
| `model` | 覆盖模型：`anthropic:claude-sonnet-4-20250514`、`openai:gpt-4o` |

## .planning/ 目录

状态跨会话持久保存：

```
.planning/
├── .lock                 # 并发锁（自动管理）
├── STATE.md              # 进度、决策、阻塞项
├── DESIGN.md             # 头脑风暴输出
├── PLAN.md               # 结构化任务分解
├── WAVES.md              # 计算出的波次调度
├── VERIFICATION.md       # 测试/lint/类型检查结果
├── REVIEW.md             # 静态代码审查结果
├── research/
│   ├── architecture.md   # 代码库分析
│   └── conventions.md    # 代码风格分析
├── CHECKPOINT.json       # 限额恢复检查点（自动管理）
├── QUEUE.json            # 任务队列（自动管理）
├── HISTORY.json          # 睡前模式执行历史（自动管理）
└── task_*-SUMMARY.md     # 每任务结果
```

## 基准测试结果

CC 模式与终端模式在相同复杂任务上的真实基准对比：
**用户认证 + TODO REST API**（Express + TypeScript + Zod + JWT + bcrypt + Vitest）。

### 质量对比

| 指标 | CC 模式 | 终端模式 |
|--------|---------|---------------|
| **结果** | 成功 | 成功 |
| **测试** | 58 个测试，5 个文件 | 47 个测试，4 个文件 |
| **TypeScript** | 0 错误 | 0 错误 |
| **源代码** | 526 行（9 个文件） | 378 行（10 个文件） |
| **测试代码** | 937 行 | 680 行 |
| **Git 历史** | 1 次提交 | 17 次提交（每任务 + 波次检查点） |
| **总耗时** | ~6 分钟 | ~23 分钟 |
| **自愈** | 无 | 3 轮自动修复（6/8 → 7/8 通过） |
| **API 运行** | 所有端点正常 | 所有端点正常 |

### 代码质量

| 维度 | CC 模式 | 终端模式 |
|-----------|---------|---------------|
| **架构** | `routes/`（传统） | `features/`（按功能划分，更可扩展） |
| **规格合规** | Stats 返回 `{total, pending, in_progress, completed}` | Stats 返回 `{total, done, pending}`（完全匹配规格） |
| **注册响应** | 返回 `{user, token}` | 返回 `{id, email}`（匹配规格） |
| **配置管理** | JWT 密钥硬编码 | 提取到 `config.ts`（审查者修复） |
| **Store 效率** | 邮箱查找线性扫描 | 索引化 `usersByEmail` Map（O(1)） |
| **代码重复** | safeParse 模式重复 5+ 次 | 极少重复 |

### 关键发现

1. **终端模式更符合规格** — 审查者→修复者循环能捕获单次 CC 会话遗漏的规格偏差
2. **终端模式产出更干净的代码** — 审查者智能体识别并修复配置问题、索引和重复
3. **CC 模式快 4 倍** — 单一上下文窗口，无子进程开销
4. **CC 模式写更多测试** — 更大的上下文窗口支持更全面的测试规划
5. **终端模式有更好的 Git 历史** — 17 次原子提交 vs 1 次巨型提交；完全可二分查找

### 何时使用哪种模式

| 场景 | 推荐模式 |
|----------|-----------------|
| 快速功能，人在场 | CC 模式（`/awsl`） |
| 大型项目，想先审查计划 | CC 模式（`/awsl-plan` → `/awsl-go`） |
| 通宵构建，无人值守 | 终端模式（`--engine claude-code`） |
| CI/CD 集成 | 终端模式 |
| 最高代码质量 | 终端模式（审查者循环） |
| 最快交付 | CC 模式 |
| Bug 修复 | CC 模式（`/awsl-quick`） |
| 通宵多项目构建 | 任务队列（`awsl queue start`） |

## 库 API

```typescript
import { executeTeam, loadAgents, SkillRegistry } from "awsl-agent-core";

const agents = loadAgents(["./agents"]);
const result = await executeTeam(
  "构建一个 TODO 应用",
  agents,
  ".",                                    // 工作目录
  "anthropic:claude-sonnet-4-20250514",   // 模型
  2,                                      // 并发数
  {
    brainstorm: true,      // 苏格拉底式探索
    research: true,        // 代码库分析
    verify: true,          // 两阶段审查
    autoCommit: true,      // 每任务原子提交
    replan: true,          // 失败恢复
    qualityGate: true,     // 严重发现时阻塞
    engine: "claude-code", // 或 "builtin"
    maxFixAttempts: 3,     // 自动修复重试上限
    maxRetries: 2,         // 任务重试上限
    maxRateLimitRetries: 20, // 限额重试上限
    rateLimitBackoff: [60000, 120000, 300000, 600000, 900000],
    resumeFromCheckpoint: true, // 从检查点恢复
    hooks: [(event) => {
      console.log(event.type, event.task?.id);
    }],
  }
);
```

### 事件类型

```typescript
type TeamEventType =
  | "plan_start" | "plan_done"
  | "wave_start" | "wave_done"
  | "task_start" | "task_done"
  | "verify_start" | "verify_done"
  | "fix_start" | "fix_done"
  | "retry_start" | "checkpoint"
  | "rate_limit";
```

## CLI 参考

```bash
# 安装 Claude Code 技能（从源码）
node dist/cli.js init                    # 项目本地（.claude/skills/）
node dist/cli.js init --global           # 全局（~/.claude/skills/）

# 终端模式（推荐用于自主构建）
awsl run "目标" --engine claude-code
awsl run "目标" --engine claude-code --quick
awsl run "目标" --engine claude-code --concurrency 4

# 仅规划工作流
awsl run --plan-only "目标"
awsl run --execute-plan

# 内置引擎（需要 API 密钥）
awsl run "目标" --engine builtin --model anthropic:claude-sonnet-4-20250514

# 质量工具
awsl validate                # 解析 + 验证 PLAN.md → WAVES.md
awsl verify                  # 运行测试、lint、类型检查
awsl review                  # 静态分析（无 LLM）

# 锁管理
awsl lock                    # 查看锁状态
awsl unlock                  # 释放自己的锁
awsl unlock --force          # 强制释放任何锁

# 智能体
awsl agents                  # 列出所有智能体

# 任务队列（睡前模式）
awsl queue add "构建 REST API" --quick        # 添加任务
awsl queue add "添加认证" --depends-on q_1     # 带依赖的任务
awsl queue add "写测试" --depends-on all       # 等待所有前置任务
awsl queue plan "先认证，然后支付，最后测试"    # 自然语言 → 自动拆分
awsl queue list                                # 查看队列
awsl queue remove q_1                          # 移除任务
awsl queue start --engine claude-code          # 开始执行
awsl queue clear                               # 清空队列
awsl dashboard [--port N]                      # 打开睡前模式像素风仪表盘（默认端口 3120）
```

## 环境变量

| 变量 | 是否必需 | 说明 |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | 仅 `--engine builtin` 需要 | Anthropic API 密钥 |
| `OPENAI_API_KEY` | 仅 OpenAI 模型需要 | OpenAI API 密钥 |
| `DEBUG=1` | 否 | 启用调试日志 |

> **注意：** `--engine claude-code` **不需要** API 密钥。它通过 `claude -p` 使用你的 Claude Code 订阅。

## 静态代码审查

`awsl review` 运行确定性检查，不使用任何 LLM：

| 规则 | 严重级别 | 检测内容 |
|------|----------|-----------------|
| `no-any` | 警告 | 显式使用 `any` 类型 |
| `no-console-log` | 警告 | 生产代码中的 `console.log` |
| `no-empty-catch` | 警告 | 空 catch 块 |
| `todo-comment` | 信息 | TODO/FIXME/HACK 注释 |
| `no-hardcoded-secrets` | 严重 | 硬编码的密码/API 密钥 |
| `file-too-long` | 警告 | 超过 500 行的文件 |
| `no-tests` | 严重 | 项目中无测试文件 |

## 横向对比

| | AWSL 终端 | AWSL CC | 单次 CC 会话 |
|---|---|---|---|
| **规划** | 代码强制 DAG | 技能引导 | 手动 |
| **并行** | 真并行（并发 `claude -p`） | CC Agent 工具 | 无 |
| **自愈** | 自动修复 + 重试 + 重规划 | 手动 | 手动 |
| **代码审查** | 审查者智能体 + 静态 | 审查者智能体 | 无 |
| **Git 历史** | 每任务原子提交 | 单次提交 | 单次提交 |
| **规格合规** | 高（审查者循环） | 中 | 不确定 |
| **速度** | ~20 分钟 | ~6 分钟 | ~5 分钟 |
| **自主性** | 完全 | 部分 | 无 |

## 许可证

MIT
