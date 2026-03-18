# PLAN — Codex 引擎兼容优化

> Goal: 优化 Codex CLI 作为 wave 执行引擎的体验，对齐 claude-code 引擎的功能集

## task_1: codex-auto-detection
- **Role:** coder
- **Dependencies:** (none)
- **Files:** `src/runner.ts`
- **Action:** 在 `detectEngine()` 中加入 Codex CLI 自动检测。添加 `isCodexAvailable()` 函数，检查 `codex --version` 是否可用（5s 超时，捕获错误）。缓存结果到 `_codexAvailable`。修改 `detectEngine()` 优先级为: claude-code > codex > builtin。同时在 Windows 上尝试通过 `resolveCodexCliJs()` 路径检测。
- **Verify:** `npx tsc --noEmit`
- **Done:** `detectEngine()` 能自动发现已安装的 Codex CLI 并返回 `"codex"` 引擎

## task_2: codex-env-override
- **Role:** coder
- **Dependencies:** (none)
- **Files:** `src/runner.ts`
- **Action:** 在 `runWithCodex()` 中支持 per-agent 的 API key 和 base URL 覆盖。参考 claude-code 引擎的 `cleanEnv` 模式：创建 env 副本，用 `resolveEnvValue()` 解析 `agentDef.apiKey`（映射到 `CODEX_API_KEY` 或 `OPENAI_API_KEY`）和 `agentDef.baseUrl`（映射到 `OPENAI_BASE_URL`）。将 `spawn()` 的 env 从 `process.env` 改为 cleanEnv。
- **Verify:** `npx tsc --noEmit`
- **Done:** Codex agent 可通过 frontmatter 配置独立的 API key 和 base URL

## task_3: codex-sandbox-mapping
- **Role:** coder
- **Dependencies:** (none)
- **Files:** `src/runner.ts`
- **Action:** 将 agent 的角色和 sandbox 配置映射到 Codex `--sandbox` 参数。当前硬编码 `workspace-write`，改为动态选择：reviewer/tester → `read-only`；coder/architect → `workspace-write`。新增 `runWithCodex` 参数接收 sandbox 配置。在 `runAgent()` 中将 sandbox 传递给 codex 引擎。同时去掉 `--full-auto` 改为显式的 `--sandbox <mode>`。
- **Verify:** `npx tsc --noEmit`
- **Done:** Codex sandbox 模式根据 agent 角色动态选择

## task_4: codex-result-parsing
- **Role:** coder
- **Dependencies:** (none)
- **Files:** `src/runner.ts`
- **Action:** 增强 Codex 结果解析。在 `child.on("close")` 的 result 提取逻辑后，从 result 内容中查找 `## AWSL_RESULT` section。如果找到，提取该 section 之后到下一个 `## ` 标题或文本末尾的内容作为 clean result。提取到的内容会替换原始 result。如果没找到 AWSL_RESULT section，保留原始 last-message.txt 内容。
- **Verify:** `npx tsc --noEmit`
- **Done:** Codex 引擎能从输出中提取结构化的 AWSL_RESULT

## task_5: codex-progress-events
- **Role:** coder
- **Dependencies:** task_4
- **Files:** `src/runner.ts`
- **Action:** 增强 JSONL 事件解析，从 Codex 的事件流中提取更丰富的进度信息。在 `parseJsonEvent` 中添加对以下事件类型的处理：`item.file_edit`（文件名 + 操作类型）、`item.command_execution`（命令内容）、`item.agent_message`（助手消息摘要）。为 logStream 条目添加 `eventType` 元数据字段，便于 dashboard 展示不同类型的进度条目。
- **Verify:** `npx tsc --noEmit`
- **Done:** logStream 包含 Codex agent 的文件编辑、命令执行等细粒度进度

## task_6: codex-session-resume
- **Role:** coder
- **Dependencies:** task_4
- **Files:** `src/runner.ts`
- **Action:** 利用 Codex `resume` 能力增强 checkpoint 恢复。在 `runWithCodex()` 开头检查 shared memory 中是否有 `result:{agentName}:session` 的 session ID。如果有，尝试用 `codex exec resume <sessionId>` 模式启动（不加 `--ephemeral`）。如果 resume 失败（非零退出且 stderr 含 "session not found" 或类似错误），fallback 到普通的 ephemeral 执行。新增可选参数 `resumeSessionId?: string`。
- **Verify:** `npx tsc --noEmit`
- **Done:** Codex 引擎支持通过 session ID 恢复中断的任务

## task_7: docs-update
- **Role:** coder
- **Dependencies:** task_1, task_2, task_3, task_4, task_5, task_6
- **Files:** `README.md`, `README.zh-CN.md`, `BEST_PRACTICES.md`
- **Action:** 更新三份文档，添加 Codex 引擎完整使用指南：(1) 安装要求 `npm i -g @openai/codex`、`CODEX_API_KEY` 设置；(2) `--engine codex` 用法和自动检测；(3) agent frontmatter 中 `apiKey: env:CODEX_API_KEY` / `baseUrl` 配置示例；(4) sandbox 模式映射表；(5) session resume 行为说明；(6) 与 claude-code 引擎的功能对比表；(7) BEST_PRACTICES.md 中的 Codex 最佳实践和常见问题。
- **Verify:** 文件存在且包含 codex 相关内容
- **Done:** README.md、README.zh-CN.md、BEST_PRACTICES.md 都包含 Codex 引擎完整指南
