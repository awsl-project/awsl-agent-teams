## AWSL_RESULT

### Design: Queue Task Splitting (`queue split`)

**Core problem**: `queue.plan()` adds tasks immediately with no preview — users need to see what will be created before committing.

**Solution**: Refactor into two-step API + new CLI command.

#### API Changes (src/queue.ts)
- `planPreview(description)` — LLM call only, returns `PlannedTask[]` without touching queue
- `planCommit(planned, defaults)` — Takes preview result, resolves deps, adds to queue
- `plan()` — Kept as backward-compat wrapper

#### CLI Change (src/cli.ts)
- `queue split <text>` — Shows formatted preview table → Y/n confirmation → adds on confirm
- Supports `--yes` for non-interactive use

#### Interface Enhancement
- `PlannedTask.mode?: "build" | "discuss"` — LLM can suggest discussion tasks

#### Key Decisions
| Decision | Why |
|----------|-----|
| Two-step API (preview + commit) | Users need preview before commit |
| Keep `plan()` as wrapper | Backward compatibility |
| `split` ≠ `plan` | Different intent: interactive vs immediate |
| No interactive editing v1 | `queue remove` suffices; avoid overengineering |

#### Files
- `src/queue.ts`, `src/cli.ts`, `src/index.ts`, `CLAUDE.md`, `README.md`, `README.zh-CN.md`, `BEST_PRACTICES.md`

Design stored in `.planning/design.md` and `.planning/shared-memory.json`.