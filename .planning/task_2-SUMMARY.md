# task_2: Review the aggregation fix

Assignee: reviewer
Status: done

## Result
## Security Code Review: Aggregation Fix (`public/dashboard.html`)

### Scope
Lines 1343-1354 — aggregation of remote client history/queue data into local rendering pipeline.

---

### Findings

**1. [PASS] XSS Protection — HTML escaping applied consistently**
- Location: `dashboard.html:864` (`esc()` function), used throughout `renderTimeline` and `renderQueue`
- The `esc()` helper (`textContent` → `innerHTML`) properly escapes `<`, `>`, `&`, `"` on all user-controlled string fields (`project`, `goal`, `summary`, `id`, `dependsOn`)
- Severity: n/a

**2. [WARN] Expanded Attack Surface — Remote data now rendered without extra validation**
- Location: `dashboard.html:1343-1354`
- Severity: **major**
- Before aggregation, only local trusted data was rendered. Now remote client data (fetched from `/api/clients`) flows into `stats()`, `renderTimeline()`, `renderQueue()`. A compromised remote client could inject crafted payloads. The existing `esc()` mitigates HTML injection, but the aggregation code performs zero schema validation on `cs.history` or `cs.queue` (e.g., checking they are arrays, checking entries have expected fields).
- Suggestion: Add `Array.isArray()` guard before `concat`:
  ```js
  if (cs && Array.isArray(cs.history)) allEntries = allEntries.concat(cs.history);
  if (cs && Array.isArray(cs.queue)) allQt = allQt.concat(cs.queue);
  ```

**3. [WARN] Pre-existing: Single-quote escaping gap in onclick handlers**
- Location: `dashboard.html:1311, 1315`
- Severity: **major** (elevated by aggregation expanding the data sources)
- `esc()` does NOT escape single quotes (`'`). In onclick handlers like `removeTask('${esc(t.id)}')` and `editRunAt('${esc(t.id)}',...)`, a task ID containing `');alert(1);//` would break out of the JS string. Pre-existing, but now exploitable via malicious remote client data.
- Suggestion: Add single-quote escaping: `return d.innerHTML.replace(/'/g, '&#39;');` or use `data-` attributes + event delegation instead of inline handlers.

**4. [PASS] Null/Undefined Guards**
- Location: `dashboard.html:1348-1350`
- `cs && cs.history` and `cs && cs.queue` properly guard against missing status or fields.
- Severity: n/a

**5. [PASS] Array Copy — No mutation of source data**
- Location: `dashboard.html:1345-1346`
- `.slice()` creates shallow copies of local arrays before concatenation. Original `hist.entries` and `qt` are not mutated.
- Severity: n/a

**6. [WARN] No size limits on aggregated data**
- Location: `dashboard.html:1347-1351`
- Severity: **minor**
- A malicious remote client could report thousands of history entries, causing browser performance degradation during rendering (DOM thrashing). No cap on total aggregated entries.
- Suggestion: Consider a reasonable cap (e.g., `allEntries.slice(0, 5000)`) or note this as an accepted risk for a local dashboard.

**7. [WARN] Tests are structural, not functional**
- Location: `test/aggregate-stats.test.ts`
- Severity: **minor**
- All 6 tests use regex matching on source code text rather than executing the aggregation logic. They verify the code _pattern_ exists but not that it _works correctly_. A refactor that preserves behavior but changes variable names would break all tests. Edge cases (empty clients, clients with non-array data, duplicate entries) are untested.
- Suggestion: Add at least one functional test using jsdom or a mock setup to verify actual data flow.

---

### Quality Gate

| Category | Result |
|----------|--------|
| Spec compliance | **PASS** — aggregation logic matches requirements |
| XSS protection | **PASS** — `esc()` used consistently |
| Input validation | **WARN** — no `Array.isArray` check on remote data |
| Pre-existing onclick XSS | **WARN** — single-quote gap, now higher risk |
| Performance | **WARN** — no size cap |
| Test quality | **WARN** — structural only |

**Overall: PASS with warnings.** No critical findings. Two major warnings (items 2 and 3) should be addressed — item 2 is a quick one-line fix, item 3 is pre-existing but worth noting for a follow-up.

## AWSL_RESULT

**Task: Review the aggregation fix** — Complete.

The aggregation code at `public/dashboard.html:1343-1354` is functionally correct and spec-compliant. XSS protection via `esc()` is applied consistently. No critical security issues found.

**2 major warnings:**
1. Missing `Array.isArray()` validation on remote client data before `concat` (easy fix)
2. Pre-existing: `esc()` doesn't escape single quotes, exploitable in onclick handlers now that remote data flows through rendering

**2 minor warnings:** No aggregation size limit; tests are regex-structural only, not functional.