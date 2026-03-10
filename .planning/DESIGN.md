## AWSL_RESULT

### Design: Dashboard Mobile Adaptation

**Chosen approach:** CSS-only media queries + responsive table pattern (no framework, no HTML changes, no JS changes)

**Key decisions:**

| Area | Change | Rationale |
|------|--------|-----------|
| Breakpoints | Add `@media (max-width: 480px)`, enhance existing `700px` | 480px targets phones; 700px is already used |
| Body padding | 28px 24px → 16px 12px on mobile | Reclaim precious horizontal space |
| Header | flex-wrap, stack on ≤480px | Title + clock overflow on narrow screens |
| Stats grid | 2 cols → 1 col at ≤480px | 2-column is too tight on 320px |
| Queue form | flex-direction: column on mobile | Input + datetime + checkbox + button must stack |
| Queue table | **Hide Deps & Run At columns** on ≤700px via `nth-child` | Critical — 6-column table can't fit, keep 4 essential columns (ID, Goal, Status, Action) |
| Touch targets | min-height 40px on all buttons at ≤700px | iOS/Android UX guidelines |
| Timeline | flex-wrap on entry-row1 | Prevent overflow |
| Heatmap | Reduce cell size 10px→8px at ≤480px | Better horizontal fit |
| Client cards | Reduce min-width 160px→130px | Allow 2 cards visible on phone |
| Queue actions | Stack vertically at ≤480px | Full-width tap targets |

**Files to modify:** `public/dashboard.html` (CSS `<style>` block only)

**Design document:** `.planning/design-mobile-dashboard.md`