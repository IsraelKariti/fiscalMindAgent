## 1. Answer form and context

- [x] 1.1 In `decisionSchema.ts` remove `channel`, `email_subject`, `email_body` from `DecisionResponseSchema`; remove `EMAIL_FIELDS`, `WHATSAPP_FIELDS`, their entries in `PRUNED_FIELD_DEFAULTS` and `prunedDecisionFields`; remove `emailAllowed` / `whatsappAllowed` from `DecisionContext` and delete `EMAIL_ONLY_CONTEXT`. Verify `npm run typecheck` lists only the consumers touched in tasks 1.2–2.3.
- [x] 1.2 Rewrite `normalizeFollowUpMessage` to derive the kind from the filled field (free-form inside the window, template otherwise; both or neither filled → throw naming both fields); narrow `FollowUpMessage` and `FollowUpMessageInput` to the WhatsApp variants with a `channel: 'whatsapp'` literal; update `filledMessageFields`. Verify with unit tests for the four scenarios of the `planner-answer-schema` spec (free-form, template, both, neither).
- [x] 1.3 In `gateDecision` compute `observed` for `business_rules` as `<decision> / <freeform|template|—>` from the raw fields. Verify with a test that a `collect` answer records `collect / —` and a free-form follow-up records `follow_up / freeform`.
- [x] 1.4 Make the context parameter of `normalizeDecision` and `decide` required (no email-only default). Verify `npm run typecheck` passes after tasks 2.x.

## 2. Callers

- [x] 2.1 `plan.ts`: build `DecisionContext` without the two flags; simplify the `scheduleDraftMessage` call, the `send_reply` step detail and the "follow-up scheduled" log to the WhatsApp-only message (constant channel, `kind` from the message). Verify `npm run typecheck` and that the `send_reply` step detail still carries `channel`, `kind`, `send_at`, `chars`.
- [x] 2.2 `src/gemini/llmStages.ts` (`CAPITAL_DECISION_CONTEXT`) and `evals/stages.ts` (context, message checks `eq('channel', …)` → kind-based checks): drop the flags. Verify `npm run typecheck` and `npm run evals -- --help` (harness still loads).
- [x] 2.3 `prompt.md`: delete the `channel` rule in action 2 and any wording that offers email as a channel; keep the rule for a client who asks to move to email. `prompt.ts`: replace the "use email only" line of the unavailable-channel block with a neutral line. Verify by rendering the prompt in `tests/` fixtures (`npm test`) and reading the diff.

## 3. Tests and the budget guard

- [x] 3.1 Update `tests/anthropicSchema.test.ts`, `tests/intakeDecision.test.ts`, `tests/collectDecision.test.ts`, `tests/decisionKeepalive.test.ts` to the new form (no `channel` / email fields, explicit WhatsApp context). Verify `npm test` passes.
- [x] 3.2 Add `tests/decisionSchemaBudget.test.ts`: count the nullable places (at any depth) in the JSON schema `decisionSchemaForContext` builds for a capital-declaration context without fetch, assert the count is 15 and at most 15, with the Anthropic budget explained in a comment. Verify the test passes and that adding a temporary nullable field makes it fail.
- [ ] 3.3 Run `npm run evals -- --stage generate_message` (planner stage) once on the configured models and compare with `evals/results/latest.json`: no regression in the planner cases, and note how often an answer was retried for an unknown `channel` key. Restore unchanged result files before committing (see repo notes on evals churn).

- [x] 3.4 (added during apply) Serialize the request schema with `$refStrategy: 'none'` in `decide.ts` (`decisionJsonSchemaForContext`) and assert in the budget test that the schema has no `$ref`; the first Claude eval run failed all 31 cases with Anthropic's 400 "References must be defined under '$defs'". Verify by re-running the Claude evals.

## 4. Documentation

- [x] 4.1 `docs/agents.md`: replace the "planner may never choose email: `emailAllowed=false`" invariant with "the planner's form has no channel; messages are WhatsApp only" and point to the `planner-answer-schema` spec. Verify by reading the section.
- [x] 4.2 Notion "LLM calls → 5. Conversation planner": update the schema code block (remove `channel`, `email_subject`, `email_body`) and the Schema card sentence about removed groups; artifact "Planner Answer Schema" (https://claude.ai/artifact/UQEzaVeaN3qEKW6GPgwfhL): drop the Email group and `channel`, set the counts to 19 places / 15 after pruning, and update the lane labels. Verify by opening both.

## 5. Finish

- [ ] 5.1 `npm run typecheck` and `npm test` pass; commit per the repo git workflow (pull --rebase, typecheck, push).
