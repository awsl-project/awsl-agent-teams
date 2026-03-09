# AWSL 安装教程

> **重要：** 本项目尚未发布到 npm，目前 **只能通过源码克隆编译安装**。`npm install -g awsl-agent-core` 和 `npx awsl-agent-core` 暂不可用。npm 发布计划见下方说明。

## 前置条件

| 依赖 | 最低版本 | 检查命令 |
|------|---------|---------|
| Node.js | v18+ | `node -v` |
| Git | 任意 | `git --version` |
| Claude Code | 最新 | `claude --version` |

> Claude Code 安装：https://docs.anthropic.com/en/docs/claude-code/overview

---

## 安装方式：源码克隆编译（当前唯一方式）

### Windows

#### 1. 安装 Node.js（如果没有）

```powershell
# 方式 A：官网 https://nodejs.org → 下载 LTS 版 → 运行安装
# 方式 B：winget
winget install OpenJS.NodeJS.LTS
# 方式 C：scoop
scoop install nodejs-lts
```

验证：
```powershell
node -v    # v18.x 或更高
```

#### 2. 克隆 + 安装 + 编译

```powershell
git clone https://github.com/awsl-project/awsl-agent-teams.git
cd awsl-agent-teams
npm install
npm run build
```

#### 3. 安装 Skills

```powershell
node dist/cli.js init --global
```

### macOS

#### 1. 安装 Node.js（如果没有）

```bash
# 方式 A：Homebrew（推荐）
brew install node
# 方式 B：nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install --lts
```

验证：
```bash
node -v    # v18.x 或更高
```

#### 2. 克隆 + 安装 + 编译

```bash
git clone https://github.com/awsl-project/awsl-agent-teams.git
cd awsl-agent-teams
npm install
npm run build
```

#### 3. 安装 Skills

```bash
node dist/cli.js init --global
```

### 更新

```bash
cd awsl-agent-teams
git pull
npm install
npm run build
node dist/cli.js init --global
```

---

## 安装后的文件结构

```
~/.claude/skills/              ← Skills（所有项目共享）
  awsl/SKILL.md
  awsl-quick/SKILL.md
  awsl-plan/SKILL.md
  awsl-go/SKILL.md
  awsl-status/SKILL.md
  awsl-agents/SKILL.md

你的项目/                      ← 每个项目可选
  agents/                      ← 自定义 Agent 定义
    react-dev.md
    security-reviewer.md
  .planning/                   ← AWSL 运行产物（自动生成）
    PLAN.md
    WAVES.md
    STATE.md
    VERIFICATION.md
    .lock                      ← 并发锁（运行中存在，结束自动删除）
```

### 关于路径

Skills 里硬编码了 `dist/cli.js` 的绝对路径。**不要移动 `awsl-agent-teams` 目录**，移动后需重新运行 `node dist/cli.js init --global`。

---

## 给项目添加自定义 Agent

在你的项目根目录：

```bash
mkdir -p agents
```

创建 `agents/my-coder.md`：

```markdown
---
name: my-coder
role: coder
description: 项目专属开发者
---

你是本项目的专属开发者。

技术栈：React + TypeScript + Tailwind
规范：
- 用 Zustand 管状态
- 组件放 src/components/
- 每个组件配测试文件
```

`/awsl` 执行时会自动读取 `agents/` 目录。

---

## 常见问题

### `/awsl` 在 Claude Code 中无反应

```bash
# 检查 skills 文件是否存在
ls ~/.claude/skills/awsl/SKILL.md

# 不存在则重新安装
node /path/to/awsl-agent-teams/dist/cli.js init --global
```

### `validate` 或 `verify` 报 "Cannot find module"

编译产物过期，重新编译：
```bash
cd awsl-agent-teams
npm run build
```

### 需要 API Key 吗？

| 使用方式 | 需要 API Key？ |
|---------|---------------|
| 在 Claude Code 中用 `/awsl` | **不需要** — CC 自带 |
| 终端跑 `awsl run --engine claude-code` | **不需要** — 用 `claude -p`（CC 订阅） |
| 终端跑 `awsl run --engine builtin` | **需要** — 设置 `ANTHROPIC_API_KEY` |

> **推荐终端使用方式：** `awsl run "goal" --engine claude-code`，无需 API key，直接用 Claude Code 订阅。

仅当使用 builtin 引擎时需要 API Key：
```bash
# macOS / Linux
export ANTHROPIC_API_KEY=sk-ant-...

# Windows PowerShell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
```

### 提示 "AWSL is already running on this project"

另一个 AWSL 会话正在运行，或上次异常退出留下了过期锁。

```bash
# 查看锁状态
awsl lock

# 确认没有其他 AWSL 在跑后，强制解锁
awsl unlock --force
```

> 锁超过 30 分钟会自动过期。如果锁持有进程已经退出，也会自动清除。

### macOS 上 npm install 报 gyp 错误

```bash
xcode-select --install
```

---

## 卸载

```bash
rm -rf ~/.claude/skills/awsl*
rm -rf awsl-agent-teams
```

---

## 快速验证清单

- [ ] `node -v` 显示 v18+
- [ ] `claude --version` 显示版本号
- [ ] `node dist/cli.js --help` 显示帮助
- [ ] `~/.claude/skills/awsl/SKILL.md` 存在
- [ ] Claude Code 中 `/awsl-status` 无报错
