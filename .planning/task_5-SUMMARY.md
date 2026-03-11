# task_5: Add the following export line to `src/index.ts`:

```typescr

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task: Export discuss module types from `src/index.ts`

**Status:** Already complete — no changes needed.

The export line already exists at `src/index.ts:40`:
```typescript
export { discussTeam, type DiscussionRound, type DiscussionResult, type DiscussOptions } from "./discuss.js";
```

**Verification:** `npx tsc --noEmit` passes with zero errors.