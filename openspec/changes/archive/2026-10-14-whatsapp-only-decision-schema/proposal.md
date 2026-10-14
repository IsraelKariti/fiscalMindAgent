## Why

The planner's answer form still carries a channel choice (`channel`) and two email fields (`email_subject`, `email_body`) from the time the platform hosted email agents. The only agent today, the capital declaration, messages on WhatsApp only: the code already drops the email fields before every call and rejects any answer that picks email, so the model is asked a question with one allowed answer. On Anthropic models every "value or null" place in the form counts toward a budget of about 16 (prod incident 2026-09-01, HTTP 400 "schema is too complex"); the WhatsApp-only form sits at exactly 16 today, so `channel` is a wasted place that keeps the schema at the edge.

## What Changes

- **BREAKING (model contract)**: the planner's answer schema (`DecisionResponseSchema`) no longer has `channel`, `email_subject` or `email_body`. A follow-up answer carries exactly one WhatsApp message: `whatsapp_text` (inside the 24-hour window) or `whatsapp_template`. The code derives the channel (always WhatsApp) and the kind (free-form or template) from which field is filled.
- The decision context loses the `emailAllowed` / `whatsappAllowed` flags and the email / WhatsApp pruning groups; the request schema is pruned only by the groups a client really may lack (tax-fetch fields, intake fields).
- The planner prompt stops telling the model to "always set channel to whatsapp" and stops describing the email channel to the model.
- The `validate_message` gate's `business_rules` check reports the decision kind and the message kind it saw (free-form / template / no message) instead of the decision kind and channel.
- A unit test guards the number of "value or null" places in the WhatsApp-only capital-declaration request schema, so a future field cannot silently push the schema past Anthropic's budget again.
- Documentation follows: `docs/agents.md`, the Notion page "5. Conversation planner" (schema block) and the "Planner Answer Schema" artifact.
- Found during verification (added 2026-10-13, bug fix with no behavior change): the request schema is serialized with `$refStrategy: 'none'`. Since commit `aa11699` (2026-10-12) a Zod object shared by two places (`StatedCostOnInstanceSchema`) made the serializer emit a `$ref` inside `properties`, which Anthropic rejects with HTTP 400, so every planner call on a Claude model failed. The budget test also asserts the request schema has no `$ref`.

Out of scope: the `emails` table and its `channel` column (inbound email ingestion still writes `email` rows), the WhatsApp sender, the 24-hour window and template rules, and the attestation "none" value (a separate change).

## Capabilities

### New Capabilities
- `planner-answer-schema`: the shape of the planner's answer form — a WhatsApp-only message with no channel or email fields, the per-client pruning of field groups the client cannot use, and the budget of "value or null" places the WhatsApp-only form may hold.

### Modified Capabilities
- `code-gates`: the `validate_message` check list no longer includes "channel rules" among the business rules, and the `observed` value of `business_rules` is the decision kind plus the message kind (not the channel).

## Impact

- `src/agents/declarationOfCapital/decisionSchema.ts`: schema, `DecisionContext`, pruning groups, `FollowUpMessage`, `normalizeFollowUpMessage`, `filledMessageFields`, `gateDecision` (observed value), `EMAIL_ONLY_CONTEXT` removed.
- `src/agents/declarationOfCapital/plan.ts`: `DecisionContext` construction, `scheduleDraftMessage` call and `send_reply` step detail (channel becomes a constant).
- `src/agents/declarationOfCapital/decide.ts`: default context parameter.
- `src/agents/declarationOfCapital/prompt.md`, `prompt.ts`: the channel line and the email wording.
- `src/gemini/llmStages.ts` (`CAPITAL_DECISION_CONTEXT`), `evals/stages.ts` (context + message checks).
- Tests: `tests/anthropicSchema.test.ts`, `tests/intakeDecision.test.ts`, `tests/collectDecision.test.ts`, `tests/decisionKeepalive.test.ts`, plus the new budget test.
- Docs: `docs/agents.md`, Notion "5. Conversation planner", artifact "Planner Answer Schema" (https://claude.ai/artifact/UQEzaVeaN3qEKW6GPgwfhL).
- No database migration. Production effect: the request schema sent to Claude has 15 "value or null" places instead of 16; the prompt is one rule shorter.
