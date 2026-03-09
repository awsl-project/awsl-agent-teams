# task_4: Update all three documentation files to reflect the new RunC

Assignee: coder
Status: done

## Result
All three docs now mention `RunContext`/`context.ts`:

- **README.md:440** — Key module note after architecture diagram
- **README.zh-CN.md:440** — Chinese mirror
- **BEST_PRACTICES.md:338-343** — Usage guide in the lock management section

## AWSL_RESULT

### Delivered: Documentation updated for RunContext

**Files modified:**
- `README.md` — Added "Key module" note for `context.ts` in the Architecture section
- `README.zh-CN.md` — Mirrored the same in Chinese ("核心模块")
- `BEST_PRACTICES.md` — Added "RunContext（推荐）" subsection in §7 并发锁保护, covering `acquire()`, `tryAcquire()`, signal handler fix, and cleanup patterns

**Verification:** `grep -c context` across all three files returns 19 matches (up from ~12 before). All three docs now reference `RunContext` and `context.ts`.