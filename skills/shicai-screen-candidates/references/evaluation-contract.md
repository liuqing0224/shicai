# Evaluation contract

## Job profile

Use exactly five non-overlapping dimensions dynamically derived from the current JD. Dimension names, IDs, order, and weights are job-specific rather than a fixed template. Each weight is between `0.1` and `0.35`, and the five weights sum to `1`.

Each dimension carries a unique stable lowercase `id`, job-specific `name`, `description`, `weight`, non-empty `requirements`, `criteria`, `keywords`, and `mustHave`. Criterion IDs are unique across the profile. Each criterion retains the JD quote and distinguishes `must` from `preferred`; only explicit JD text can set proficiency or minimum years. Do not invent requirements merely to fill five dimensions.

An agent-generated profile becomes active immediately. A recruiter may later save a validated manual profile as a new version. Manual saves record their source and time; re-evaluation may target no candidates, candidates without a final manual decision, or all candidates. Re-evaluation must preserve existing pass, hold, and reject decisions.

## Resume report

Parsing records facts only. Evaluation emits a 0-10 score per dimension and one match per profile criterion: `met`, `partial`, `not_met`, or `unknown`, each with traceable evidence. Review corrects unsupported claims and alignment errors without inventing facts.

The service recalculates the 0-100 total, grade, and recommendation. When a must-have remains unknown, a computed rejection is softened to `hold` and requires recruiter review.

Reports should identify the job-profile version they were produced from. A version mismatch invalidates the old report for current comparison.
