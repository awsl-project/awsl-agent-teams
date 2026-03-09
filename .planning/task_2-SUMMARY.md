# task_2: Three changes in src/dashboard.ts:

1. **Bind to 127.0.0.1**

Assignee: coder
Status: done

## Result
All changes applied correctly. tsc passes clean.

## AWSL_RESULT

### Completed: Dashboard security hardening (task_2)

**File modified**: `src/dashboard.ts`

**3 security fixes applied:**

| # | Fix | Line(s) | Detail |
|---|-----|---------|--------|
| 1 | **Bind to 127.0.0.1** | 230 | `server.listen(port, '127.0.0.1', ...)` — no longer network-accessible |
| 2 | **Restrict CORS** | 62 | `Access-Control-Allow-Origin: http://localhost:<port>` — no more wildcard `*` |
| 3 | **Body size limit** | 20-35 | `collectBody()` helper with 1MB limit, returns 413 on oversize; replaced both manual `req.on('data')`/`req.on('end')` patterns in `/api/queue/add` (L147) and `/api/queue/set-time` (L168) |

**Verification**: `npx tsc --noEmit` — passes clean, zero errors.