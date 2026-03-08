[English](./README.md) | **中文**

# AWSL Agent Core

Claude Code 多智能体编排引擎。
两种模式，一个目标：**快速交付高质量代码**。

> **[安装教程](./INSTALL.md)** | **[最佳实践](./BEST_PRACTICES.md)**

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
# 将技能安装到 Claude Code
npx awsl-agent-core init --global

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
  | "retry_start" | "checkpoint";
```

## CLI 参考

```bash
# 安装 Claude Code 技能
awsl init                    # 项目本地（.claude/skills/）
awsl init --global           # 全局（~/.claude/skills/）

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
