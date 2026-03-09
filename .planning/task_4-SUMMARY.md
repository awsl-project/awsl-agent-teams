# task_4: In src/sandbox.ts, expand the `CODER_DENY_PATTERNS` array (l

Assignee: coder
Status: done

## Result
tsc passes clean.

## AWSL_RESULT

### Task 4: Expand CODER_DENY_PATTERNS — Complete

**File modified:** `src/sandbox.ts`

**13 new patterns added** (7 existing + 13 new = 20 total):

| Category | Patterns Added |
|----------|---------------|
| Glob-based destruction | `rm -rf /*` |
| Download-and-execute | `\| sh`, `\| bash`, `curl `, `wget ` |
| Interpreter escapes | `python -c`, `python3 -c`, `node -e`, `perl -e`, `ruby -e` |
| Network exfiltration | `nc `, `ncat ` |
| Eval / encoded execution | `eval `, `base64 -d` |

**Verification:** `npx tsc --noEmit` passes with zero errors.