# Post-interview contract

Input: current job profile, resume evidence, reviewed report, interview plan, and a speaker-attributed transcript.

For each profile dimension return `demonstrated`, `partial`, `gap`, or `not_assessed`. Scores are 1-4 for assessed dimensions and `null` for `not_assessed`. Cite concrete transcript evidence and explain the assessment.

Verify important resume claims as `verified`, `partially_verified`, `insufficient_evidence`, `not_assessed`, or `contradicted`. Return strengths, concerns, critical gaps, and unassessed dimensions separately. Do not convert unasked topics into shortcomings.

The service, not the model, calculates assessed coverage and the weighted score. The output recommendation may be `pass`, `conditional_pass`, or `reject`, but it does not alter the recruiter's manual status.
