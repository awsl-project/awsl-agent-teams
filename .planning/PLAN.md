# Execution Plan

## task-1: Replace frontmatter parser with YAML + TypeBox schema
- **Role:** coder
- **Dependencies:** (none)
- **Files:** src/agents.ts, package.json
- **Action:** Replace the hand-rolled `parseFrontmatter()` in src/agents.ts with proper YAML parsing + TypeBox schema validation:

1. Run `npm install yaml` to add the yaml package
2. Import `parse as parseYaml` from `yaml` and `Type` from `@sinclair/typebox` and `Value` from `@sinclair/typebox/value`
3. Define a TypeBox schema `AgentFrontmatterSchema` for agent config:
   - `name`: Type.String()
   - `role`: Type.Optional(Type.String()) — defaults to "custom"
   - `description`: Type.Optional(Type.String()) — defaults to ""
   - `model`: Type.Optional(Type.String())
   - `tools`: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])) — supports both comma-separated string "read,write" and YAML array ["read", "write"]
   - `skills`: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])) — same
   - `thinking`: Type.Optional(Type.String())
4. Replace `parseFrontmatter()`:
   - Keep the `---\n...\n---` regex to extract the YAML block (same regex)
   - Parse the YAML block with `parseYaml()` instead of line-by-line splitting
   - Wrap in try/catch, on parse error import and use `log` from `./log.js` and log: `log.warn("agents", \`${filename}: YAML parse error — ${error.message}\`)`
   - Return `{ meta, body }` where meta is now `Record<string, unknown>`
5. Add a helper `normalizeStringArray(val: unknown): string[]` that accepts:
   - string → split by comma, trim, filter empty
   - string[] → return as-is
   - undefined → return []
6. Update `loadFromDir()`:
   - After YAML parsing, use `Value.Check(AgentFrontmatterSchema, meta)` to validate
   - If validation fails, use `Value.Errors(AgentFrontmatterSchema, meta)` to get errors, log each with `log.warn("agents", ...)` including the file name and path, then skip the agent
   - Use `normalizeStringArray()` for tools and skills
   - Convert thinking to string if it's a boolean or number (YAML `true` → `"true"`)
7. Keep the `TeamAgentDef` interface, `loadAgents()` signature, and `BUILTINS` array completely unchanged
8. Existing simple frontmatter (like agents/fullstack-coder.md and agents/security-reviewer.md) MUST still parse correctly — test mentally
- **Verify:** `npx tsc --noEmit`
- **Done:** YAML frontmatter with arrays, booleans, colons in values, and multiline strings parses correctly. Invalid configs show friendly error messages. Existing agent files still load.

## task-2: Refactor verify.ts to provider-based architecture
- **Role:** coder
- **Dependencies:** (none)
- **Files:** src/verify.ts
- **Action:** Refactor the verification system into a provider-based architecture. All changes in src/verify.ts only:

1. Define a `VerifyProvider` interface at the top of the file (after existing interfaces):
   ```typescript
   interface VerifyProvider {
     name: string;
     detect(cwd: string): boolean;
     execute(cwd: string): Promise<VerifyItem[]>;
     timeout: number;
   }
   ```

2. Create concrete provider classes (keep them in the same file):

   a. `TypeScriptProvider`: detect = tsconfig.json exists, execute = runs `npx tsc --noEmit`, timeout = 120_000
   b. `TestProvider`: detect = package.json has non-stub test script, execute = runs `npm test`, timeout = 180_000
   c. `ESLintProvider`: detect = any eslint config exists, execute = runs `npx eslint . --max-warnings 0`, timeout = 60_000
   d. `GitDiffProvider`: detect = always true, execute = runs `git diff --stat`, always passes, timeout = 5_000
   e. `CommandProvider`: constructed with (taskId, command, timeoutMs=60_000), detect = always true, execute = runs the command

3. Each provider's `execute()` method:
   - Use `execSync` wrapped in try/catch (same pattern as existing `runCheck`)
   - Use `this.timeout` for the execSync timeout option
   - Return `VerifyItem[]` with the provider's name as taskId for general checks

4. Add verify cache support:
   - Interface `VerifyCacheEntry { key: string; result: VerifyItem[]; timestamp: string }`
   - Interface `VerifyCache { [provider: string]: VerifyCacheEntry }`
   - Function `loadVerifyCache(cwd)`: read `.planning/.verify-cache.json`, return `VerifyCache` or empty object on error
   - Function `saveVerifyCache(cwd, cache)`: write cache, ignore errors
   - Function `computeCacheKey(cwd, globs: string[])`: find files matching patterns, get max mtime, return mtime string
   - Cache TTL: 5 minutes (300_000ms)
   - TypeScriptProvider cache key: max mtime of *.ts files
   - TestProvider cache key: max mtime of all source + test files
   - ESLintProvider cache key: max mtime of all *.ts/*.js files
   - If cache hit (key matches, age < 5 min), log `[cached] providerName` and return cached result
   - CommandProvider and GitDiffProvider do NOT use cache

5. Change `runFullVerification(cwd: string)` to `async`:
   - Signature becomes `export async function runFullVerification(cwd: string): Promise<VerifyResult>`
   - Task-specific commands: create `CommandProvider` for each, run sequentially with await
   - General checks: build provider array via `detect()`, run all with `Promise.allSettled()`, collect results
   - Rest of the function (summary, report writing) stays the same

6. Remove the old `runCheck()` and `runGeneralChecks()` functions — their logic moves into providers

7. Keep `extractVerifyCommands()`, `formatReport()`, `formatReviewReport()`, all Review interfaces, `runStaticReview()`, and `findSourceFiles()` completely unchanged
- **Verify:** `npx tsc --noEmit`
- **Done:** Providers run in parallel for general checks. Each has own timeout. Cache works. All existing verify outputs preserved.

## task-3: Update callers for async verify
- **Role:** coder
- **Dependencies:** task-2
- **Files:** src/orchestrator.ts, src/cli.ts
- **Action:** Since `runFullVerification` now returns `Promise<VerifyResult>`, update all call sites:

1. In `src/cli.ts`: search for `runFullVerification(`, add `await` before it. The calling function should already be async (it's the `main()` function)
2. In `src/orchestrator.ts`: search for `runFullVerification(`, add `await` before it. The calling function (`executeTeam`) is already async
3. Do NOT change any other logic in either file — ONLY add `await` where `runFullVerification` is called
4. Also check src/index.ts exports — `VerifyResult` type should still export fine since the interface didn't change
- **Verify:** `npx tsc --noEmit`
- **Done:** All callers correctly await the async verify function. Type check passes.

## task-4: Update documentation
- **Role:** coder
- **Dependencies:** task-1, task-2
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md
- **Action:** Update all three documentation files:

1. **README.md** (English):
   - In "Custom Agents" section (around the frontmatter fields table): update tools/skills field descriptions to note they accept both comma-separated strings and YAML arrays. Add a small example showing array syntax:
     ```yaml
     tools:
       - read
       - write
       - bash
     ```
   - Add a note: "Invalid frontmatter is reported with friendly error messages (file name + specific validation error) and the agent is skipped."
   - In the "Self-Healing Features" table or nearby: add a row about verify providers running in parallel with per-provider timeouts and caching

2. **README.zh-CN.md** (Chinese): mirror all README.md changes in Chinese

3. **BEST_PRACTICES.md** (Chinese):
   - In section 5 (自定义 Agent 团队): add example of YAML array syntax for tools/skills, mention schema validation and friendly error messages
   - Add verify caching tip: "重复运行 `awsl verify` 时，未变更的检查会使用缓存（5 分钟有效），跳过不必要的重新执行"
   - Mention provider timeouts: TypeScript 120s, tests 180s, ESLint 60s
- **Verify:** `npx tsc --noEmit`
- **Done:** All three docs updated with YAML array syntax, schema validation, and provider-based verify info.

## task-5: Review all changes
- **Role:** reviewer
- **Dependencies:** task-1, task-2, task-3, task-4
- **Files:** src/agents.ts, src/verify.ts, src/orchestrator.ts, src/cli.ts
- **Action:** Review all changed source files for:
1. **Backward compatibility**: existing agent .md files (agents/fullstack-coder.md, agents/security-reviewer.md) still load correctly. Existing PLAN.md verify commands still work. Public API exports unchanged.
2. **Error handling**: YAML parse errors caught with friendly messages. Provider timeouts work. Cache read/write failures don't break verification.
3. **Type safety**: no `any` type leaks. TypeBox schema matches what loadFromDir expects.
4. **Security**: no command injection in verify providers. Cache file path is hardcoded to .planning/.
5. **Code quality**: no dead code left behind. Consistent style (log usage, error patterns) with rest of codebase.
- **Verify:** `npx tsc --noEmit`
- **Done:** All changes reviewed, no critical issues found.
