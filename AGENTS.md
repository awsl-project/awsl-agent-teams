# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the TypeScript source for the CLI and orchestration engine. Key modules include `cli.ts` (entry point), `orchestrator.ts`, `runner.ts`, `planning.ts`, `queue.ts`, and `agents.ts`. Built-in agent definitions live in `agents/`. Generated output goes to `dist/` and should not be edited by hand. Planning artifacts may appear under `.planning/`; treat them as runtime state, not source. Core docs are `README.md`, `INSTALL.md`, and `BEST_PRACTICES.md`.

## Build, Test, and Development Commands
Use Node.js with npm.

- `npm run dev` runs the CLI from source with `tsx` for local iteration.
- `npm run build` compiles `src/` to `dist/` with TypeScript declarations.
- `npm run check` runs `tsc --noEmit` for strict type validation.
- `npm run start -- --help` runs the built CLI from `dist/cli.js`.

Typical local loop: `npm run check` before changes, `npm run build` before opening a PR.

## Coding Style & Naming Conventions
This repository uses strict TypeScript and ES modules. Follow the existing style: 2-space indentation is not enforced here, so match surrounding files exactly; prefer descriptive camelCase for variables/functions and PascalCase only for types/classes. Keep modules small and purpose-driven, with one main responsibility per file. Use explicit exports and avoid introducing default exports into the `src/` tree unless the file already follows that pattern.

## Testing Guidelines
There is no dedicated `test/` directory or `npm test` script yet. The minimum verification standard is `npm run check` and a successful `npm run build`. If you add automated tests, place them in a clearly named location such as `src/__tests__/` or alongside the module being tested, and add an npm script in `package.json`.

## Commit & Pull Request Guidelines
Recent history uses short imperative commit subjects such as `Add crash recovery...` and `Clarify source-only install...`. Keep commits focused and use the same style: `Add queue retry guard`, `Refactor planner error handling`. PRs should include a concise summary, affected commands or files, verification performed, and screenshots or terminal transcripts when CLI behavior changes.

## Git Ignore Rules
Respect the root `.gitignore` before committing. Do not commit local dependencies, build output, or machine-specific secrets. The current ignore set covers `node_modules/`, `dist/`, `*.tsbuildinfo`, `.env`, and benchmark output such as `bench/` and `bench-*/`. If you introduce a new generated directory or local cache, add it to `.gitignore` in the same change.

## Configuration & Generated Files
Do not manually edit `dist/` outputs unless debugging generated code. When changing CLI initialization or install flows, verify the commands documented in `INSTALL.md` and `README.md` still match the implementation.
