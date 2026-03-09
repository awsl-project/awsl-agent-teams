## AWSL_RESULT

### Design: Make `verify` a True Master Switch

**Problem:** `--no-verify` only skips Phase 3 (reviewer agent). Phase 3b (provider verify + auto-fix loop) runs unconditionally — `runFullVerification()` still invokes tsc/npm test/eslint, and the coder agent still attempts auto-fixes.

**Solution:** One-line change in `src/orchestrator.ts` — wrap the Phase 3b block (lines 699–739) with `if (verifyEnabled)`.

| When `verify=false` | Effect |
|---|---|
| Phase 3: Reviewer agent | Skipped (already was) |
| Phase 3b: Provider verify (tsc, test, eslint) | **Now skipped** |
| Phase 3b: Auto-fix coder loop | **Now skipped** |
| Task auto-retry | Still runs (independent concern) |
| `awsl verify` CLI command | Unaffected (standalone) |

**Key decisions:**
1. **Reuse existing `verifyEnabled` flag** — no new config options needed
2. **Don't disable task auto-retry** — retry handles execution failures, not verification; user didn't request it
3. **Don't touch standalone `awsl verify`** — it's a separate CLI command, not part of `executeTeam`
4. **YAGNI on granular sub-options** — `verifyReviewer` / `verifyCode` / `autoFix` can be added later if needed

**Files to change:** `src/orchestrator.ts` (1 line change), plus docs (README.md, README.zh-CN.md, BEST_PRACTICES.md)

**Design stored in shared memory as `design`.**