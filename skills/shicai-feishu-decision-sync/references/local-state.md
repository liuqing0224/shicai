# Local sync state

Database: `.data/app.db`, table `candidates`.

- Internal pass is `status='shortlisted'`; the API/UI maps it to `passed`.
- Reject is `status='rejected'`.
- `application_id` identifies the Feishu application; `external_id` is the talent ID.
- `sync_status`: `idle`, `pending`, `synced`, `failed`, or `skipped`.
- `sync_target`: `passed` or `rejected`.
- `sync_error` contains a safe structured error; `sync_at` is an ISO timestamp.

Do not run browser sync while a row is `sync_status='pending'`, because the OpenAPI worker may still be writing. Do not call `/api/candidates/:id/sync` or `/api/jobs/:id/sync-decisions` as a browser fallback; those retry the same OpenAPI path.

The result recorder uses compare-and-set: it rechecks source, application ID, non-pending sync state, and the expected local target. Any concurrent change requires fresh classification. `remote-authoritative` is the only mode allowed to align local `status` to the verified Feishu result.

Use `.data/feishu-sync-journal.jsonl` as the durable per-candidate checkpoint. On resume, compare the confirmed batch with the latest journal entries and current database rows. A journaled `synced` row is not clicked again; an unjournaled or failed row must be reclassified in Feishu. Never reconstruct completion from memory or from how far the browser tab appears to have progressed.

After the batch, query the exact confirmed candidate IDs and require `sync_status='synced'` with `sync_target` matching the final local public target. Report browser changes separately from `already-consistent` and `remote-authoritative` outcomes.
