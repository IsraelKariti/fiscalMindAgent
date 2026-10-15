## Why

When the WhatsApp 24-hour window is closed, the planner may only send an approved template, and the declaration-of-capital agent has exactly one: the first-contact intro (`capital_declaration_intro`). So a client who wrote three days ago and never got a reply receives the intro again ("we received your questionnaire, reply to start"), which ignores the whole conversation (production client 811a122f, 2026-10-15). The planner's reasoning in that run was correct; it simply had no template that fits a conversation already in progress.

## What Changes

- Every registered WhatsApp template carries a **purpose**: `intro` (first contact only) or `reopen` (any later contact outside the window). The existing intro row becomes `intro`; the admin register endpoint accepts the purpose.
- The planner is offered only the templates usable for this client: `intro` templates while no message was ever delivered to the client, `reopen` templates once one was. The prompt says why the hidden ones are hidden.
- The answer gate rejects a template that is not usable for the client with a note naming the reason (the intro was already sent / the client has not had the first contact yet), so the planner corrects itself instead of the message going out.
- When the window is closed and no usable template exists, the planner does not run and the cycle fails loudly as today ("drafting failed", manual retry), with a reason that names the missing `reopen` template.
- A new Hebrew re-engagement template `capital_declaration_update` (2 variables: client name, office name; Content SID `HXc0c20a33ebd77efb1bd004b5b041c9a7`, created and submitted to Meta as Utility on 2026-10-15) is seeded by the migration with purpose `reopen`. Its body says we would like to continue from where we stopped and asks the client to reply that they are ready; the first free-form message after the reply carries the real content.
- An eval case guards the behavior: closed window, conversation in progress, the answer must use the `reopen` template and never the intro.

Not in scope: the silent give-up after four rejected planner answers on 2026-10-12 (the reply was never sent because every answer failed the attestation rule). That failure mode is already removed by the planner tool-calls change running in production since 2026-10-15; the retry-exhaustion behavior itself is a separate concern.

## Capabilities

### New Capabilities
- `whatsapp-templates`: which approved WhatsApp template may be sent to which client when the 24-hour window is closed, how templates are registered with a purpose, and what happens when none fits.

### Modified Capabilities
- (none: `planner-answer-schema` and `code-gates` already describe "window and template rules" generically; the purpose rule is one more such rule, specified in the new capability.)

## Impact

- Database: migration 064 adds `wa_templates.purpose` (`intro` | `reopen`, default `reopen`), marks `capital_declaration_intro` as `intro`, and seeds `capital_declaration_update` (`reopen`, declaration_of_capital).
- API: `POST /api/admin/wa-templates` takes an optional `purpose`; `GET /api/admin/wa-templates` returns it.
- Code: `getWaChannelState` (plan.ts) filters templates by purpose using whether an outbound message was ever delivered; `buildWhatsAppSection` (prompt.ts) prints the hidden-template note; `normalizeFollowUpMessage` / decisionTools gate note; `prompt.md` closed-window rules.
- Owner action (manual, outside the code): the template is already created and submitted; deploy only after Twilio shows it as approved. Until then a closed-window planner run for a client past first contact fails loudly (current code) or Twilio refuses the send (new code).
- Evals: one new `generate_message` case; `docs/agents.md` WhatsApp note updated.
