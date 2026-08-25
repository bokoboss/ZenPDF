# Phase 1B lifecycle and resource stress matrix

Issue #4 qualifies the typed worker/session/resource architecture accepted in Phase 1A. The scenarios below use deterministic fake-worker event sequences and bounded loops; they do not introduce a second lifecycle architecture or upload document data to a server.

| Scenario | Layer / test | Expected | Actual | Result | Production code changed |
| --- | --- | --- | --- | --- | --- |
| Reset during active parse; late parse response | Store / `resets after FILE_PARSED and ignores thumbnails from the disposed parse session` | Old session cannot repopulate files, pages, thumbnails, tasks, or outputs; new session is usable | Old response is inert; state is empty; registry count is 0 | PASS | No |
| Reset during active merge | Store / `resets an active merge and keeps late output from resurrecting it` | Late old output cannot set merged URL or busy state | Old output is rejected; save state is clear; registry count is 0 | PASS | No |
| Reset during active extract, then new extract | Store / `resets an active extract and prevents the old result replacing a new result` | New output remains authoritative over late old output | New extracted URL remains accepted; old output is inert | PASS | No |
| Remove file during parse and thumbnails | Store / `removes a parsing file while preserving an unrelated file and its resources` | Removed file/task/resources disappear; unrelated file survives | Cancel is sent; late removed-file response is inert; unrelated file completes; URL is revoked | PASS | No |
| Immediate cancellation and late terminal response | Client / `removes a cancelled task immediately even if the worker response is late` | Cancelled task is no longer active and late response is inert | Active task list is empty immediately; cancellation remains rejected | PASS | Yes: cancelled tasks are deleted from the client map |
| Save replacement and late old output | Store / `does not let a cancelled save output replace a newer accepted save` | Replacement output wins | Old output is rejected; new output is accepted | PASS | No |
| Typed save/extract errors | Store / `settles store busy flags and task IDs after typed save and extract errors` | Error leaves no stuck busy flag or task ID | Both operations settle cleanly | PASS | No |
| Fatal worker failure and restart | Store / `clears active parse task state and accepts new work after worker recovery` | Fatal operation state is cleared; restarted session accepts new work | Parse IDs clear; new session parses a replacement file successfully | PASS | Yes: fatal worker errors clear parse task IDs |
| Repeated merge/extract replacement | Store / `keeps repeated merge and extract replacement ownership bounded` | Replacements keep one current output owner and reset to zero | 8 merge and 8 extract cycles remain bounded; reset reaches zero | PASS | No |
| Repeated add/remove and reset/reinitialize | Store / `keeps repeated add/remove and reset/reinitialize loops bounded` | No URL/task/state accumulation across 8 cycles each | Registry returns to zero and state/task IDs clear after every cycle | PASS | No |

The focused suite totals 32 tests across the client, resource registry, and store. Ten tests are new for Phase 1B. Browser PDF output correctness remains covered by the existing Chromium regression suite; the full validation commands and hosted CI result are reported with the Issue #4 pull request.
