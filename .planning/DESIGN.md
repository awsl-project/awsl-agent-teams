## AWSL_RESULT

### 设计结论：Dashboard 初始加载应聚合所有机器的统计数据

**问题确认**：你说的对。当用户刚进页面、没有选中任何机器时，统计卡片（Done、Failed、Total Time、Success Rate、Tokens、Cost）应该显示**所有机器的汇总数据**，而不只是本地数据。

**当前 Bug**：`public/dashboard.html` 的 `render()` 函数（第 1333 行）在 `selectedClient === null` 时只用了 `hist.entries`（本地历史），完全忽略了远程客户端的 `clients[i].status.history`。

**修复方案**（已有设计文档 `.planning/design-stats-machines.md`）：

| 要素 | 内容 |
|---|---|
| **改动文件** | `public/dashboard.html`（仅此一个） |
| **改动函数** | `render()`（第 1333-1356 行） |
| **核心逻辑** | 当 `selectedClient` 为空时，将所有远程客户端的 `status.history` 合并到本地 `hist.entries` |
| **去重策略** | 以 `id + startedAt` 为复合 key，防止本地=远程时的重复计数 |
| **Queue 行为** | 不变，仍显示本地队列（Queue 是机器级操作） |
| **后端改动** | 无需任何改动，数据已在客户端 `clients` 数组中 |

**受影响的统计项**：Done、Failed、Total Time、Success Rate、Input/Output/Total Tokens、Cost、Activity Heatmap、Duration Trend、Projects 侧栏、Timeline

**关键决策理由**：
- 选择客户端聚合而非新建 API → 数据已通过 `/api/clients` 全部可用，最简方案
- 去重而非直接拼接 → 防止 Dashboard 机器同时作为 remote client 时数据重复
- Queue 不聚合 → Queue 是操作导向的，聚合会导致操作混乱

**产出文件**：
- `.planning/design-stats-machines.md`（已有设计文档，已验证正确）
- `.planning/shared-memory.json`（共享给其他 agent 的设计数据）