# Interrupted-run recovery

Use this protocol after a browser timeout, service restart, user interruption, or uncertain submission.

1. Preserve the confirmed batch; do not add newly eligible candidates.
2. Read the latest entries in `.data/feishu-sync-journal.jsonl` and the current local rows.
3. Reopen the exact application whose action was in flight and verify candidate, job, and application ID.
4. If Feishu now records the intended result, do not click again. Record `changed-by-browser` only when the interrupted action is known to be this run; otherwise record `already-consistent`.
5. If Feishu records a different non-pending result, treat it as human-owned and reconcile with `remote-authoritative`.
6. If the decision dialog is still open, inspect whether its text and controls are intact before continuing. Never reuse stale accessibility indexes.
7. If the page is still pending and no decision dialog is open, recheck the current local target, then retry once under the existing confirmation.
8. If the built-in browser service is unavailable, retry after a short backoff. Do not switch to another browser when the user required the built-in browser.

Stop that candidate after a second uncertain submission or any identity/state mismatch. Record `browser-failed` or `conflict` with a safe message and continue only with independently classified rows.
