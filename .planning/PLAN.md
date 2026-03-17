# Execution Plan

## task-1: Add durationMs + new providers to verify.ts
- **Role:** coder
- **Dependencies:** (none)
- **Files:** src/verify.ts
- **Action:**

Make the following changes to `src/verify.ts`:

### 1. Add `durationMs` to VerifyItem interface
```typescript
export interface VerifyItem {
	taskId: string;
	command: string;
	passed: boolean;
	output: string;
	durationMs: number;  // NEW
}
```

### 2. Modify `runCommand` to track timing
Wrap the execSync call with `Date.now()` before/after to compute durationMs. Return it in the VerifyItem.

### 3. Add BuildProvider
Detects build capability and runs the appropriate build command:
- Node.js: check `package.json` for `scripts.build`, run `npm run build`
- Rust: check for `Cargo.toml`, run `cargo build`
- Go: check for `go.mod`, run `go build ./...`
- Python: check for `setup.py` or `pyproject.toml` with `[build-system]`, run `python -m build` or `python setup.py build`

Priority: check in order, use first match. Timeout: 180_000.

### 4. Add PrettierProvider
Detect prettier config files: `.prettierrc`, `.prettierrc.js`, `.prettierrc.json`, `.prettierrc.yml`, `prettier.config.js`, `prettier.config.mjs`, `prettier.config.cjs`.
Run: `npx prettier --check .`
Timeout: 60_000.

### 5. Add AuditProvider
Detect: `package-lock.json` exists (npm audit requires it).
Run: `npm audit --audit-level=moderate`
Timeout: 30_000.

### 6. Add Python providers
**PythonTestProvider:**
- Detect: `pytest.ini`, `setup.cfg` with `[tool:pytest]`, `pyproject.toml`, or any `test_*.py` / `*_test.py` files
- Run: `python -m pytest`
- Timeout: 180_000

**MypyProvider:**
- Detect: `mypy.ini`, `.mypy.ini`, `setup.cfg`, or `pyproject.toml`
- Run: `python -m mypy .`
- Timeout: 120_000

**RuffProvider:**
- Detect: `ruff.toml` or `pyproject.toml`
- Run: `ruff check .`
- Timeout: 60_000

### 7. Add Go providers
**GoVetProvider:**
- Detect: `go.mod` exists
- Run: `go vet ./...`
- Timeout: 60_000

**GoTestProvider:**
- Detect: `go.mod` exists
- Run: `go test ./...`
- Timeout: 180_000

### 8. Add Rust providers
**CargoClippyProvider:**
- Detect: `Cargo.toml` exists
- Run: `cargo clippy -- -D warnings`
- Timeout: 120_000

**CargoTestProvider:**
- Detect: `Cargo.toml` exists
- Run: `cargo test`
- Timeout: 180_000

### 9. Add CustomProvider config support
Read custom verify commands from `.planning/verify.json` or `.awsl.json` in project root.

Format for `.planning/verify.json`:
```json
{
  "providers": [
    { "name": "integration-test", "command": "npm run test:integration", "timeout": 300000 }
  ]
}
```

Format for `.awsl.json` (look for `verify.providers` key):
```json
{
  "verify": {
    "providers": [
      { "name": "e2e", "command": "npx playwright test", "timeout": 300000 }
    ]
  }
}
```

Add a function `loadCustomProviders(cwd: string): VerifyProvider[]` that reads these files, creates CommandProvider instances, and returns them.

### 10. Update GENERAL_PROVIDERS
Add all new providers to the GENERAL_PROVIDERS array:
```
TypeScriptProvider, BuildProvider, TestProvider, ESLintProvider, PrettierProvider, AuditProvider,
PythonTestProvider, MypyProvider, RuffProvider,
GoVetProvider, GoTestProvider,
CargoClippyProvider, CargoTestProvider,
GitDiffProvider,
```

In `runFullVerification`, after getting active general providers, also load custom providers and add them.

### 11. Fix all existing VerifyItem references
All places that create VerifyItem objects must include `durationMs`. GitDiffProvider should track timing. The error fallback in runFullVerification should use `durationMs: 0`.

### Important constraints:
- Keep the existing `VerifyProvider` interface unchanged
- Keep existing cache logic for TypeScript/Test/ESLint providers
- New providers do NOT need caching
- Use the existing `runCommand` helper (now with durationMs)
- For multi-language detect: use `fs.existsSync` for config files

- **Verify:** `npx tsc --noEmit`
- **Done:** All new providers added, durationMs tracked, custom config supported, TypeScript compiles

## task-2: Enhanced static review + better report format
- **Role:** coder
- **Dependencies:** task-1
- **Files:** src/verify.ts
- **Action:**

After task-1 has been completed, make the following additional changes to `src/verify.ts`:

### 1. Enhanced static review rules in `runStaticReview`

Add these new rules to the file scanning loop:

**Unused imports detection:**
- Parse import lines (both `import { X, Y } from` and `import X from` styles)
- For each imported name, check if it appears elsewhere in the file content (not in the import line itself)
- If not found, report as warning with rule `unused-import`
- Skip `import type` lines and side-effect imports (`import "foo"`)

**Function too long (>50 lines):**
- Track function boundaries by counting brace depth
- Match function start patterns: `function name(`, `name(` as method, `const name = (` arrow
- Count lines from opening `{` to closing `}`
- If body exceeds 50 lines, report as warning with rule `function-too-long`

**Nesting too deep (>4 levels):**
- Track `{` nesting depth line by line within functions
- When depth exceeds 4, report as warning with rule `nesting-too-deep`
- Only count code lines (skip comments and blanks)

**Duplicate code blocks:**
- Normalize lines (trim whitespace), find sequences of 6+ identical consecutive lines appearing 2+ times in the same file
- Report as info with rule `duplicate-code`

### 2. Better report format for `formatReport`

Update to include:

**Header:**
```markdown
# Verification Report

**Summary:** 8/10 passed (80.0% pass rate)
**Total time:** 12.3s
**Generated:** 2026-03-17T10:30:00Z
```

**Per-item with timing:**
```markdown
### [PASS] typecheck: `npx tsc --noEmit` (2.1s)
### [FAIL] test: `npm test` (5.3s)
```

**Stage summaries:**
```markdown
> Task checks: 3/4 passed (75.0%) in 4.2s
> General checks: 5/6 passed (83.3%) in 8.1s
```

### 3. Update `formatReviewReport` to show pass/fail status prominently

### 4. Update `runFullVerification` summary
Track total time with `Date.now()`. Change summary format:
```
Verification: 8/10 passed (80.0%) in 12.3s
```

- **Verify:** `npx tsc --noEmit`
- **Done:** Static review has 4 new rules, reports show timing and pass rate

## task-3: Update README.md
- **Role:** coder
- **Dependencies:** task-1, task-2
- **Files:** README.md
- **Action:**

Update README.md to document the enhanced verification system:

1. **Self-healing row** in feature table: mention multi-language verification
2. **Phase 3 description**: expand to show all provider types
3. **Quality Gates section**: add rows for multi-language verification, custom providers, timed reports
4. **CLI commands**: update verify command description
5. **Any verification-related sections**: update provider list

- **Verify:** grep -c "multi-language\|verify.json\|custom.*provider" README.md
- **Done:** README.md documents all new verification features

## task-4: Update README.zh-CN.md
- **Role:** coder
- **Dependencies:** task-1, task-2
- **Files:** README.zh-CN.md
- **Action:**

Mirror README.md verification changes into Chinese version:

1. **自愈能力行**: 提及多语言验证
2. **阶段 3 描述**: 展示所有 provider 类型
3. **质量门禁章节**: 添加多语言验证、自定义 provider、带计时报告
4. **CLI 命令**: 更新 verify 命令描述
5. **验证器 provider 章节**: 更新列表

- **Verify:** grep -c "多语言\|verify.json\|自定义.*provider" README.zh-CN.md
- **Done:** README.zh-CN.md mirrors all English changes

## task-5: Update BEST_PRACTICES.md
- **Role:** coder
- **Dependencies:** task-1, task-2
- **Files:** BEST_PRACTICES.md
- **Action:**

Update BEST_PRACTICES.md with detailed verification guidance:

1. **Verify command section** (~line 242): list all providers by language
2. **New subsection**: custom verify providers with `.planning/verify.json` and `.awsl.json` examples
3. **Timeout/cache table**: add all new providers' timeouts
4. **Verify 字段怎么写**: add multi-language examples
5. **使用场景 table**: update verify row with full provider list

- **Verify:** grep -c "verify.json\|多语言\|Playwright" BEST_PRACTICES.md
- **Done:** BEST_PRACTICES.md has comprehensive verification guidance

## task-6: Build and type-check
- **Role:** tester
- **Dependencies:** task-1, task-2, task-3, task-4, task-5
- **Files:** src/verify.ts
- **Action:**
1. `npx tsc --noEmit` — must pass with zero errors
2. `npm run build` — must produce dist/ successfully
If there are type errors, fix them in src/verify.ts.
- **Verify:** `npx tsc --noEmit`
- **Done:** Project builds with zero TypeScript errors
