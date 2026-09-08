# Project workflow

## Runtime

- UI: `http://127.0.0.1:5283`
- API: `http://127.0.0.1:8897`
- Database: `.data/app.db`
- Production provider: `AGENT_PROVIDER=codex`; `mock` is test-only and must never be a runtime fallback.

## Job and JD

Create the job with a name exactly matching Feishu Recruitment. A JD can be pasted or read from an authorized Feishu document. Persist the parsed job profile and increment its version whenever the JD is re-analyzed.

## Collection

Use the existing project command:

```bash
npm run collect -- --tenant-url <tenant> --job-name <exact-name> --position-id <local-job-id> --import
```

The collector uses a visible persistent Chromium session, reads only `简历评估 -> 待评估`, matches the job name exactly, caches by talent ID, and imports through `/api/import/feishu`. Do not replay private Feishu APIs or expose browser credentials.

## Evaluation

The queue stages are `parse`, `evaluate`, `review`, and `interview`. A failed prerequisite cancels later stages for that run. Re-evaluation must enqueue a new run and preserve the recruiter's manual decision.

Use `scripts/inspect-run.mjs` for a read-only summary before retrying. Do not retry blindly while another task is queued or running.
