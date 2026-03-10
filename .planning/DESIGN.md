## AWSL_RESULT

### 设计结论：`--auto-push` 方案

**核心决策**：在 `queue start` 命令上添加 `--auto-push` 标志，每个任务 commit 后自动 push。

**改动范围**（约 20 行代码）：

| 文件 | 改动 |
|------|------|
| `src/queue.ts` | 新增 `gitPush()` 辅助函数 + `start()` options 加 `autoPush` + 2 处调用点 |
| `src/cli.ts` | 解析 `--auto-push` flag + 更新 `usage()` |
| 文档 x3 | README.md, README.zh-CN.md, BEST_PRACTICES.md |

**关键设计决策**：
1. Session 级别控制（`queue start --auto-push`），而非 per-task 或全局
2. Push 失败不阻塞队列执行（log.warn 继续）
3. 启动时检测 remote 配置，无 remote 则警告
4. 绝不 force push
5. 系统级调用，不经过 sandbox