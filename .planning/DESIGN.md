`atomicCommit` is **not** imported yet. It needs to be added from `./planning.js`. Design is complete — let me write the final report.

## AWSL_RESULT

### Design: 队列任务后自动 Commit

**目标**：每次队列任务（`executeTeam`）执行完毕后，自动 commit QUEUE.json 和 HISTORY.json 的状态变更。

**方案**：在 `src/queue.ts` 的任务完成路径（成功 + 失败）添加 `atomicCommit` 调用。

**修改文件**：
| 文件 | 变更 |
|---|---|
| `src/queue.ts` | 添加 `atomicCommit` import + 两处调用（成功路径 ~line 356、失败路径 ~line 394） |
| `README.md` | 文档更新 |
| `README.zh-CN.md` | 文档更新 |
| `BEST_PRACTICES.md` | 文档更新 |

**关键设计决策**：

1. **Commit 在 queue.ts 而非 orchestrator.ts** — 队列状态是 queue.ts 的职责，executeTeam 内部已有自己的 commit
2. **成功和失败都 commit** — 失败状态同样有价值（记录原因，支持 resume）
3. **尊重 autoCommit 选项** — 与 `--no-commit` CLI flag 保持一致
4. **不传 taskFiles 参数** — 此时脏文件仅剩 `.planning/` 状态文件，正是我们要 commit 的
5. **Commit 消息格式**: `{taskId}: Queue task {status}`（如 `q_1: Queue task done`）
6. **用 try/catch 包裹** — commit 失败不应中断队列循环

**实现量**：~10 行代码 + 文档更新

**设计文件**：`.planning/MEMORY.json` (key: `design`)