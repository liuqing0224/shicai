# Sync policy and state matrix

| Visible Feishu state | Local recruiter state | Action | Provenance |
| --- | --- | --- | --- |
| Pending evaluation | passed | Click `通过`, then refresh and verify | `changed-by-browser` |
| Pending evaluation | rejected | Click `不通过`; use reason `简历评估未通过` if required; refresh and verify | `changed-by-browser` |
| Non-pending result matching local | same target | Do not click; keep local status | `already-consistent` |
| Non-pending passed/later active stage | different target | Do not click; set local public status to passed | `remote-authoritative` |
| Non-pending rejected/terminated | different target | Do not click; set local status to rejected | `remote-authoritative` |
| Non-pending ambiguous state | any | Stop and report conflict | `conflict` |

The presence of a recorded operator, timestamp, and result under `简历评估` means a human already operated it. Never overwrite or repeat that action. A matching remote result can be marked converged only after the page shows the business record; a toast or a changed header alone is insufficient.

Remote authority intentionally wins over a stale local decision. This is reconciliation, not automatic screening. Preserve provenance in the journal so human work is not reported as browser automation.

Withdrawal, transfer to another application, closed jobs, duplicate applications, and unfamiliar stage text are not pass/reject signals. Classify them as conflict. When the user requests a full current-state audit rather than retrying failures, build the plan with `--include-synced`.

Confirmation covers only the exact classified batch and targets shown to the user. Newly appearing candidates, changed local decisions, application-ID changes, or a different job require a new preflight and confirmation. A browser timeout does not expand the confirmation or authorize a blind retry.
