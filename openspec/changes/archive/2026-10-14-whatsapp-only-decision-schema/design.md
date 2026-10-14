## Context

See proposal.md - Why. Today the answer form (`DecisionResponseSchema`, `decisionSchema.ts`) has 19 top-level fields and 21 "value or null" places (14 nullable fields + 7 nullable places inside list items). `prunedDecisionFields(ctx)` removes groups per context: email fields when `emailAllowed === false`, WhatsApp fields when `!whatsappAllowed`, tax-fetch fields when no provider is offered, intake fields when there is no intake. For the only agent (capital declaration, WhatsApp-only) the sent form has 16 nullable places. On the Anthropic path `toAnthropicSchema` turns each nullable place into an optional field and the provider counts them against a budget of about 16.

`normalizeFollowUpMessage` reads `channel`: anything but `'whatsapp'` is treated as email (a backward-safe default from the email era) and then rejected because `emailAllowed` is false. `plan.ts` always builds the context with `emailAllowed: false` and throws before the planner runs when the WhatsApp channel is unusable (`loadWaChannelOrThrow`), so `whatsappAllowed` is always true in a real call. `FollowUpMessage` is a three-way union (email / WhatsApp free-form / WhatsApp template); `scheduleDraftMessage` and the `send_reply` step read `message.channel`.

## Goals / Non-Goals

**Goals:**
- Remove the dead choice from the model's form and prompt; the model expresses a message by filling one of two WhatsApp fields.
- Keep every downstream consumer (draft scheduling, trace step, timeline, evals) working with the same data: the channel is now a constant the code supplies.
- Leave a regression guard for the nullable budget.

**Non-Goals:**
- Reworking the `emails` table, the `MessageChannel` type, or inbound email ingestion (`onInboundEmail.ts`, `ingestAttachments.ts`): those are storage and inbound concerns, not the planner's form.
- Changing the attestation enum (the `none` value is a separate change).
- Changing how the 24-hour window or templates are decided.

## Decisions

1. **Delete the fields from the Zod schema rather than prune them.** Pruning keeps `channel`/email in the TypeScript type, the restore table and every test fixture, and keeps `channel` in the form for every provider. Deleting shrinks the contract itself: the model never sees the fields, OpenAI and Gemini get the same smaller form, and the type system finds every consumer. Alternative considered: add `channel` to the email pruning group only. Rejected: it leaves the dead code and the "missing channel means email" default in place.

2. **Drop `emailAllowed` and `whatsappAllowed` from `DecisionContext`, and the email and WhatsApp pruning groups.** Both flags encode a choice that no longer exists; `plan.ts` already refuses to run the planner without a usable WhatsApp channel. `windowOpen` and `templates` stay: they decide which of the two message fields is legal. `EMAIL_ONLY_CONTEXT` is deleted; `normalizeDecision` and `decide` take an explicit context (every caller already passes one; tests that relied on the default get a small WhatsApp context helper).

3. **Derive the kind from the filled field.** `normalizeFollowUpMessage` returns `{ kind: 'freeform', body }` when `whatsapp_text` is non-empty, `{ kind: 'template', … }` when `whatsapp_template` is set, and throws when both or neither are set. `FollowUpMessage` keeps a `channel: 'whatsapp'` literal so `scheduleDraftMessage`, `recordPlannerStep('send_reply')` and the logs keep their current shape without a conditional; the email branch of the union is removed.

4. **`observed` for `business_rules` becomes `<decision> / <kind>`.** The gate computed `${decision} / ${channel ?? '—'}` from the raw answer before normalization. The raw answer no longer has a channel, so the gate derives the kind from the raw fields the same way normalization does (`freeform` if `whatsapp_text` is filled, `template` if `whatsapp_template` is set, `—` otherwise). This keeps the trace readable and is specified in the `code-gates` delta.

5. **Budget guard as a unit test, not a runtime check.** A runtime check could only fail the call. A test (`tests/decisionSchemaBudget.test.ts`) walks the JSON schema produced by `decisionSchemaForContext` for the capital-declaration context without fetch, counts nullable places (an `anyOf` with a `null` branch, or a `type` array containing `null`, at any depth) and asserts `<= 15`. The threshold is one below today's count on purpose: the next nullable field is a decision, not an accident. Alternative: assert on the pruned Anthropic schema's optional count. Rejected: the original schema is the contract; the adapter is an implementation detail already covered by `anthropicSchema.test.ts`.

6. **Prompt wording.** Remove the `channel` rule ("always whatsapp, never email") from `prompt.md` action 2. Keep the rule that tells the agent what to answer a client who asks to move to email (that is conversation behavior, not a form field). `prompt.ts` keeps the WHATSAPP CHANNEL block (window state and templates); its "use email only" wording for an unavailable channel is dead text because `plan.ts` throws first, and is replaced by a neutral "no message can be sent" line.

## Risks / Trade-offs

- [The model still writes `channel` out of habit, learned from older transcripts in context] → the `json_schema` check rejects unknown keys on Anthropic (`additionalProperties: false`) and the retry message lists the allowed fields; on OpenAI (`strict: false`) the Zod parse rejects the extra key the same way. One retry covers it; the evals planner stage will show how often it happens.
- [A test fixture or eval case still sends `channel`] → the type checker finds TypeScript fixtures; JSON eval cases were grepped and carry no `channel`.
- [`send_reply` step detail readers expect `channel`] → the step keeps `channel: 'whatsapp'` as a constant; the UI mapping is unchanged.
- [Deleting `EMAIL_ONLY_CONTEXT` breaks an external caller] → only `decide.ts`, `normalizeDecision` and one test use it; all are updated in this change.

## Migration Plan

No migration. Deploy as a normal release; the first planner call after deploy uses the new form. Rollback is a plain revert: the stored drafts, steps and LLM-call rows do not depend on the form's shape.
