# task_4: Expand coder bash denylist

Assignee: coder
Status: done

## Result
## AWSL_RESULT

### Task 4: Expand CODER_DENY_PATTERNS — Complete

**File modified:** `src/sandbox.ts`

**19 new patterns added** (21 existing → 40 total), organized by category:

| Category | Patterns Added |
|----------|---------------|
| Dangerous permissions / ownership | `chmod +s`, `chmod u+s`, `chown ` |
| Remote access / file transfer | `ssh `, `scp `, `sftp `, `rsync `, `ftp ` |
| Shell escapes (Windows) | `powershell`, `pwsh ` |
| Git push (prevent autonomous pushes) | `git push` |
| Package publishing | `npm publish` |
| System control | `shutdown`, `reboot` |
| Process / service control | `killall `, `systemctl ` |
| Scheduled task manipulation | `crontab` |
| Environment variable leaking | `printenv` |

**Verification:** `npx tsc --noEmit` passes with zero errors.

**Files modified:** `src/sandbox.ts`