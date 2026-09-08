# Built-in browser flow

Open the tenant's Feishu Recruitment `简历评估 -> 待评估` page in the built-in browser. Reuse its authenticated session; if login or account verification is required, pause for the user rather than extracting credentials.

For each planned row:

1. Navigate with the stored HTTPS `source_url` only after validating its host and `application_id`.
2. Verify application ID, candidate name, exact job name, and visible evaluation state.
3. Treat a visible recorded operator, timestamp, and `通过` or `不通过` beneath `简历评估` as an existing human result. A later stage or scheduled interview is also non-pending.
4. Pending requires both the current application identity and actionable `通过/不通过` buttons in the `简历评估` section. Header text alone is insufficient.
5. If a pass action offers multiple stages or the next stage is not unique and explicit, stop. Never trust an ambiguous preselection or guess an ID.
6. A pass dialog may contain an optional evaluation. Do not invent text; submit it empty when Feishu permits.
7. For rejection, do not select a preset reason unless it is factually supported by the confirmed decision. When a free-text evaluation is required, use only `简历评估未通过`.
8. After submission, inspect the same application until the decision buttons disappear and the recorded operator, timestamp, and result appear. Reload or reopen only when the current state is incomplete or ambiguous.

Prefer semantic labels and the accessibility tree over brittle coordinates or CSS selectors. Feishu may render an unrelated page-feedback panel with another textarea and disabled `提交` button; scope actions to the newly opened decision dialog and never target a generic last textarea or generic submit button. Process one application at a time so interruption is recoverable.
