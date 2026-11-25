## MODIFIED Requirements

### Requirement: A fallback is visible in the records
The failed primary call and the backup call SHALL each be recorded as their own LLM call row (the primary with its error, the backup with its answer), so the admin call browser and the client's trace show both, in order. The backup call's row SHALL carry a fallback mark naming the primary model it replaced, that model's provider, and the reason the primary did not serve the call (the status, "timeout", "network", or "provider held" when the primary's provider was held and the backup took the call without a primary attempt). A row of a call that was not a fallback SHALL carry no mark. The mark SHALL be written for every backup call, whether or not the call belongs to a client. For a call made for a client, the trace SHALL also carry one code step between the two call rows, named as a model fallback, stating the stage, the primary model and its provider, the reason the primary failed (the status, "timeout" or "network", with the error text), and the backup model and its provider. The step SHALL follow the existing trace rules: visible to admins only, with its own step link and copyable details. The admin call browser's call modal SHALL show, on a marked row, one line "fallback for <primary model> (<reason>)". The server log SHALL also note every fallback at warning level.

#### Scenario: Trace after a fallback
- **WHEN** an admin opens, with the LLM calls and code steps toggles on, the trace of a client whose planner call fell back from Gemini to Claude
- **THEN** the timeline shows the failed Gemini call row (status error), then the fallback step naming both models and the reason, then the Claude call row with the answer

#### Scenario: Backup row carries the mark
- **WHEN** a planner call on `claude-opus-5` fails with status 400 and the backup `gpt-6-astra` answers
- **THEN** the `gpt-6-astra` call row records fallback from `claude-opus-5` (anthropic), reason "status 400", and the `claude-opus-5` error row carries no mark

#### Scenario: Call modal of a backup row
- **WHEN** an admin opens that `gpt-6-astra` call in the call browser
- **THEN** the modal shows "fallback for claude-opus-5 (status 400)" next to the model

#### Scenario: Client-less backup call
- **WHEN** a call with no client (for example the questionnaire mapping of an instance) falls back
- **THEN** no trace step is written, but the backup row still carries the mark

#### Scenario: Accountant view
- **WHEN** an accountant views the same conversation
- **THEN** no call row and no fallback step is shown, as for every trace row today
