[English](./README.md) | **中文**

# AWSL Agent Core

Claude Code 多智能体编排引擎。
两种模式，一个目标：**快速交付高质量代码**。

> **[安装教程](./INSTALL.md)** — 安装、`npm link`、常见问题
>
> **[最佳实践](./BEST_PRACTICES.md)** — 并发调优、Goal 写法、引擎选择、队列用法、故障排查

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
  │ 全新上下文        │  ─────>  │ 逐任务代码审查    │
  │ 状态持久化        │  <─────  │ 质量门禁          │
  │ 原子提交          │          │ 苏格拉底式设计    │
  │ 动态重规划        │          │ 微任务粒度控制    │
  └──────────────────┘          └──────────────────┘
```

- **Conductor** 负责 **做什么** 和 **何时做** — 分解目标、调度波次、管理依赖、检查点进度、从失败中恢复。
- **Guardian** 负责 **怎么做好** — 为编码者强制 TDD、为审查者运行逐任务代码审查（基于真实 git diff）、为架构师引导苏格拉底式探索。Guardian 技能按角色自动注入。

这种分离意味着编排逻辑和质量保障独立演进。你可以自定义智能体而不触碰调度器，也可以改变执行策略而不影响质量门禁。

**文件即状态：天生抗崩溃**

所有关键状态以纯文件形式存在于 `.planning/` 目录中 — 任务计划、执行进度、完成摘要、验证结果。没有任何重要信息仅存在于内存中。进程死掉后，下次运行读取文件，从断点续跑。不需要回放对话，不需要重新提示。

**零 API 密钥**

两种模式都可以复用本地 CLI 会话。CC 模式使用 Claude Code 内置的 Agent 工具；终端模式可启动 `claude -p` 或 `codex exec` 子进程。使用这些 CLI 引擎时，无需单独配置提供商 API 密钥。

### 你能获得什么

| 优势 | 实现方式 |
|------|---------|
| **大项目快 4-10 倍** | 波次并行 — 独立任务通过并行智能体并发执行 |
| **更高的代码质量** | 写的人 ≠ 审的人。每个编码任务完成后，审查者立即读取真实 `git diff`，逐行检查反模式清单（busy-wait、竞态条件、缺失 cleanup 等），严重问题直接阻断提交 |
| **每任务全新上下文** | 每个智能体获得干净的 200K token 窗口。无上下文腐化，无注意力退化 |
| **崩溃恢复** | `.planning/` 持久化所有状态。进程死掉 → 重启 → 从最后检查点恢复 |
| **可二分查找的 Git 历史** | 每个完成的任务一次原子提交。`git bisect` 可用，部分回滚可用 |
| **自愈能力** | 多语言验证（TypeScript、Python、Rust、Go）+ 自定义 provider。测试失败 → 自动修复智能体 → 重新验证（最多 3 轮）。任务失败 → 带错误上下文重试（最多 2 次）→ 换方案重规划 |
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
| **方式** | 在 Claude Code 中使用 `/awsl` | 终端运行 `awsl run --engine claude-code` 或 `--engine codex` |
| **API 密钥** | 不需要（CC 订阅即可） | 不需要（使用 `claude -p` 或 `codex exec`） |
| **控制方式** | 技能提示词引导 CC | 代码控制一切 |
| **自主性** | 人在回路中 | 完全自主 |
| **自愈能力** | 手动修复 | 自动修复循环（最多 3 次） |
| **适用场景** | 交互式开发 | 无人值守批量构建 |

## 快速开始

> **一键安装：** 克隆本仓库后，让 Claude Code 或 Codex 读取安装指南自动完成安装：
>
> ```
> 读取 INSTALL.md 并按照步骤安装 AWSL
> ```
>
> 或按以下手动步骤操作。

### 模式一：CC 技能（交互式）

```bash
# 从源码克隆编译（尚未发布到 npm）
git clone https://github.com/awsl-project/awsl-agent-teams.git
cd awsl-agent-teams && npm install && npm run build

# （可选）启用全局 awsl 命令
npm link

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
# 或
awsl run "构建带认证的 REST API" --engine codex
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
awsl run "目标" --engine <claude-code|codex|builtin> [选项]
```

### 选项

| 选项 | 默认值 | 说明 |
|--------|---------|-------------|
| `--engine <type>` | auto | 执行引擎：`claude-code`、`codex` 或 `builtin`（自动检测优先级：claude-code → codex → builtin） |
| `--quick` | false | 跳过头脑风暴和调研阶段 |
| `--concurrency <n>` | 2 | 每波次最大并行智能体数（推荐中大型项目用 3-4；详见 BEST_PRACTICES.md 并发调优章节） |
| `--no-verify` | false | 跳过所有验证步骤：逐任务代码审查、代码验证 (tsc、npm test、eslint) 和自动修复循环。任务自动重试仍然运行（处理执行失败而非验证） |
| `--no-commit` | false | 跳过 git 提交 |
| `--plan-only` | false | 仅生成计划，不执行 |
| `--execute-plan` | false | 执行已有的 `.planning/PLAN.md` |
| `--force` | false | 覆盖已有锁 |
| `--cwd <path>` | `.` | 工作目录 |

### Codex 引擎特性

使用 `--engine codex`（或安装了 Codex CLI 时自动检测到）时：

| 特性 | 说明 |
|------|------|
| **自动检测** | `detectEngine()` 自动检查 `codex --version`（优先级：claude-code → codex → builtin） |
| **独立 API Key** | 在 agent frontmatter 中设置 `apiKey: env:CODEX_API_KEY` 实现按 agent 路由 |
| **自定义端点** | 设置 `baseUrl: https://your-api.com/v1` 指向 OpenAI 兼容的 API |
| **动态沙箱** | 按角色自动选择沙箱模式：reviewer/tester → `read-only`，coder/architect → `workspace-write` |
| **会话恢复** | 失败任务可通过 Codex session ID（存储在共享内存中）恢复，无需重新开始 |
| **结构化结果** | Agent 输出 `## AWSL_RESULT` section，AWSL 自动提取为干净的任务结果 |
| **细粒度进度** | JSONL 事件（文件编辑、命令执行、助手消息）实时推送到 Dashboard |
| **独立引擎** | 在 agent frontmatter 设置 `engine: codex`，同一次运行中不同 agent 可使用不同引擎 |

```yaml
# 示例：coder 用 Codex，reviewer 用 Claude Code (agents/my-coder.md)
---
name: my-coder
role: coder
engine: codex
apiKey: env:CODEX_API_KEY
baseUrl: https://api.openai.com/v1
model: o3
tools: read,write,edit,bash
---
```

```yaml
# agents/my-reviewer.md — 用 Claude 做代码审查
---
name: my-reviewer
role: reviewer
engine: claude-code
tools: read,grep,glob,bash
---
```

### 流水线阶段

```
阶段 0a: 头脑风暴    架构师智能体探索需求（苏格拉底方法）
阶段 0b: 调研        并行智能体分析现有代码库
阶段 1:  规划        规划师智能体创建结构化任务 DAG
阶段 2:  执行        编码/测试智能体按拓扑序波次运行
  └─ 逐任务审查      每个编码任务完成后，审查者读取真实 git diff → 严重问题阻断提交
阶段 3:  验证        多语言 provider（tsc/test/eslint/build/prettier/audit/pytest/mypy/ruff/go vet/go test/cargo clippy/cargo test/自定义）→ VERIFICATION.md  [--no-verify 时跳过]
阶段 3b: 自动修复    失败 → 编码者读取 VERIFICATION.md → 修复 → 重新验证（最多 3 轮）  [--no-verify 时跳过]
阶段 4:  重规划      任务失败 → 重试 2 次 → 换方案重新规划
```

### 自愈特性

| 特性 | 说明 |
|---------|-------------|
| **逐任务代码审查** | 每个编码任务完成后，审查者立即读取真实 `git diff`，逐行检查反模式清单（设计缺陷、竞态条件、busy-wait、缺失 cleanup、delta/merge 混淆等）。严重问题阻断提交 — 任务在提交前就被标记失败 |
| **自动修复循环** | 验证失败 → 编码者读取 VERIFICATION.md → 修复 → 重新验证 → 最多 3 次 |
| **任务自动重试** | 失败任务携带错误上下文重试 2 次，然后再重规划 |
| **审查硬阻塞** | 严重级别的发现 = 任务失败，必须修复 |
| **文件冲突检测** | 同波次任务共享文件 → 自动分配到不同波次 |
| **Git 检查点** | 每个成功波次后原子提交（可二分查找） |
| **跨波次上下文** | 第 N+1 波次的智能体可看到第 N 波次的实际文件内容 |
| **限额自动恢复** | Token 限额 → 保存检查点 → 指数退避等待（1m→2m→5m→10m→15m）→ 自动重试（最多 20 次） |
| **任务队列（睡前模式）** | 排队多个目标 → `awsl queue start` → 无人值守顺序执行，自带限额恢复 |
| **灵活计划解析** | 规划师输出支持 JSON、XML、Markdown 三种格式 — 不同模型的格式差异也能正确解析 |
| **验证器 provider** | 并行执行，每个 provider 独立超时，5 分钟结果缓存。内置 provider：tsc（120s）、npm test（180s）、eslint（60s）、build（180s）、prettier（60s）、audit（30s）、pytest（180s）、mypy（120s）、ruff（60s）、go vet（60s）、go test（180s）、cargo clippy（120s）、cargo test（180s）。支持从 `.planning/verify.json` 或 `.awsl.json` 加载自定义 provider |
| **静态审查规则** | `awsl review` 新增规则：未使用的 import 检测、函数过长检测（>50 行）、嵌套过深检测（>4 层）、重复代码块检测（6+ 行相同代码） |
| **验证报告** | 每个检查项带耗时（durationMs）、通过率百分比、总验证耗时、分阶段汇总 |
| **原子文件写入** | 所有状态文件通过临时文件 + 重命名模式写入，防止崩溃时文件损坏 |
| **队列文件锁** | 基于文件的互斥锁，防止面板 API 和队列执行器同时读写冲突 |
| **实时状态推送** | 任务完成后立即通过 WebSocket 推送状态，不再等待 30 秒轮询 |
| **重连状态同步** | WebSocket 重连后立即推送完整状态快照 |
| **增量状态同步** | 初次全量同步后，仅传输变更的队列数据和新增的历史记录 |

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
awsl verify            # 运行多语言验证 provider（tsc、test、eslint、build、prettier、audit、pytest、mypy、ruff、go vet/test、cargo clippy/test、自定义），带计时报告
awsl review            # 静态代码审查（无 LLM）— 检测 any、密钥、缺失测试、未使用 import、函数过长、嵌套过深、重复代码
awsl lock              # 查看当前锁状态
awsl unlock [--force]  # 释放锁
awsl agents            # 列出可用智能体
awsl agents show <name>           # 查看智能体完整详情
awsl agents create <name> [flags] # 创建自定义智能体
awsl agents edit <name> [flags]   # 编辑已有智能体
awsl agents delete <name>         # 删除自定义智能体
awsl agents reset <name>          # 恢复内置默认值
awsl agents templates             # 列出内置提示词模板
awsl agents prompt <name>         # 编辑提示词（$EDITOR / --show / --set / --file）
awsl agents preview <name>        # 预览合成提示词

# 调用统计
awsl track <type> [goal]          # 记录一次调用（team、plan、go、quick、queue、cli、discuss）
awsl invocations                  # 查看各类型的调用计数

# 夜间工作总结
awsl summary                             # 总结昨晚的工作（22:00→06:00）
awsl summary --date 2026-03-10           # 总结指定日期的夜间工作
awsl summary --from 20:00 --to 08:00     # 自定义时间范围
awsl summary --all-projects              # 汇总所有已注册项目

# 项目管理
awsl projects                            # 列出所有已注册项目及状态
awsl projects add [path] [--name N]      # 注册项目（默认当前目录）
awsl projects remove <path|name>         # 取消注册项目
awsl projects scan [dir]                 # 自动发现目录下的项目
```

## 任务队列（睡前模式）

排队多个目标，让 AWSL 通宵执行 — 完全无人值守，自带限额自动恢复。

### 用法

```bash
# 添加任务到队列
awsl queue add "构建用户认证模块" --engine claude-code
# 或
awsl queue add "构建用户认证模块" --engine codex
awsl queue add "添加支付集成" --depends-on q_1
awsl queue add "写端到端测试" --depends-on all  # 等待所有前置任务完成

# 定时调度任务
awsl queue add "跑完整测试" --at "03:00"              # 今天（如已过则明天）
awsl queue add "部署到测试环境" --at "2026-03-10 03:00" # 指定日期时间
awsl queue add "清理临时文件" --at "+30m"               # 30 分钟后
awsl queue add "大规模重构" --at "+2h"                  # 2 小时后

# 或者：用自然语言描述，先预览再确认添加（推荐）
awsl queue split "先构建认证，然后加支付，最后写集成测试" --engine claude-code

# 或者：自然语言直接添加，无预览（向后兼容）
awsl queue plan "先构建用户认证，然后加支付模块，最后写集成测试" --engine claude-code

# 查看队列
awsl queue list

# 查看单个任务详情
awsl queue show q_1

# 开始执行（前台守护进程）
awsl queue start
```

### 自然语言队列规划

一句话描述多个任务 — AWSL 使用 Claude 自动解析为结构化队列任务，并推断依赖关系。提供两种命令：

**`queue split`（推荐）** — 先预览再确认。展示拆分结果表格，确认后才添加到队列。使用 `--yes` 可跳过确认提示。

```bash
awsl queue split "先构建认证，然后加支付，最后写集成测试" --engine claude-code
```

输出：
```
Planned tasks:

  #   Deps       Goal
  ─────────────────────────────────────────────────
  1   (none)     构建认证模块
  2   1          添加支付集成
  3   all        写集成测试

确认添加 3 个任务到队列？(y/N) y

Added 3 task(s):

  ID       Deps       Goal
  ------------------------------------------------------------
  q_1      (none)     构建认证模块
  q_2      q_1        添加支付集成
  q_3      all        写集成测试
```

**`queue plan`** — 直接添加，无预览（向后兼容）。

```bash
awsl queue plan "先构建用户认证，然后加支付模块，最后写集成测试" --engine codex
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
| `--engine <type>` | 执行引擎（`claude-code`、`codex` 或 `builtin`） |
| `--concurrency <n>` | 最大并行智能体数 |
| `--model <model>` | 覆盖默认模型 |
| `--depends-on <ids>` | 逗号分隔的任务 ID，或 `all` |
| `--at <time>` | 定时调度：`"03:00"`、`"2026-03-10 03:00"`、`"+30m"`、`"+2h"` |

### 定时执行

使用 `--at` 添加任务时，AWSL 会自动注册一个**系统级定时任务**（Windows 任务计划程序 / Unix `at` 命令），到时间自动触发 `queue start --once`。**无需保持 `queue start` 常驻运行**——操作系统负责定时触发。

```bash
awsl queue add "通宵构建" --at "03:00"   # → 自动创建系统定时任务，凌晨 3 点触发
awsl queue start --once                  # 一次性模式：处理当前可执行任务后退出
```

如果你偏好手动守护模式，不带 `--once` 的 `queue start` 仍会每 30 秒轮询一次。删除任务（`queue remove`）或修改时间（`set-time`）会自动清理系统定时任务。

### 自动提交 & 自动推送

每个队列任务完成后（无论成功或失败），会自动将 QUEUE.json 和 HISTORY.json 的状态变更提交到 git。这样即使通宵无人值守执行，也可以通过 `git log` 追踪队列进度。

添加 `--auto-push` 可在每个任务完成后自动推送到远程仓库：

```bash
awsl queue add "构建功能" --auto-push      # 单个任务
awsl queue start --auto-push               # 本次运行的所有任务
```

推送在每次成功提交后执行。如果推送失败（网络、认证问题），执行不会中断 — 提交会保留在本地。

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
awsl dashboard --bg         # 后台启动仪表盘进程，打印 URL 后退出
awsl dashboard stop         # 停止后台仪表盘进程
```

后台模式（`--bg`）将仪表盘服务器作为独立进程启动，PID 保存到 `.planning/.dashboard.pid`，打印 URL 和停止命令。使用 `awsl dashboard stop` 读取 PID 文件、终止进程并清理。

功能：
- **RPG 风格状态栏** — 完成/失败计数、总耗时、成功率（像素进度条）
- **日历热力图** — GitHub 贡献图风格，展示每日活动（最近 90 天）
- **耗时趋势图** — SVG 折线图，展示最近 30 天的构建耗时变化
- **时间线** — 按日期分组的运行记录，支持按项目筛选
- **项目侧边栏** — 所有项目列表，彩色徽章 + 任务计数
- **项目管理** — 注册、移除、扫描、查看所有项目的实时状态（队列计数、锁状态、上次运行）。选中项目可直接在面板上查看其队列或添加任务
- **队列监控** — 当前队列状态实时刷新（30 秒间隔）
- **队列操作** — 直接在看板上添加、删除、清空队列任务
- **队列定时调度** — 添加任务表单中的日期时间选择器可设置 `runAt`；队列表格新增"执行时间"列，显示生效时间（任务自身时间直接显示，从依赖链继承的时间带箭头标识）；点击 pending 任务的时间单元格可编辑/清除调度时间
- **清除历史** — 一键清除所有执行历史记录（删除 HISTORY.json）
- **实时日志流** — 基于 SSE 的实时日志面板，展示 agent 的 stdout/stderr
- **浏览器通知** — 任务失败和队列完成时弹出提醒（需授权）
- **角色管理** — 可视化 CRUD 编辑器，可创建自定义智能体、覆盖内置提示词、或恢复默认值 — 全部在仪表盘上操作
- **提示词模板** — 7 个内置模板（coder、reviewer、architect、tester、planner、devops、documenter），编辑器下拉菜单一键加载
- **全屏提示词编辑器** — 全视口覆盖层，编辑长提示词更舒适，实时字符计数
- **提示词预览** — 预览合成后的完整提示词（基础 + 技能 + 团队上下文），分页显示
- **Agent 分析** — 展示使用的 agent 角色、平均/峰值并行度、总波次数，每次运行可展开查看波次详情和 agent 徽章
- **波次任务详情** — 每个波次现在展示逐任务明细：描述、负责人、状态（done/failed/verified）、修改的文件、结果/错误信息。一眼看清每个波次完成了什么或为什么失败
- **调用统计** — "Invocations" 卡片展示每种命令类型（/awsl、/awsl-plan、/awsl-go、/awsl-quick、queue、cli、discuss）的调用次数。计数持久化到 `.planning/STATS.json`
- **日期筛选** — 支持按天、周、月或自定义日期范围筛选统计数据。所有面板组件根据所选时间段实时更新
- **像素艺术风格** — Press Start 2P 字体、复古动画

API 端点：
- `GET /api/history` — 执行历史
- `GET /api/stats` — 聚合统计
- `GET /api/queue` — 当前队列状态
- `GET /api/logs` — SSE 实时 agent 日志流
- `POST /api/queue/add` — 添加任务 `{goal, engine?, quick?, dependsOn?}`
- `DELETE /api/queue/remove?id=q_1` — 删除任务
- `POST /api/queue/clear` — 清空所有任务
- `POST /api/queue/set-time` — 设置/修改/清除调度时间 `{id, runAt}`
- `POST /api/history/clear` — 清除执行历史
- `GET /api/history/:id/waves` — 指定运行的波次详情，含逐任务明细
- `GET /api/projects` — 所有已注册项目的实时状态
- `POST /api/projects/add` — 注册项目 `{path, name?, tags?}`
- `POST /api/projects/remove` — 取消注册项目 `{path}`
- `POST /api/projects/scan` — 自动发现项目 `{dir, depth?}`
- `GET /api/projects/queue?path=` — 获取指定项目的队列
- `POST /api/projects/queue/add` — 向指定项目添加任务 `{path, goal, ...}`
- `POST /api/projects/queue/start` — 启动指定项目的队列执行 `{path, engine?, once?}`
- `POST /api/projects/queue/clear` — 清空指定项目的队列 `{path}`
- `GET /api/projects/history?path=` — 获取指定项目的执行历史
- `GET /api/projects/stats?path=` — 获取指定项目的统计数据
- `GET /api/agents` — 列出所有智能体（内置 + 自定义）。`?name=X` 返回单个智能体
- `POST /api/agents` — 创建自定义智能体 `{name, role, systemPrompt, ...}`
- `PUT /api/agents` — 更新智能体 `{name, ...fields}`
- `DELETE /api/agents?name=X` — 删除自定义智能体文件
- `GET /api/agents/templates` — 列出全部 7 个内置提示词模板
- `POST /api/agents/preview` — 合成完整提示词预览 `{name}` → `{composed, sections}`
- `GET /api/invocations` — 各命令类型的调用计数
- `GET /api/discussions` — 历史中的讨论条目
- `GET /api/clients` — 已连接的远程客户端列表
- `POST /api/clients/command` — 向客户端发送命令 `{clientId, action, payload?}`
- `WebSocket /ws/relay` — 远程客户端 WebSocket 中继端点

### 远程控制

将面板部署到服务器上，本地机器通过 WebSocket 中继连接：

```
┌─────────────────────────┐
│  服务器（面板）          │
│  awsl dashboard         │
│  http://server:3120     │
│                         │
│  ┌───────────────────┐  │
│  │  WebSocket 中继    │  │
│  │  /ws/relay        │  │
│  └─────┬───────┬─────┘  │
└────────┼───────┼────────┘
         │       │
    ┌────┘       └────┐
    ▼                 ▼
┌──────────┐   ┌──────────┐
│ 机器 A   │   │ 机器 B   │
│ remote   │   │ remote   │
│ connect  │   │ connect  │
└──────────┘   └──────────┘
```

```bash
# 在服务器上
awsl dashboard --port 3120

# 在本地机器上（一次性配置）
awsl remote init http://server:3120 --id my-laptop
awsl remote connect --bg
```

通过面板 API 发送命令：

```bash
# 查看已连接客户端
curl http://server:3120/api/clients

# 向远程机器添加队列任务
curl -X POST http://server:3120/api/clients/command \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-laptop","action":"queue:add","payload":{"goal":"构建 REST API"}}'

# 在远程机器上启动队列执行
curl -X POST http://server:3120/api/clients/command \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-laptop","action":"queue:start","payload":{"once":true}}'
```

支持的中继命令：`queue:add`、`queue:remove`、`queue:clear`、`queue:list`、`queue:get`、`queue:set-time`、`queue:start`、`agents:list`、`agents:get`、`agents:save`、`agents:delete`、`agents:templates`、`agents:preview`、`invocations:get`、`system:info`。

> 完整部署指南（systemd、PM2、Docker、Nginx 反向代理、内网穿透等）见 [DEPLOY.md](DEPLOY.md)。

## 讨论模式

不是所有问题都需要写代码。有时候你需要让智能体团队 **一起思考** — 辩论架构决策、评估技术权衡、分析设计方案。

讨论模式让所有智能体并行分析问题（从各自的专业角度出发），然后可选地进行多轮辩论（智能体互相回应对方观点），最终综合为一个连贯的答案。

### 用法

```bash
# 直接讨论
awsl discuss "How should we design the authentication system?"

# 通过队列讨论（带辩论轮次）
awsl queue add --discuss "What database schema fits our use case?" --rounds 2

# 定时调度通宵讨论
awsl queue add --discuss --at 03:00 "Analyze microservices vs monolith trade-offs for our scale"
```

### 讨论流程

```
第 1 轮: 并行观点收集    所有智能体独立分析问题
第 2..N 轮: 辩论（可选）  智能体互相回应对方的观点
综合:                     汇总为最终连贯答案
持久化:                   保存到 .planning/DISCUSSION-{timestamp}.md
```

### 选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--rounds <n>` | 1 | 讨论轮次（1-3）。更多轮次 = 更深入的辩论 |
| `--at <time>` | — | 定时调度（语法同队列任务） |
| `--cwd <path>` | `.` | 工作目录 |

### 输出

- 讨论记录保存到 `.planning/DISCUSSION-{timestamp}.md`
- 每个文件包含：所有智能体的观点、辩论轮次、最终综合答案
- 讨论记录会出现在 `awsl summary` 的输出中
- 仪表盘 API：`GET /api/discussions` 返回历史中的讨论条目

## 夜间工作总结

回顾夜间编码工作的成果。从 HISTORY.json（任务队列结果）和 `git log`（提交记录）中提取指定时间范围内的数据。

```bash
awsl summary
```

**选项：**

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--from <HH:MM>` | `22:00` | 工作开始时间 |
| `--to <HH:MM>` | `06:00` | 工作结束时间 |
| `--date <YYYY-MM-DD>` | 自动 | 锚定日期（根据当前时间自动判断） |
| `--all-projects` | false | 汇总所有已注册项目 |
| `--cwd <path>` | `.` | 工作目录 |

**时间范围自动检测：** 当前时间 < 06:00 → 昨晚。当前时间 >= 22:00 → 今晚。其他 → 昨晚。

**输出示例：**

```
┌─────────────────────────────────────┐
│     夜间工作总结                      │
│     2026-03-10 22:00 → 03-11 06:00  │
├─────────────────────────────────────┤
│  任务: 5 个, 4 完成, 1 失败          │
│  Git:  12 次提交                     │
│  耗时: 2 小时 34 分                  │
│  费用: $0.42                         │
├─────────────────────────────────────┤
│  智能体: coder ×8, reviewer ×2      │
└─────────────────────────────────────┘
```

## 在任意项目中启用 AWSL

想在自己的项目中使用 AWSL？只需两步：

### 第一步：全局安装技能

```bash
cd /path/to/awsl-agent-teams
npm run build
node dist/cli.js init --global    # 安装到 ~/.claude/skills/
```

这会让 `/awsl`、`/awsl-plan`、`/awsl-go` 等命令在 Claude Code 的**所有项目**中可用。

### 第二步：在项目中添加 CLAUDE.md

在你的项目根目录创建 `CLAUDE.md`，写入 AWSL 规则。推荐模板：

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

### 使用方式

现在在 Claude Code 中，直接分点甩需求：

```
1. 添加 JWT 用户认证
2. 构建 Stripe 支付模块
3. 写集成测试
```

Claude Code 会自动识别批量需求，通过 `/awsl-plan` 生成计划，确认后执行。

### 可选：自定义智能体

如需领域专业团队，在项目中创建 `agents/*.md` 文件（参见[自定义智能体](#自定义智能体)）。

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
║  │    逐任务审查 (git diff) → 严重问题阻断提交       │    ║
║  │    验证失败 → 自动修复 (3x)                       │    ║
║  │    任务失败 → 重试 (2x) → 重规划                  │    ║
║  │    文件冲突 → 自动分波                            │    ║
║  └───────────────────────────────────────────────────┘    ║
║                                                          ║
║  引擎: claude-code (每任务 claude -p)                    ║
║        builtin (pi-agent-core + 任意 LLM 提供商)        ║
╚══════════════════════════════════════════════════════════╝
 │
 ▼
输出: .planning/ 产物 + 代码 + 每任务 git 提交
```

**核心模块：** `context.ts` — `RunContext` 提供带生命周期的运行上下文，统一管理锁。它替代了分散的手动 `acquireLock`/`releaseLock` 调用，自动注册信号处理器并使用正确的 `cwd`，保证退出时清理。

## 流式执行

三种引擎（claude-code、codex、builtin）均支持**实时流式事件**。消费方无需等待最终结果，可以在 agent 执行过程中接收细粒度事件：

| 事件 | 说明 |
|------|------|
| `start` | Agent 进程已启动（含引擎类型） |
| `text` | 模型的增量文本输出 |
| `tool_start` | Agent 开始调用工具（工具名 + 参数） |
| `tool_end` | 工具执行完成 |
| `turn_end` | 一轮模型调用完成（含 token 用量） |
| `progress` | 信息性进度消息 |
| `error` | 非致命错误或警告 |
| `done` | Agent 执行完毕 — 携带最终 `RunResult` |

**通过 `ExecuteOptions` 使用：**

```typescript
import { executeTeam, type AgentStreamEvent } from "awsl-agent-core";

const result = await executeTeam(goal, agents, cwd, model, 3, {
  onStream: (event: AgentStreamEvent) => {
    if (event.type === "tool_start") {
      console.log(`[${event.agent}] 正在使用 ${event.tool}`);
    }
  },
});
```

**通过 `runAgent` 使用：**

```typescript
import { runAgent, type StreamCallback } from "awsl-agent-core";

const onStream: StreamCallback = (event) => {
  if (event.type === "text") process.stdout.write(event.text);
};

const result = await runAgent(agentDef, task, cwd, memory, roster, model, 30, undefined, undefined, undefined, undefined, onStream);
```

claude-code 引擎使用 `--output-format stream-json`（NDJSON）替代 `--output-format json`，实时提供 assistant 消息、工具调用和 token 用量。事件自动通过 `"agent-event"` 通道转发到 **LogStream**，供仪表盘/SSE 订阅者消费。

**CLI 用法 — `--stream` 标志：**

```bash
awsl run "构建一个 REST API" --stream
```

在终端内联显示实时进度：
```
[12:34:56] [coder]    >>> started (claude-code)
[12:34:58] [coder]    -> Read src/index.ts
[12:35:01] [coder]    <- Read
[12:35:03] [coder]    -> Edit src/index.ts
[12:35:05] [coder]    <- Edit
[12:35:06] [coder]    #1 (in=2340 out=890)
[12:35:10] [coder]    <<< done (turns=2 $0.0124)
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
| `reviewer` | 逐任务代码审查（git diff + 反模式清单）、质量门禁 |
| `tester` | 系统化调试 |

**TDD** — 强制执行 红-绿-重构。先写失败测试，最少代码使其通过，然后重构。

**逐任务代码审查** — 每个编码任务完成后，审查者立即收到真实 `git diff`，逐行检查反模式清单：设计缺陷、竞态条件、busy-wait、过期锁、delta/merge 混淆、缺失 `finally` 块等。严重发现在代码提交前就阻断任务。阶段 3 现在专注于自动化验证（tsc、npm test、eslint）。

**苏格拉底式头脑风暴** — 通过针对性问题探索需求，挑战假设，记录决策。

## 沙箱（内置引擎）

内置引擎对每个智能体强制执行沙箱策略。写操作限制在项目目录内，bash 命令按角色过滤。

**通过 `ExecuteOptions.sandbox` 配置：**

| 值 | 行为 |
|---|------|
| `true`（默认） | 使用基于角色的默认策略 |
| `false` | 完全禁用沙箱 |
| `SandboxPolicy` 对象 | 自定义规则 |

**各角色默认策略：**

| 角色 | 写路径 | Bash 模式 | 模式列表 |
|------|--------|-----------|----------|
| `coder` | `[cwd]` | 黑名单 | `rm -rf /`、`sudo `、`mkfs`、`dd if=`、`chmod 777`、`> /dev/sd` |
| `tester` | `[cwd]` | 白名单 | `npm test`、`npx tsc`、`npx vitest`、`npx jest`、`node `、`cat `、`ls`、`grep `、`find ` |
| `reviewer` | `[cwd]` | 白名单 | `cat `、`ls`、`grep `、`find `、`git log`、`git diff`、`git show` |
| `architect` | `[cwd]` | 白名单 | `cat `、`ls`、`grep `、`find `、`tree ` |
| `planner` | `[cwd]` | 白名单 | `cat `、`ls`、`find `、`wc ` |

- **白名单**：命令必须以允许的前缀开头 — 其他一律拒绝
- **黑名单**：命令不能包含任何禁止的模式 — 其他一律允许
- Windows 上路径校验不区分大小写
- 可通过 `TeamAgentDef` 的 `sandbox` 字段或智能体 frontmatter 按智能体覆盖

## 内置智能体

| 名称 | 角色 | 说明 |
|------|------|-------------|
| planner | 规划师 | 将目标分解为结构化微任务 |
| architect | 架构师 | 设计系统架构和接口 |
| coder | 编码者 | 全栈开发，内置子 agent 并行（启用 Agent tool） |
| reviewer | 审查者 | 逐任务代码审查（git diff + 反模式清单）+ 质量门禁 |
| tester | 测试者 | 设计和运行测试，调试失败 |

### 双层并行架构

AWSL 同时在两个层级实现并行：

```
┌─────────────────────────────────────────────────────────┐
│  第一层：AWSL 编排（planner 控制）                        │
│                                                         │
│  Wave 1: [architect]         ← 先做架构设计               │
│  Wave 2: [coder, coder]     ← 功能 A + 功能 B 并行        │
│  Wave 3: [tester, reviewer] ← 测试 + 审查并行             │
│                                                         │
│  每个 coder 是独立的 claude -p 进程                       │
│  planner 保证同一 wave 内任务文件不重叠                    │
├─────────────────────────────────────────────────────────┤
│  第二层：Claude Code Agent Tool（coder 内部控制）          │
│                                                         │
│  coder（功能 A）内部启动子 agent：                        │
│    ├─ 子 agent 1 → API 接口 (server.ts)                  │
│    └─ 子 agent 2 → UI 组件 (dashboard.html)              │
│                                                         │
│  coder（功能 B）内部启动子 agent：                        │
│    ├─ 子 agent 1 → 数据模型 (types.ts)                   │
│    └─ 子 agent 2 → 测试套件 (feature-b.test.ts)          │
└─────────────────────────────────────────────────────────┘
```

- **第一层** 按**功能模块**拆分 — planner 创建独立任务，各分配一个 coder
- **第二层** 按**文件层级**拆分 — coder 用 Agent tool 在任务内部并发修改多个文件
- 第一层并行任务**不允许共享文件**（planner 强制保证）
- 第二层子 agent 由父 coder 协调（任务内部无文件冲突）

自定义 agent 启用 Agent tool，在 tools 中添加 `agent`：

```yaml
tools: read,write,edit,bash,grep,glob,agent
```

## 自定义智能体

在项目中创建 `agents/<name>.md` — 手动创建、通过 CLI 或仪表盘 UI 均可：

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
| `name` | 智能体标识（必填）。必须匹配 `/^[a-z][a-z0-9-]*$/`，最长 50 字符 |
| `role` | `planner`、`architect`、`coder`、`reviewer`、`tester` 或 `custom` |
| `description` | 该智能体的功能描述 |
| `tools` | 逗号分隔字符串（`read,write,edit,bash`）或 YAML 数组 |
| `skills` | 要激活的 Guardian 技能：逗号分隔字符串或 YAML 数组 |
| `thinking` | LLM 思考级别：`low`、`medium`、`high` |
| `model` | 覆盖模型：`anthropic:claude-sonnet-4-20250514`、`openai:gpt-4o` |

`tools` 和 `skills` 也支持 **YAML 数组语法**：

```yaml
---
name: api-expert
role: coder
tools:
  - read
  - write
  - bash
skills:
  - tdd
  - debug
---
```

> 无效的 frontmatter 会输出友好错误信息（含文件名和具体校验问题）— 该智能体被跳过，不会静默出错。

### 通过 CLI 管理智能体

```bash
awsl agents                    # 列出所有智能体（内置 + 自定义）
awsl agents show <name>        # 查看完整详情，包含系统提示词
awsl agents create <name>      # 创建新的自定义智能体
  --role <role>                #   角色（默认：custom）
  --description <desc>         #   简短描述
  --prompt <text>              #   系统提示词（内联）
  --prompt-file <path>         #   从文件读取系统提示词
  --template <name>            #   从内置模板预填充
  --tools <t1,t2>             #   工具列表
  --model <model>              #   覆盖模型
  --skills <s1,s2>            #   Guardian 技能
  --thinking <level>           #   思考级别（low/medium/high）
awsl agents edit <name>        # 编辑已有智能体（与 create 相同的参数）
awsl agents delete <name>      # 删除自定义智能体文件
awsl agents reset <name>       # 删除覆盖文件，恢复内置默认值
awsl agents templates          # 列出全部 7 个内置提示词模板
awsl agents prompt <name>      # 在 $EDITOR 中编辑提示词
awsl agents prompt <name> --show   # 打印当前提示词到 stdout
awsl agents prompt <name> --set "..."  # 内联设置提示词
awsl agents prompt <name> --file <path>  # 从文件设置提示词
awsl agents preview <name>     # 查看合成后的完整提示词（基础 + 技能 + 团队上下文）
```

**覆盖机制：** 编辑内置智能体（如 `coder`）会创建 `agents/coder.md` 来覆盖默认值。使用 `agents reset coder` 可删除覆盖文件，恢复原始设置。

### 提示词模板

AWSL 内置 7 个角色提示词模板：**coder**、**reviewer**、**architect**、**tester**、**planner**、**devops**、**documenter**。模板提供高质量的提示词起点。

```bash
# 列出所有模板
awsl agents templates

# 用模板创建智能体
awsl agents create my-devops --role coder --template devops

# 预览合成后的完整提示词（基础 + 技能 + 团队上下文）
awsl agents preview coder
```

`--template` 参数在 `create`/`edit` 时预填充系统提示词和角色。显式指定 `--prompt`/`--prompt-file` 会覆盖模板。

### 通过仪表盘管理智能体

仪表盘包含 **角色管理** 卡片和可视化编辑器：

- **智能体卡片** — 每个智能体显示为一张卡片，含名称、角色徽章（彩色）和来源徽章（`built-in` 灰色 / `custom` 绿色 / `override` 黄色）
- **编辑器弹窗** — 点击卡片或 `[+New]` 打开完整编辑器，包含名称、角色、描述、模型、工具、技能、思考级别和系统提示词（等宽字体文本框）字段
- **模板选择器** — 提示词文本框上方的下拉菜单，加载内置模板。"Apply" 一键填充提示词并自动设置角色/描述
- **全屏编辑器** — "Expand" 按钮打开全视口覆盖层，等宽字体大文本框，编辑长提示词更舒适
- **字符计数** — 文本框下方实时显示字符数，普通和全屏模式都有
- **预览面板** — "Preview" 按钮（编辑模式）展示合成后的完整提示词，分页显示：合成结果 / 基础 / 技能 / 团队
- **操作** — `[Save]` 创建/更新，`[Reset to Default]` 恢复被覆盖的内置智能体，`[Delete]` 删除自定义智能体

### 智能体 CRUD API

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| `GET` | `/api/agents` | 列出所有智能体。`?name=X` 返回单个智能体 |
| `POST` | `/api/agents` | 创建自定义智能体 `{name, role, systemPrompt, ...}` |
| `PUT` | `/api/agents` | 更新智能体 `{name, ...fields}` |
| `DELETE` | `/api/agents?name=X` | 删除自定义智能体文件 |
| `GET` | `/api/agents/templates` | 列出全部 7 个内置提示词模板 `[{name, description, prompt}]` |
| `POST` | `/api/agents/preview` | 合成完整提示词预览 `{name}` → `{composed, sections: {base, skills, team}}` |

远程客户端也支持通过中继命令管理智能体：`agents:list`、`agents:get`、`agents:save`、`agents:delete`、`agents:templates`、`agents:preview`。

## .planning/ 目录

状态跨会话持久保存：

```
.planning/
├── .lock                 # 并发锁（自动管理）
├── STATE.md              # 进度、决策、阻塞项
├── DESIGN.md             # 头脑风暴输出
├── PLAN.md               # 结构化任务分解
├── WAVES.md              # 计算出的波次调度
├── VERIFICATION.md       # 确定性检查结果（tsc、eslint、测试）
├── REVIEW.md             # 逐任务审查者发现（git diff 审查 + 反模式清单）
├── DISCUSSION-*.md       # 讨论模式记录（自动管理）
├── research/
│   ├── architecture.md   # 代码库分析
│   └── conventions.md    # 代码风格分析
├── CHECKPOINT.json       # 限额恢复检查点（自动管理）
├── QUEUE.json            # 任务队列（自动管理）
├── HISTORY.json          # 睡前模式执行历史（自动管理）
├── STATS.json            # 调用统计计数（自动管理）
├── .dashboard.pid        # 后台仪表盘进程 PID（自动管理）
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
| 通宵构建，无人值守 | 终端模式（`--engine claude-code` 或 `--engine codex`） |
| CI/CD 集成 | 终端模式 |
| 最高代码质量 | 终端模式（审查者循环） |
| 最快交付 | CC 模式 |
| Bug 修复 | CC 模式（`/awsl-quick`） |
| 通宵多项目构建 | 任务队列（`awsl queue start`） |
| 架构决策、设计权衡 | 讨论模式（`awsl discuss`） |

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
    verify: true,          // 逐任务代码审查 + 验证
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
awsl run "目标" --engine codex
awsl run "目标" --engine codex --quick

# 仅规划工作流
awsl run --plan-only "目标"
awsl run --execute-plan

# 内置引擎（需要 API 密钥）
awsl run "目标" --engine builtin --model anthropic:claude-sonnet-4-20250514

# 质量工具
awsl validate                # 解析 + 验证 PLAN.md → WAVES.md
awsl verify                  # 运行多语言验证 provider（tsc/test/eslint/build/prettier/audit/pytest/mypy/ruff/go/cargo/自定义），带计时报告
awsl review                  # 静态分析（无 LLM）— 含未使用 import、函数过长、嵌套过深、重复代码检测

# 锁管理
awsl lock                    # 查看锁状态
awsl unlock                  # 释放自己的锁
awsl unlock --force          # 强制释放任何锁

# 调用统计
awsl track <type> [goal]         # 记录一次调用（team/plan/go/quick/queue/cli/discuss）
awsl invocations                 # 查看各命令类型的调用计数

# 智能体
awsl agents                  # 列出所有智能体
awsl agents show <name>      # 查看智能体完整详情，含系统提示词
awsl agents create <name>    # 创建自定义智能体（--role, --prompt, --template, --tools 等）
awsl agents edit <name>      # 编辑已有智能体（与 create 相同参数）
awsl agents delete <name>    # 删除自定义智能体文件
awsl agents reset <name>     # 删除覆盖文件，恢复内置默认值
awsl agents templates        # 列出全部 7 个内置提示词模板
awsl agents prompt <name>    # 在 $EDITOR 中编辑提示词（--show, --set, --file）
awsl agents preview <name>   # 查看合成后的提示词（基础 + 技能 + 团队）

# 任务队列（睡前模式）
awsl queue add "构建 REST API" --quick        # 添加任务
awsl queue add "添加认证" --depends-on q_1     # 带依赖的任务
awsl queue add "写测试" --depends-on all       # 等待所有前置任务
awsl queue add "通宵构建" --at "03:00"         # 定时调度到凌晨 3 点
awsl queue add "延后任务" --at "+2h"           # 2 小时后执行
awsl queue split "先认证，然后支付，最后测试"   # 自然语言 → 预览 → 确认 → 添加
awsl queue split "..." --yes                   # 跳过确认提示
awsl queue plan "先认证，然后支付，最后测试"    # 自然语言 → 直接添加（无预览）
awsl queue list                                # 查看队列
awsl queue show q_1                            # 查看单个任务详情
awsl queue remove q_1                          # 移除任务
awsl queue start --engine claude-code          # 开始执行
awsl queue start --engine codex                # 使用 Codex 开始执行
awsl queue clear                               # 清空队列

# 讨论模式
awsl discuss "How should we design the auth system?"              # 直接讨论
awsl queue add --discuss "Evaluate database options" --rounds 2   # 通过队列讨论，带辩论轮次
awsl queue add --discuss --at 03:00 "Microservices vs monolith"   # 定时调度通宵讨论

# 快速启动 — 一条命令启动所有服务
awsl start                                     # 启动仪表盘 + 远程连接（如已配置）
awsl start --server http://server:3120         # 启动 + 配置远程，一步到位
awsl stop                                      # 停止所有服务（同时释放锁 + 重置运行中任务）
awsl status                                    # 查看运行状态

# 仪表盘（手动控制）
awsl dashboard [--port N]                      # 打开睡前模式像素风仪表盘（默认端口 3120）
awsl dashboard --bg                            # 后台启动仪表盘进程
awsl dashboard stop                            # 停止后台仪表盘进程

# 项目管理
awsl projects                                  # 列出所有已注册项目及状态
awsl projects add [path] [--name N]            # 注册项目（默认当前目录）
awsl projects remove <path|name>               # 取消注册项目
awsl projects scan [dir]                       # 自动发现目录下的项目

# 夜间工作总结
awsl summary                                   # 昨晚的工作总结（22:00→06:00）
awsl summary --date 2026-03-10                 # 指定日期
awsl summary --all-projects                    # 汇总所有项目

# 远程控制（将本地机器连接到远程面板）
awsl remote init http://server:3120            # 保存配置 + 启动连接
awsl remote status                             # 查看连接状态
awsl remote stop                               # 停止后台客户端
```

## 环境变量

| 变量 | 是否必需 | 说明 |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | 仅 `--engine builtin` 需要 | Anthropic API 密钥 |
| `OPENAI_API_KEY` | 仅 OpenAI 模型需要 | OpenAI API 密钥 |
| `DEBUG=1` | 否 | 启用调试日志 |

> **注意：** `--engine claude-code` 和 `--engine codex` 在 AWSL 中都**不需要额外 API 密钥**，它们分别复用本地 CLI 会话（`claude -p` 或 `codex exec`）。

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
| `unused-import` | 警告 | 未使用的 import 语句 |
| `function-too-long` | 警告 | 函数超过 50 行 |
| `deep-nesting` | 警告 | 嵌套超过 4 层 |
| `duplicate-code` | 警告 | 重复代码块（6+ 行相同代码） |

## 横向对比

| | AWSL 终端 | AWSL CC | 单次 CC 会话 |
|---|---|---|---|
| **规划** | 代码强制 DAG | 技能引导 | 手动 |
| **并行** | 真并行（并发 `claude -p`） | CC Agent 工具 | 无 |
| **自愈** | 自动修复 + 重试 + 重规划 | 手动 | 手动 |
| **代码审查** | 逐任务 git diff 审查 + 静态 | 审查者智能体 | 无 |
| **Git 历史** | 每任务原子提交 | 单次提交 | 单次提交 |
| **规格合规** | 高（审查者循环） | 中 | 不确定 |
| **速度** | ~20 分钟 | ~6 分钟 | ~5 分钟 |
| **自主性** | 完全 | 部分 | 无 |

## 许可证

MIT
