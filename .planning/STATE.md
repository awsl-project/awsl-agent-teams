# Project State

## Decisions
- Rate limit detection uses pattern matching on stderr+stdout (9 patterns)
- Exponential backoff: 1min → 2min → 5min → 10min → 15min cap
- Checkpoint persisted to .planning/CHECKPOINT.json (human-readable)
- Queue persisted to .planning/QUEUE.json (human-readable)
- Queue executes tasks sequentially, each with full rate limit recovery
- dependsOn: ["all"] means wait for all prior tasks
- LogStream is singleton EventEmitter with 500-line ring buffer
- SSE endpoint /api/logs for real-time log streaming
- Queue mutations via REST API (POST add, DELETE remove, POST clear)
- Browser notifications via Notification API with state diff detection

## Blockers
(none)

## Position
- Completed: Rate limit detection, checkpoint save/load, orchestrator retry logic, task queue, CLI queue commands, API exports, dashboard (history + stats + heatmap + timeline + queue), history tracking, queue plan (NL parsing), queue correctness fixes (ID/deadlock/lock), **live log stream, browser notifications, duration trend chart, queue operations panel**
- Status: SUCCESS — all features implemented
