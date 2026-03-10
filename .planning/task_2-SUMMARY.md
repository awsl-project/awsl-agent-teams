# task_2: Dashboard: localhost bind + CORS + body limit

Assignee: coder
Status: done

## Result
All changes implemented and type-checked. Here's the summary:

## AWSL_RESULT

### Changes Made

**File: `src/dashboard.ts`**
- **Localhost bind**: Changed default bind address from `0.0.0.0` to `127.0.0.1`. Added `host` parameter to `startDashboard()` so users can override with `--host 0.0.0.0` when remote access is needed.
- **CORS restriction**: Replaced permissive origin reflection (`origin ?? "*"`) with a strict localhost-only allowlist. Only origins matching `http(s)://localhost:<port>` or `http(s)://127.0.0.1:<port>` get CORS headers. Non-localhost origins receive no CORS headers, blocking cross-origin requests from external sites.
- **Body limit**: Already implemented (`MAX_BODY = 1MB` in `collectBody()`), no changes needed.

**File: `src/cli.ts`**
- Added `--host` flag parsing (default `127.0.0.1`)
- Passes `host` to `startDashboard()` call
- Passes `--host` in background spawn args
- Updated console output to show actual host

### Security Impact
| Before | After |
|---|---|
| Bound to `0.0.0.0` (all interfaces) | Bound to `127.0.0.1` (localhost only) |
| CORS reflected any `Origin` header | CORS restricted to `localhost`/`127.0.0.1` only |
| Body limit: 1MB | Body limit: 1MB (unchanged) |

### Build Verification
`npx tsc --noEmit` — passed with no errors.