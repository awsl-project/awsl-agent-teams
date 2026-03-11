## AWSL_RESULT

### Design: Dashboard Date Filter & Statistics

**Problem:** Dashboard shows all-time stats only. User wants to view stats by day, month, or custom range.

**Solution:** Client-side date filtering in `public/dashboard.html` (~120 lines). No backend changes.

#### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Client-side only | Data volume is tiny. Entries already fully loaded. Zero backend risk. |
| Filter before `stats()` | All widgets (stats cards, heatmap, trend, agents, timeline) respect the filter. |
| Pill-style button bar | Clean, compact. Modes: All / Today / 7 Days / 30 Days / Month / Custom. |
| Composes with project filter | Date filter at `render()` level, project filter inside `renderTimeline()`. |
| No localStorage persistence | Filter resets on reload — simple, avoids stale state. |

#### Filter Modes

- **All** (default) — no filter, current behavior
- **Today** — entries from today only
- **7 Days** — last 7 days
- **30 Days** — last 30 days
- **Month** — pick a specific month via `<input type="month">`
- **Custom** — date range with from/to `<input type="date">`

#### Architecture

1. New global: `var dateFilter = { mode: 'all' }`
2. New function: `filterByDate(entries, df)` — filters by mode using existing `localDate()`
3. Integration: In `render()`, apply `filterByDate()` before `stats()` call
4. Dirty-check key updated to include filter state
5. UI: Filter bar between header and stats cards with pill buttons + conditional inputs

#### Files

| File | Scope |
|------|-------|
| `public/dashboard.html` | CSS (~25 lines) + HTML (~15 lines) + JS (~80 lines) |

**No backend changes.** No TypeScript file modifications needed.

#### Design Documents

- `.planning/design.md` — Full design with code samples
- `.planning/shared-memory.json` — Machine-readable design for coder/tester agents