# Execution Plan

## task_1: Implement mobile CSS media queries
- **Assignee:** coder
- **Files:** public/dashboard.html

### Action
Edit the <style> block in public/dashboard.html to add mobile adaptation. Follow the design spec in .planning/design-mobile-dashboard.md exactly. All changes are CSS-only — NO HTML or JS changes.

1. ENHANCE existing @media (max-width: 700px) block (around line 309-313) — add these rules inside it:
   - body { padding: 16px 12px 60px; }
   - .queue-form { flex-wrap: wrap; }
   - .queue-form input[type="text"] { min-width: 100%; }
   - Hide queue table columns 4 (Run At) and 5 (Deps): .q-table th:nth-child(4), .q-table td:nth-child(4), .q-table th:nth-child(5), .q-table td:nth-child(5) { display: none; }
   - Touch targets: .queue-form button, .queue-actions button, .clients-actions button { min-height: 40px; padding: 8px 14px; }
   - .q-del { min-height: 36px; min-width: 36px; font-size: 18px; }
   - .proj-item { padding: 8px 10px; min-height: 36px; }

2. ADD NEW @media (max-width: 480px) block after the 700px block with:
   - .header { flex-wrap: wrap; gap: 4px; }
   - .header h1 { font-size: 17px; width: 100%; }
   - .stats { grid-template-columns: 1fr; }
   - .stat-val { font-size: 18px; }
   - .tk-val { font-size: 15px; }
   - .heatmap-cell { width: 8px; height: 8px; }
   - .heatmap-week { gap: 2px; }
   - .heatmap-grid { gap: 2px; }
   - .queue-form { flex-direction: column; align-items: stretch; }
   - .queue-form input[type="text"], .queue-form input[type="datetime-local"] { width: 100% !important; }
   - .q-table th, .q-table td { padding: 6px 6px; font-size: 11px; }
   - .queue-actions { flex-direction: column; }
   - .queue-actions button { width: 100%; }
   - .entry-row1 { flex-wrap: wrap; }
   - .entry-dur, .entry-time { font-size: 11px; }
   - .client-card { min-width: 130px; }

IMPORTANT: Keep existing rules intact. Only ADD new rules inside existing blocks or add new blocks.

### Verify
Open public/dashboard.html and confirm: (1) existing 700px block has new rules, (2) new 480px block exists with all listed rules, (3) no HTML/JS changes, (4) existing 900px block unchanged

### Done
dashboard.html has enhanced 700px media query and new 480px media query with all mobile adaptation CSS rules from the design spec

## task_2: Review mobile CSS changes
- **Assignee:** reviewer
- **Dependencies:** task_1
- **Files:** public/dashboard.html

### Action
Review the CSS media query changes in public/dashboard.html. Check for:
1. No regressions to desktop layout (900px+ unchanged)
2. CSS specificity issues (no unintended overrides)
3. All !important usage is justified (only for inline style overrides)
4. Touch target sizes meet 36-40px minimum
5. No horizontal overflow issues on 320px width
6. Queue table column hiding targets correct nth-child indices (4=Run At, 5=Deps)
7. No duplicate or conflicting rules between 700px and 480px blocks
8. No HTML or JS changes were made (CSS-only requirement)

### Verify
Read the media query sections of public/dashboard.html and verify all review points pass

### Done
All CSS changes reviewed, no issues found or issues reported with fixes

## task_3: Test mobile responsiveness
- **Assignee:** tester
- **Dependencies:** task_1
- **Files:** public/dashboard.html

### Action
Verify the mobile CSS changes by reading public/dashboard.html and checking:
1. Read the full <style> block and verify all expected media queries exist
2. Verify @media (max-width: 900px) is unchanged (only .stats rule)
3. Verify @media (max-width: 700px) has original rules PLUS new body padding, queue-form wrap, table column hiding, touch targets
4. Verify @media (max-width: 480px) has all rules: header wrap, stats 1-col, reduced font sizes, queue form column layout, table compact padding, queue actions stacked, entry-row1 wrap, smaller client cards, smaller heatmap cells
5. Check that no CSS syntax errors exist (balanced braces, valid selectors)
6. Verify viewport meta tag exists: <meta name="viewport" content="width=device-width, initial-scale=1.0">
7. Confirm no HTML structure changes and no JS changes were made

### Verify
Read public/dashboard.html and verify all expected CSS rules are present and syntactically correct

### Done
All mobile CSS rules verified present, syntax correct, no regressions to existing breakpoints
