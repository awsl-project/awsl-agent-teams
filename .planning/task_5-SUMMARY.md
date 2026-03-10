# task_5: Add exports for the new projects module to src/index.ts.

Ad

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task Complete: Exports already in place

The export line already exists at `src/index.ts:38`:

```typescript
export { ProjectManager, type ProjectEntry, type ProjectRegistry, type ProjectStatus } from "./projects.js";
```

**Verification:** `npx tsc --noEmit` — clean, no errors. Nothing to change.