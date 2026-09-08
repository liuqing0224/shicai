# Evaluation contract

## Job profile

Use five non-overlapping dimensions in this order:

1. `hard_skills`, weight `0.27`
2. `experience`, weight `0.19`
3. `responsibilities`, weight `0.18`
4. `gate`, weight `0.19`
5. `tech_direction`, weight `0.17`

Each dimension carries stable `id`, `name`, `description`, `weight`, `requirements`, `criteria`, `keywords`, and `mustHave`. Each criterion retains the JD quote and distinguishes `must` from `preferred`; only explicit JD text can set proficiency or minimum years.

## Resume report

Parsing records facts only. Evaluation emits a 0-10 score per dimension and one match per profile criterion: `met`, `partial`, `not_met`, or `unknown`, each with traceable evidence. Review corrects unsupported claims and alignment errors without inventing facts.

The service recalculates the 0-100 total, grade, and recommendation. When a must-have remains unknown, a computed rejection is softened to `hold` and requires recruiter review.

Reports should identify the job-profile version they were produced from. A version mismatch invalidates the old report for current comparison.
