# Execution Plan

## task_1: Create ProjectManager module
- **Assignee:** coder
- **Files:** src/projects.ts

### Action
Create src/projects.ts with the ProjectManager class implementing the global project registry at ~/.awsl/projects.json.

Data models:
- ProjectEntry: { name, path (unique key), addedAt, lastActiveAt?, tags?, engine? }
- ProjectRegistry: { projects: ProjectEntry[], updatedAt }
- ProjectStatus: { name, path, exists, hasPlanning, isLocked, queue: {pending,running,done,failed,total}, lastRun?: {date,status,goal,duration} }

ProjectManager static methods:
- registryPath(): returns path.join(os.homedir(), '.awsl', 'projects.json')
- load(): read registry file, return empty {projects:[],updatedAt} if missing, auto-create ~/.awsl/ dir
- save(registry): atomic write (write temp → rename) to registry path
- add(projectPath, name?, tags?): normalize to absolute path, idempotent (return existing if same path), default name = path.basename(projectPath), set addedAt = now
- remove(projectPath): remove by normalized path, return boolean
- list(): return all ProjectEntry[]
- get(projectPath): find by normalized path
- find(nameOrPath): fuzzy find - try exact path match first, then name match (case-insensitive)
- getStatus(entry): read .planning/QUEUE.json for queue counts, check .planning/.lock for isLocked, read history for lastRun, check fs.existsSync for exists/hasPlanning
- getAllStatuses(): map all entries through getStatus, catch errors per-project (fail-soft)
- touch(projectPath): update lastActiveAt to now and save
- scan(dir, depth=2): recursively find directories containing .planning/ or .git, return string[] of paths

Patterns to follow:
- Use readFileSync/writeFileSync (sync fs ops per convention)
- Use log from ./log.js for logging
- Normalize paths: path.resolve() + path.normalize()
- Atomic write: fs.writeFileSync to temp file, then fs.renameSync
- Export all types and the class

### Verify
npx tsc --noEmit

### Done
src/projects.ts exists with ProjectManager class, all methods implemented, types exported, compiles without errors

## task_2: Add CLI projects subcommand
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/cli.ts

### Action
Add the `projects` CLI subcommand and auto-registration hooks to src/cli.ts.

1. Import ProjectManager from ./projects.js

2. Add to usage() function help text:
```
  projects                    List all registered projects with status
  projects add [path] [--name N]  Register a project (default: cwd)
  projects remove <path|name>     Unregister a project
  projects scan [dir]             Auto-discover projects
```

3. Add command handler (similar pattern to existing `queue` subcommand):
- `projects` (no sub): call ProjectManager.getAllStatuses(), display as table with columns: Name, Path, Queue (pending/running/done/failed), Last Run, Status
- `projects add [path]`: path defaults to cwd, optional --name flag, call ProjectManager.add(), log success
- `projects remove <path|name>`: call ProjectManager.find() then ProjectManager.remove(), log success/not found
- `projects scan [dir]`: dir defaults to parent of cwd, call ProjectManager.scan(), display found paths, ask-like prompt or just list them

4. Add auto-registration hooks - in the existing handlers for these commands, add a call to ProjectManager.add(cwd) and ProjectManager.touch(cwd):
- `run` command handler
- `start` command handler  
- `queue start` command handler

Keep auto-register calls wrapped in try/catch (fail-soft, don't break main flow).

### Verify
npx tsc --noEmit

### Done
`awsl projects`, `awsl projects add`, `awsl projects remove`, `awsl projects scan` commands work. Auto-registration hooks added to run/start/queue start.

## task_3: Add dashboard project API endpoints
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/dashboard.ts

### Action
Add /api/projects/* endpoints to src/dashboard.ts.

1. Import ProjectManager from ./projects.js and TaskQueue from ./queue.js (already imported)

2. Add these endpoints BEFORE the 404 handler, AFTER the relay/client APIs:

GET /api/projects → ProjectManager.getAllStatuses() → JSON response

POST /api/projects/add → collectBody, parse {path, name?, tags?}, call ProjectManager.add(path, name, tags), return ProjectEntry. Validate path is provided and is a string.

POST /api/projects/remove → collectBody, parse {path}, call ProjectManager.remove(path), return {removed: boolean}

POST /api/projects/scan → collectBody, parse {dir, depth?}, call ProjectManager.scan(dir, depth), return string[]

GET /api/projects/queue?path=<path> → read QUEUE.json from that project's .planning/ dir, return queue data (same pattern as /api/queue but with custom path)

POST /api/projects/queue/add → collectBody, parse {path, goal, quick?, engine?, dependsOn?, runAt?}, validate path+goal, create TaskQueue(path), call queue.add(), return task

POST /api/projects/queue/start → collectBody, parse {path, engine?, once?}, spawn detached child process: use child_process.spawn with ['node', cliPath, 'queue', 'start', '--cwd', path] detached+unref. Import child_process. Return {started: true, pid}. The cliPath should be resolved relative to __dirname (e.g. path.join(__dirname, '..', 'dist', 'cli.js') or just use process.argv[1] pattern).

POST /api/projects/queue/clear → collectBody, parse {path}, new TaskQueue(path).clear(), return {cleared: true}

GET /api/projects/history?path=<path> → loadHistory(path), return history data

GET /api/projects/stats?path=<path> → loadHistory(path) + getHistoryStats(), return stats

3. Update the log.info line at server startup to mention /api/projects

Security: validate that path parameters are absolute paths (path.isAbsolute). Return 400 if not.

### Verify
npx tsc --noEmit

### Done
All /api/projects/* endpoints added, cross-project queue start spawns detached process, path validation implemented

## task_4: Add Projects UI to dashboard
- **Assignee:** coder
- **Dependencies:** task_3
- **Files:** public/dashboard.html

### Action
Add a Projects section to the dashboard HTML, following the same pixel art style and patterns as the existing Machines section.

1. Add a 'Projects' nav tab in the navigation bar (same style as existing tabs like Queue, Machines, Stats, Timeline)

2. Add a Projects section/page with:
- Header: 'Projects' with count badge + [Add Project] button + [Scan] button
- Project cards grid (same card style as Machine cards): each card shows:
  - Project name (bold)
  - Path (smaller, muted)
  - Status indicator: running (green pulse) / idle (gray) / error (red)
  - Queue summary: X pending, Y running, Z done, W failed
  - Last run info (date + status)
- Click a card → select it (highlight border)
- Selected project shows action buttons: [Add Task] [Start Queue] [Stop Queue] [View History] [Remove]

3. Add JavaScript functions:
- loadProjects(): fetch GET /api/projects, render cards
- addProject(): prompt for path (and optional name), POST /api/projects/add
- scanProjects(): prompt for directory, POST /api/projects/scan, show results, offer to add each
- removeProject(path): confirm, POST /api/projects/remove
- selectProject(path): highlight card, show action panel
- projectQueueAdd(path): prompt for goal, POST /api/projects/queue/add
- projectQueueStart(path): POST /api/projects/queue/start
- projectQueueClear(path): confirm, POST /api/projects/queue/clear
- loadProjectHistory(path): fetch GET /api/projects/history?path=, display in modal or inline
- Auto-refresh: poll loadProjects() every 5s when Projects tab is active

4. Style: match existing pixel art theme (dark background #0a0a1a, green #00ff41 accents, monospace font, pixel borders)

### Verify
npx tsc --noEmit && npm run build

### Done
Projects page visible in dashboard with card grid, all CRUD operations functional, auto-refresh working

## task_5: Update index.ts exports
- **Assignee:** coder
- **Dependencies:** task_1
- **Files:** src/index.ts

### Action
Add exports for the new projects module to src/index.ts.

Add this line with the other module exports:
```typescript
export { ProjectManager, type ProjectEntry, type ProjectRegistry, type ProjectStatus } from './projects.js';
```

Place it near the other infrastructure exports (after the Queue exports or near Relay/Remote exports).

### Verify
npx tsc --noEmit

### Done
ProjectManager, ProjectEntry, ProjectRegistry, ProjectStatus are exported from index.ts

## task_6: Test ProjectManager
- **Assignee:** tester
- **Dependencies:** task_1
- **Files:** test/projects.test.ts

### Action
Write tests for ProjectManager using node:test and node:assert/strict.

Test cases:
1. registryPath() returns ~/.awsl/projects.json
2. load() returns empty registry when file doesn't exist
3. add() creates entry with correct fields (name defaults to basename)
4. add() is idempotent (same path returns existing entry)
5. add() normalizes paths to absolute
6. remove() removes existing entry, returns true
7. remove() returns false for non-existent path
8. list() returns all entries
9. get() finds by exact path
10. find() finds by name (case-insensitive)
11. find() finds by path
12. getStatus() reads queue counts from .planning/QUEUE.json
13. getStatus() handles missing .planning/ gracefully
14. scan() finds directories with .planning/ or .git
15. touch() updates lastActiveAt

Use a temp directory for the registry file (override registryPath or use env var). Create temp project dirs with mock .planning/ data for status tests.

Pattern: use test() from node:test, assert from node:assert/strict, fs + os + path for setup/teardown.

### Verify
npx tsx --test test/projects.test.ts

### Done
All 15 test cases pass, covering CRUD, status reading, scan, and edge cases

## task_7: Update documentation
- **Assignee:** coder
- **Dependencies:** task_1, task_2, task_3, task_4
- **Files:** README.md, README.zh-CN.md, BEST_PRACTICES.md

### Action
Update all three documentation files to cover the new multi-project management feature.

README.md (English):
- Add 'Project Management' section describing the feature
- Document CLI commands: awsl projects, projects add, projects remove, projects scan
- Mention auto-registration behavior
- Mention dashboard Projects page
- Add to feature list

README.zh-CN.md (Chinese):
- Mirror all changes from README.md in Chinese
- 项目管理 section
- CLI 命令文档
- 自动注册行为
- Dashboard 项目页面

BEST_PRACTICES.md (Chinese):
- Add usage guidance for multi-project workflows
- Example: managing frontend + backend projects together
- Tips: using scan to discover projects, cross-project queue management
- Gotchas: projects must be on local filesystem for direct access, registry at ~/.awsl/projects.json

### Verify
cat README.md | head -5

### Done
All three docs updated with project management feature documentation
