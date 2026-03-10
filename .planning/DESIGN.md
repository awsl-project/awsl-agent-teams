## AWSL_RESULT

### 设计完成：多项目管理（Projects Page + 全局注册表）

**核心方案：** 新增全局项目注册表 `~/.awsl/projects.json` + Dashboard "Projects" 页面

### 关键决策

| 决策 | 理由 |
|------|------|
| 注册表位于 `~/.awsl/projects.json` | 全局用户级别，跨项目可见 |
| 项目以绝对路径为唯一标识 | `.planning/` 本身就是路径绑定的 |
| 跨项目启动队列：spawn 独立子进程 | `awsl queue start --cwd <path>`，隔离性好 |
| 自动注册：awsl start/run/queue 自动注册当前项目 | 无需手动维护 |
| 不共享队列：每个项目保持独立队列 | Dashboard 只是统一视图 |

### 实现波次

- **Wave 1** (并行): `src/projects.ts` (ProjectManager) + CLI `projects` 子命令
- **Wave 2** (依赖 W1): Dashboard API 端点 + Dashboard UI Projects 区域
- **Wave 3** (依赖 W1): `index.ts` 导出
- **Wave 4** (依赖全部): 测试 + 文档更新

### 产出文件
- `.planning/designs/multi-project.md` — 完整设计文档
- `.planning/shared-memory.json` — 共享内存（供其他 agent 读取）

### 评估的 3 个方案
1. **Central Registry** (已选) — 简单，保留 file-as-state 架构
2. Relay-Extended — 过度工程化，混淆项目与机器概念
3. Multi-Dashboard — 太复杂，需要多端口管理