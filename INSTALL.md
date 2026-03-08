# AWSL 安装教程

## 前置条件

| 依赖 | 最低版本 | 检查命令 |
|------|---------|---------|
| Node.js | v18+ | `node -v` |
| Git | 任意 | `git --version` |
| Claude Code | 最新 | `claude --version` |

> Claude Code 安装：https://docs.anthropic.com/en/docs/claude-code/overview

---

## 方式一：npm 安装（推荐）

最简单，一行命令。

### Windows

```powershell
# 全局安装
npm install -g awsl-agent-core

# 安装 Skills 到 Claude Code
awsl init --global
```

### macOS

```bash
# 全局安装
npm install -g awsl-agent-core

# 安装 Skills 到 Claude Code
awsl init --global
```

### 验证

```bash
awsl --help                    # 显示帮助
```

打开 Claude Code，输入 `/awsl-status`，无报错即成功。

### 更新

```bash
npm update -g awsl-agent-core
awsl init --global             # 重新安装 skills
```

---

## 方式二：GitHub 克隆安装

适合想看源码或参与开发的人。

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
git clone https://github.com/你的用户名/pi-agent-teams.git
cd pi-agent-teams
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
git clone https://github.com/你的用户名/pi-agent-teams.git
cd pi-agent-teams
npm install
npm run build
```

#### 3. 安装 Skills

```bash
node dist/cli.js init --global
```

### 更新（GitHub 方式）

```bash
cd pi-agent-teams
git pull
npm install
npm run build
node dist/cli.js init --global
```

---

## 发布到 npm（给项目维护者）

如果你是项目维护者，想让别人能 `npm install -g awsl-agent-core`：

### 1. 注册 npm 账号

```bash
npm adduser
# 按提示输入用户名、密码、邮箱
```

### 2. 修改 package.json

把 `repository.url` 改成你的实际 GitHub 地址：

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/你的真实用户名/pi-agent-teams"
  }
}
```

### 3. 发布

```bash
cd pi-agent-teams

# 检查将发布的文件
npm pack --dry-run

# 发布
npm publish
```

> `prepublishOnly` 脚本会自动运行 `tsc` 编译。`files` 字段确保只发布 `dist/`、`agents/` 和文档。

### 4. 后续更新版本

```bash
# 改 bug
npm version patch    # 0.1.0 → 0.1.1

# 加功能
npm version minor    # 0.1.0 → 0.2.0

# 大改
npm version major    # 0.1.0 → 1.0.0

# 发布
npm publish
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

- **npm 全局安装：** Skills 里的 CLI 路径指向全局 `node_modules` 目录，跟着 npm 走，不用管
- **GitHub 克隆安装：** Skills 里硬编码了 `dist/cli.js` 的绝对路径。**不要移动 `pi-agent-teams` 目录**，移动后需重新 `node dist/cli.js init --global`

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
awsl init --global                           # npm 方式
node /path/to/pi-agent-teams/dist/cli.js init --global   # GitHub 方式
```

### `validate` 或 `verify` 报 "Cannot find module"

编译产物过期，重新编译：
```bash
cd pi-agent-teams
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

### npm install -g 报权限错误（macOS）

```bash
# 方式 A：用 sudo
sudo npm install -g awsl-agent-core

# 方式 B：修改 npm 全局目录（推荐）
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g awsl-agent-core
```

### Windows 上 npm install -g 后 `awsl` 命令找不到

确认 npm 全局 bin 在 PATH 中：
```powershell
npm config get prefix
# 输出类似 C:\Users\你的用户名\AppData\Roaming\npm
# 确认这个目录在系统 PATH 里
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

### npm 方式

```bash
npm uninstall -g awsl-agent-core
rm -rf ~/.claude/skills/awsl*
```

### GitHub 方式

```bash
rm -rf ~/.claude/skills/awsl*
rm -rf pi-agent-teams
```

---

## 快速验证清单

- [ ] `node -v` 显示 v18+
- [ ] `claude --version` 显示版本号
- [ ] `awsl --help`（npm 方式）或 `node dist/cli.js --help`（GitHub 方式）显示帮助
- [ ] `~/.claude/skills/awsl/SKILL.md` 存在
- [ ] Claude Code 中 `/awsl-status` 无报错
