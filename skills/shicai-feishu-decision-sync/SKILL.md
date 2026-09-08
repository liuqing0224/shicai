---
name: shicai-feishu-decision-sync
description: Reconcile recruiter-confirmed pass or reject decisions between the local Shicai database and Feishu Recruitment through the built-in browser. Use for failed, interrupted, pending, or manual decision-sync requests; never turn AI recommendations into decisions.
---

# Shicai Feishu Decision Sync

Use the built-in browser for Feishu Recruitment state inspection and updates. This is a live HR mutation workflow.

## Required routing

1. Build the minimal local plan with `scripts/list-sync-candidates.mjs`. Keep that exact candidate set as the batch boundary.
2. Read [references/sync-policy.md](references/sync-policy.md) and finish a read-only classification of the entire batch from visible Feishu business states. Do not infer pending from a header alone.
3. Read [references/browser-flow.md](references/browser-flow.md) before browser operation.
4. Only after classification, immediately before the first pass/reject click, request one confirmation describing the exact names, counts, and consequences. Do not mix preflight and mutation.
5. Process candidates serially. Re-check the local target immediately before each action and inspect the same application after submission.
6. Record each verified outcome with `scripts/record-sync-result.mjs`; never mark a whole batch successful in advance. The journal is the resume checkpoint.

Read [references/recovery.md](references/recovery.md) before resuming an interrupted or timed-out run.

Read [references/local-state.md](references/local-state.md) when selecting rows or recording results.

## Authority rule

- If Feishu still shows `简历评估` with actionable `通过/不通过`, Feishu is pending: apply the current local recruiter decision.
- If Feishu is no longer pending, Feishu is authoritative. Do not click or overwrite it. Reconcile the local manual status to the supported Feishu result.
- If Feishu displays an unsupported or ambiguous non-pending state, stop that candidate and report a conflict instead of guessing.

## Hard boundaries

- Eligible local decisions are internal `shortlisted` (public `passed`) and `rejected`, with `source='feishu'`.
- AI recommendation, `pending`, `evaluating`, `evaluated`, `hold`, and `failed` never cause a Feishu write.
- Match by `application_id`; talent ID, name, and job are secondary checks.
- Never expose cookies or tokens, bypass login/security checks, replay private write APIs, or rely only on a toast.
- An existing Feishu result is reported as `already-consistent` or `remote-authoritative`, never as an automated click.
- A timeout after clicking or submitting is an unknown outcome, not a failure. Reopen the same application and classify it before any retry.
