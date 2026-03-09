# task_5: Add sandbox documentation to all three docs:

**README.md** 

Assignee: coder
Status: done

## Result
Type-check passes clean (no output = no errors).

## AWSL_RESULT

**Modified files:**

1. **README.md** — Added `## Sandbox (Builtin Engine)` section (lines 477-502) between Guardian and Built-in Agents. Includes: `ExecuteOptions.sandbox` config table, role defaults table with patterns, allowlist/denylist explanation, Windows compatibility note, per-agent override mention.

2. **README.zh-CN.md** — Added matching `## 沙箱（内置引擎）` section (lines 477-502) in Chinese. Same structure and content mirrored.

3. **BEST_PRACTICES.md** — Added `## 9. 沙箱配置（内置引擎）` section with:
   - Sandbox on/off/custom code example
   - Role defaults table with Chinese explanations
   - Per-agent custom `SandboxPolicy` TypeScript example
   - How to disable sandbox
   - How allowlist/denylist/write-path checking works
   - Caveats table (builtin-only, not perfect isolation, default-on, extensible)
   - Renumbered sections 10-18 (was 9-17)

**Verification:** `npx tsc --noEmit` — passes with no errors