# Execution Plan

## task_1: Guard Phase 3b with verifyEnabled
- **Assignee:** coder
- **Files:** src/orchestrator.ts

### Action
In src/orchestrator.ts, wrap the Phase 3b auto-fix loop block (lines 699-739) with `if (verifyEnabled)`. Specifically:

1. Find the comment `// ── Phase 3b: Auto-Fix Loop ──────────────────────────────` at line 699
2. The block starts at line 700 `{` and ends at line 739 `}`
3. Wrap the entire block (lines 700-739) inside `if (verifyEnabled) {` ... `}`
4. The `verifyEnabled` variable is already defined earlier in the function (used at line 654), so it's in scope

Result should look like:
```
// ── Phase 3b: Auto-Fix Loop ──────────────────────────────
if (verifyEnabled) {
  let fixAttempt = 0;
  ...(existing code unchanged)...
}
```

This ensures that when verify=false, Phase 3 (reviewer), Phase 3b (provider verify via runFullVerification), and auto-fix coder loop are ALL skipped. Task auto-retry (lines 741+) remains unaffected.

### Verify
npx tsc --noEmit && npm run build

### Done
Phase 3b block is guarded by verifyEnabled; TypeScript compiles without errors

## task_2: Update documentation for verify switch
- **Assignee:** coder
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files to reflect that --no-verify now skips ALL verification:

1. **README.md**: Find the section that documents --no-verify or the verify option. Update it to state: 'When verify is disabled (--no-verify), ALL verification is skipped: the reviewer agent, provider verification (tsc, npm test, eslint), and the auto-fix loop. Task auto-retry still runs since it handles execution failures, not verification.'

2. **README.zh-CN.md**: Mirror the same change in Chinese: '当禁用验证时 (--no-verify)，所有验证步骤都会跳过：reviewer agent、代码验证 (tsc、npm test、eslint) 和自动修复循环。任务自动重试仍然运行，因为它处理的是执行失败而非验证。'

3. **BEST_PRACTICES.md**: In the relevant section about verification or pipeline configuration, add a note explaining the verify master switch behavior and when to use --no-verify (e.g., for quick iterations, trusted code, or when external CI handles verification).

### Verify
Check that all three files mention --no-verify skipping provider verify and auto-fix

### Done
All three doc files updated with accurate description of verify as master switch

## task_3: Verify build and behavior
- **Assignee:** tester
- **Dependencies:** task_1
- **Files:** src/orchestrator.ts

### Action
1. Run `npx tsc --noEmit` to confirm no type errors
2. Run `npm run build` to confirm the project builds
3. Read src/orchestrator.ts and verify:
   a. Phase 3 (reviewer agent, ~line 654) is still guarded by `if (verifyEnabled ...)`
   b. Phase 3b (auto-fix loop, ~line 699-739) is NOW guarded by `if (verifyEnabled)`
   c. Task auto-retry (~line 741+) is NOT guarded by verifyEnabled (should remain independent)
   d. The verifyEnabled variable is correctly referenced (same variable used in Phase 3)
4. Run `npm test` if tests exist
5. Confirm the indentation and code style matches the project conventions (tabs, no semicolons)

### Verify
npx tsc --noEmit && npm run build

### Done
Build passes, Phase 3b is correctly guarded, auto-retry is unaffected, code style is consistent
