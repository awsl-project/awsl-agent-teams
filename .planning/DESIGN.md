## AWSL_RESULT

### Design: Discussion Mode (多Agent讨论模式)

**Approach:** New `src/discuss.ts` module — separate from the build pipeline, called from queue when `mode === "discuss"`.

**Discussion Flow:**
1. **Parallel Perspectives** — All agents (architect, coder, reviewer, tester) independently analyze the question from their role
2. **Debate Rounds** (optional, 1-3) — Agents respond to each other's perspectives
3. **Synthesis** — Combined into a final coherent answer
4. **Persist** — `.planning/DISCUSSION-{id}.md` + answer in HISTORY.json

**Key Data Model Changes:**
- `QueueTask.mode?: "build" | "discuss"` — backward compatible
- `HistoryEntry.mode?` + `HistoryEntry.answer?` — stores discussion output
- `SessionSummary.discussions[]` — rendered in summary timeline

**Integration Points:**
| Component | Change |
|-----------|--------|
| `src/discuss.ts` | **NEW** — discussion orchestration (~150 lines) |
| `src/queue.ts` | Branch on mode: discuss → `discussTeam()`, build → `executeTeam()` |
| `src/history.ts` | Add `mode` and `answer` fields |
| `src/summary.ts` | Add discussions section to summary output |
| `src/dashboard.ts` | Accept `mode` in queue/add API, new `/api/discussions` endpoint |
| `src/cli.ts` | `--discuss` flag, `--rounds N`, `awsl discuss` alias |
| Dashboard HTML | Toggle switch for discussion mode, answer display in timeline |

**Why this approach:**
- Clean separation — discussion pipeline ≠ build pipeline
- Minimal changes to existing code — only queue.ts needs a branch
- All new fields are optional → zero migration cost
- Naturally fits the queue/sleep model — question goes in, answer comes out overnight

**Design documents produced:**
- `.planning/designs/discussion-mode.md` — Full design (detailed)
- `.planning/designs/discussion-mode-summary.md` — Implementation guide (concise)