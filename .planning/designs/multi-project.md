# Design: Multi-Project Management

## Problem Statement

AWSL is currently project-scoped — all state lives in `<cwd>/.planning/`. The dashboard binds to ONE project directory. Users cannot see or manage multiple projects from a single dashboard. The queue executes tasks only within the current project.

**User wants:** A "Projects" page (like the existing "Machines" page) to manage multiple projects from one dashboard, with each project's queue running independently.

## Brainstorming Summary

### What the user is trying to achieve
- Centralized visibility: see all projects and their status from one dashboard
- Cross-project queue management: add/start/monitor tasks on any project
- Parallel execution: multiple projects can run their queues simultaneously (each on its own machine or in separate processes)

### Constraints
- File-based state (`<project>/.planning/`) must be preserved
- Windows platform, TypeScript strict
- Dashboard is a single-page vanilla JS app (no framework)
- Must update docs (README.md, README.zh-CN.md, BEST_PRACTICES.md)

### 3 Approaches Evaluated

| Approach | Description | Verdict |
|----------|------------|---------|
| A: Central Registry | `~/.awsl/projects.json` lists all projects, dashboard reads their `.planning/` dirs | **Selected** — simple, preserves file-as-state |
| B: Relay-Extended | Each project runs its own RemoteClient to the dashboard | Over-engineered, conflates projects & machines |
| C: Multi-Dashboard | Each project has its own dashboard, a meta-dashboard aggregates | Too complex, requires multi-port management |

### Key Lock-in Decisions
1. **Registry location:** `~/.awsl/projects.json` (global, user-level)
2. **Project identity:** by `path` (unique key), with optional `name`
3. **Cross-project access:** direct filesystem read for local projects, relay for remote

---

## Architecture

### New Module: `src/projects.ts`

Central project registry management.

```typescript
// ─── Data Model ──────────────────────────────────────────────

export interface ProjectEntry {
  name: string;           // Human-readable (defaults to path.basename)
  path: string;           // Absolute path to project root (unique key)
  addedAt: string;        // ISO timestamp
  lastActiveAt?: string;  // Updated when queue runs or dashboard opens
  tags?: string[];        // Optional categorization
  engine?: Engine;        // Default engine for this project
}

export interface ProjectRegistry {
  projects: ProjectEntry[];
  updatedAt: string;
}

export interface ProjectStatus {
  name: string;
  path: string;
  exists: boolean;        // Does the directory still exist?
  hasPlanning: boolean;   // Does .planning/ exist?
  isLocked: boolean;      // Is .planning/.lock held?
  queue: {
    pending: number;
    running: number;
    done: number;
    failed: number;
    total: number;
  };
  lastRun?: {
    date: string;
    status: "done" | "failed";
    goal: string;
    duration: number;
  };
}

// ─── API ─────────────────────────────────────────────────────

export class ProjectManager {
  // Registry is at ~/.awsl/projects.json
  static registryPath(): string;

  // CRUD
  static load(): ProjectRegistry;
  static save(registry: ProjectRegistry): void;
  static add(projectPath: string, name?: string, tags?: string[]): ProjectEntry;
  static remove(projectPath: string): boolean;
  static list(): ProjectEntry[];
  static get(projectPath: string): ProjectEntry | undefined;
  static find(nameOrPath: string): ProjectEntry | undefined; // fuzzy find by name or path

  // Derived
  static getStatus(entry: ProjectEntry): ProjectStatus;      // read .planning/ from filesystem
  static getAllStatuses(): ProjectStatus[];                    // all projects with live status
  static touch(projectPath: string): void;                    // update lastActiveAt

  // Auto-discover
  static scan(dir: string, depth?: number): string[];         // find dirs with .planning/ or .git
}
```

### Dashboard API Additions (`src/dashboard.ts`)

New endpoints prefixed `/api/projects`:

```
GET  /api/projects                    → ProjectStatus[] (all registered projects with live status)
POST /api/projects/add                → { path, name?, tags? } → ProjectEntry
POST /api/projects/remove             → { path } → { removed: boolean }
POST /api/projects/scan               → { dir, depth? } → string[] (discovered project paths)

GET  /api/projects/queue?path=<path>  → QueueData for that project
POST /api/projects/queue/add          → { path, goal, ...opts } → QueueTask
POST /api/projects/queue/start        → { path, engine?, once? } → { started: boolean }
POST /api/projects/queue/clear        → { path } → { cleared: boolean }

GET  /api/projects/history?path=<path> → HistoryData for that project
GET  /api/projects/stats?path=<path>   → HistoryStats for that project
```

**Cross-project queue start** implementation:
- For **local projects**: spawn a detached child process `awsl queue start --cwd <path>`
- For **remote projects** (on a connected machine): route via relay

### Dashboard UI: Projects Page (`public/dashboard.html`)

New section between Stats and Timeline (similar styling to Machines):

```
┌─────────────────────────────────────────────────────┐
│ 📂 Projects  [3 registered]          [+ Add] [Scan] │
├─────────────────────────────────────────────────────┤
│ ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│ │ my-api   │  │ frontend │  │ ml-pipe  │           │
│ │ ●running │  │ ○idle    │  │ ○idle    │           │
│ │ 3 tasks  │  │ 0 tasks  │  │ 5 tasks  │           │
│ │ 12 done  │  │ 3 done   │  │ 0 done   │           │
│ └──────────┘  └──────────┘  └──────────┘           │
├─────────────────────────────────────────────────────┤
│ Selected: my-api (/home/user/my-api)                │
│ [Add Task] [Start Queue] [View History] [← Back]    │
└─────────────────────────────────────────────────────┘
```

**Interaction model** (identical pattern to Machines):
1. Click a project card → `selectProject(path)`
2. Dashboard switches context: history, queue, stats all load from that project's API
3. Action buttons operate on the selected project
4. "Back to Local" returns to the dashboard's own project

### CLI Commands (`src/cli.ts`)

```
awsl projects                     List all registered projects with status
awsl projects add [path] [--name] Register a project (default: cwd)
awsl projects remove <path|name>  Unregister a project
awsl projects scan [dir]          Auto-discover projects with .planning/ or .git
```

### Auto-Registration

When `awsl start`, `awsl run`, or `awsl queue start` is called:
- Auto-register the current project in the global registry
- Update `lastActiveAt`

This ensures the registry stays current without manual maintenance.

---

## Data Flow

### Local Project Management
```
Dashboard → GET /api/projects
  → ProjectManager.getAllStatuses()
    → For each project:
      → Read <project>/.planning/QUEUE.json (queue stats)
      → Read <project>/.planning/HISTORY.json (last run)
      → Check <project>/.planning/.lock (locked?)
    → Return ProjectStatus[]
```

### Cross-Project Queue Add
```
Dashboard → POST /api/projects/queue/add { path: "/home/user/my-api", goal: "..." }
  → new TaskQueue(path).add(goal, options)
  → Return QueueTask
```

### Cross-Project Queue Start
```
Dashboard → POST /api/projects/queue/start { path: "/home/user/my-api" }
  → spawn("awsl", ["queue", "start", "--cwd", path], { detached: true })
  → Return { started: true, pid }
```

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/projects.ts` | ProjectManager class + data model |

### Modified Files
| File | Changes |
|------|---------|
| `src/dashboard.ts` | Add `/api/projects/*` endpoints |
| `src/cli.ts` | Add `projects` subcommand + auto-register hooks + update usage() |
| `src/index.ts` | Export ProjectManager, ProjectEntry, ProjectRegistry, ProjectStatus |
| `public/dashboard.html` | Add Projects section UI + JS functions |
| `README.md` | Document project management feature |
| `README.zh-CN.md` | Chinese mirror |
| `BEST_PRACTICES.md` | Usage guidance |

### Unchanged Files (already project-path-agnostic)
- `src/queue.ts` — Already takes `cwd` as constructor arg
- `src/history.ts` — Already takes `cwd` parameter
- `src/relay.ts` — No changes needed
- `src/remote.ts` — No changes needed

---

## Implementation Plan (Waves)

### Wave 1 (No dependencies — parallel)
- **task_1** (coder): Create `src/projects.ts` — ProjectManager with registry CRUD, status reading, auto-discover, scan
- **task_2** (coder): Add `projects` CLI subcommand to `src/cli.ts` + auto-register in `run`/`start`/`queue start` + update usage()

### Wave 2 (Depends on task_1)
- **task_3** (coder): Add `/api/projects/*` endpoints to `src/dashboard.ts`
- **task_4** (coder): Add Projects section to `public/dashboard.html` — card grid, selectProject, cross-project queue/history loading

### Wave 3 (Depends on task_1)
- **task_5** (coder): Update `src/index.ts` exports for ProjectManager types

### Wave 4 (Depends on all code tasks)
- **task_6** (tester): Write tests for ProjectManager (CRUD, status, scan, edge cases)
- **task_7** (coder): Update documentation (README.md, README.zh-CN.md, BEST_PRACTICES.md)

---

## Edge Cases & Error Handling

1. **Project directory deleted**: `ProjectStatus.exists = false`, UI shows warning badge
2. **No `.planning/` dir**: `ProjectStatus.hasPlanning = false`, queue stats show 0
3. **Permission denied**: catch and return partial status with error field
4. **Registry file missing**: auto-create with empty projects array on first load
5. **Duplicate path**: `add()` is idempotent — returns existing entry
6. **Concurrent registry writes**: atomic write pattern (write temp → rename)
7. **Path normalization**: resolve to absolute, normalize separators

## Security Considerations

1. **Path traversal**: validate project paths are absolute, reject `..` components
2. **Registry permissions**: user-only access
3. **Cross-project scope**: only read `.planning/` subdirectory files
4. **Queue start isolation**: spawned processes inherit current user permissions
5. **Input validation**: sanitize project names and paths in API endpoints
