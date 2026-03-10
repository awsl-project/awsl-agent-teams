## AWSL_RESULT

### Bug Diagnosis

**Root cause**: `dashboard.html:1184-1194` — the `render()` function uses only LOCAL `hist.entries` when no machine is selected. Remote machines' history (`clients[i].status.history`) is never aggregated into the default view. On a remote-only deployment, stats show **nothing**.

### Design: Client-Side History Aggregation

**Fix scope**: Single function (`render()`) in single file (`public/dashboard.html`)

**What changes**:
- When `selectedClient` is null (aggregate view): merge `hist.entries` + all `clients[i].status.history` with dedup by `id+startedAt`
- When a machine is selected: show only that machine's data (unchanged)
- Queue behavior: unchanged (local queue in aggregate, machine queue when selected)

**Why this approach**:
- All data is already available client-side — no backend changes needed
- Simplest possible fix (one function, ~15 lines added)
- Dedup prevents duplicates if dashboard machine also connects as remote client

### Files Produced
- `.planning/design-stats-machines.md` — Full design document with code diff