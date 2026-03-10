# Design: Dashboard Mobile Adaptation

## Goal
Make `public/dashboard.html` fully usable on mobile devices (320px–480px phone screens).

## Current State
- Single HTML file with embedded CSS (661 lines) + JS (719 lines)
- Already has `<meta name="viewport">` tag
- Two existing media queries: `@media (max-width: 900px)` and `@media (max-width: 700px)`
- Existing responsive: stats 4→3→2 cols, cols/row2 go single-column at 700px

## Approach
**CSS media queries + responsive table pattern** — no framework, no separate files. All changes within the existing `<style>` block.

## Changes Required

### 1. Body & Global (≤700px)
```css
body { padding: 16px 12px 60px; }
```

### 2. Header (≤480px)
- Stack vertically: title on top, clock/live-dot below
- Reduce title font-size slightly
```css
.header { flex-wrap: wrap; gap: 4px; }
.header h1 { font-size: 17px; width: 100%; }
```

### 3. Stats Grid (≤480px)
- Go to 1 column for very narrow screens
```css
.stats { grid-template-columns: 1fr; }
```

### 4. Heatmap
- Already has `overflow-x: auto` — OK as-is
- Reduce cell size on mobile for better fit
```css
@media (max-width: 480px) {
  .heatmap-cell { width: 8px; height: 8px; }
  .heatmap-week { gap: 2px; }
  .heatmap-grid { gap: 2px; }
}
```

### 5. Queue Form (≤700px)
- Switch to column layout, inputs full-width
```css
.queue-form { flex-wrap: wrap; }
.queue-form input[type="text"] { min-width: 100%; }
```
At ≤480px:
```css
.queue-form { flex-direction: column; align-items: stretch; }
.queue-form input[type="text"],
.queue-form input[type="datetime-local"] { width: 100% !important; }
```

### 6. Queue Table (≤700px) — Most Critical
Hide less-essential columns (Deps, Run At) on mobile via CSS:
```css
@media (max-width: 700px) {
  .q-table th:nth-child(4),
  .q-table td:nth-child(4),
  .q-table th:nth-child(5),
  .q-table td:nth-child(5) { display: none; }
}
```
At ≤480px — also reduce padding, smaller font:
```css
.q-table th, .q-table td { padding: 6px 6px; font-size: 11px; }
```

### 7. Timeline Entries (≤480px)
- Allow entry-row1 to wrap
- Stack duration/time below status/project
```css
.entry-row1 { flex-wrap: wrap; }
.entry-dur, .entry-time { font-size: 11px; }
```

### 8. Client Cards (≤480px)
- Reduce min-width so 2 cards can fit
```css
.client-card { min-width: 130px; }
```

### 9. Touch Targets
- Ensure all buttons have minimum height
```css
@media (max-width: 700px) {
  .queue-form button,
  .queue-actions button,
  .clients-actions button { min-height: 40px; padding: 8px 14px; }
  .q-del { min-height: 36px; min-width: 36px; font-size: 18px; }
  .proj-item { padding: 8px 10px; min-height: 36px; }
}
```

### 10. editRunAt Modal (≤480px)
- Full-width minus padding
```css
/* Applied via inline styles already, but the box has min-width:280px */
/* On 320px screens this is tight but still fits (320 - 2*16 = 288 > 280) */
/* No change needed — the overlay is flex-centered and the box will fit */
```

### 11. Queue Actions (≤480px)
- Stack buttons vertically
```css
.queue-actions { flex-direction: column; }
.queue-actions button { width: 100%; }
```

### 12. Token Card Values (≤480px)
```css
.tk-val { font-size: 15px; }
.stat-val { font-size: 18px; }
```

## File Changes
- **`public/dashboard.html`** — Add/enhance media queries in `<style>` block (lines 306-313 area)

## Implementation Notes
- All changes are CSS-only in the existing `<style>` block
- No HTML structure changes needed
- No JavaScript changes needed
- Enhance existing `@media (max-width: 700px)` block and add new `@media (max-width: 480px)` block
- Keep existing 900px breakpoint unchanged

## Testing Checklist
- [ ] iPhone SE (375px) — all content visible, no horizontal scroll on body
- [ ] iPhone 14 (390px) — smooth layout
- [ ] Small Android (360px) — queue table readable
- [ ] iPad mini (768px) — existing 700px+ layout works
- [ ] Desktop (1100px) — no regressions
- [ ] Queue form: add task works on mobile
- [ ] Queue table: all visible columns are readable
- [ ] Heatmap: scrolls horizontally if needed
- [ ] Timeline: entries expand/collapse on tap
- [ ] editRunAt modal: fits on screen, input usable
- [ ] Buttons: easy to tap (no misclicks)
