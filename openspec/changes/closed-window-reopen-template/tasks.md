## 1. Template purpose in the database and API

- [x] 1.1 Add migration `064_wa_templates_purpose.sql`: `purpose TEXT NOT NULL DEFAULT 'reopen' CHECK (purpose IN ('intro','reopen'))`, set `intro` on `capital_declaration_intro`, and seed `capital_declaration_update` (SID `HXc0c20a33ebd77efb1bd004b5b041c9a7`, body verbatim from design.md, 2 variables, `declaration_of_capital`, `reopen`, `ON CONFLICT DO NOTHING`); verify with `npm run db:migrate` and a `SELECT name, purpose FROM wa_templates` showing both rows.
- [x] 1.2 Add `purpose` to `WaTemplateRow` (`src/db/types.ts`) and to `waTemplates.insert`; extend `POST /api/admin/wa-templates` (optional `purpose`, default `reopen`) and `GET` to return it; verify by registering a test row through the API and reading it back, then deleting it.

## 2. Usable templates per client

- [x] 2.1 Add `emails.hasDeliveredOutbound(clientId)` (outbound WhatsApp row with status `sent`) in `src/db/queries/emails.ts`; verify with a unit test against the test database or a query against a local client that has a sent intro.
- [x] 2.2 In `getWaChannelState` (`plan.ts`), split the agent type's templates into `templates` (usable: `intro` before first contact, `reopen` after) and `hiddenTemplates` (each with its reason); return `allowed: false` with a reason naming the missing purpose when the window is closed and no usable template remains; add `hiddenTemplates` to `WaChannelState` (`prompt.ts`); verify with unit tests covering the four cases (first contact / in progress × intro only / both).
- [x] 2.3 In `buildWhatsAppSection` (`prompt.ts`), print one `[hidden]` line per hidden template with its reason; in `prompt.md` closed-window rules, say that the intro is for the first contact only, that a `reopen` template only announces an update, and that the real content goes in the first free-form message after the reply; verify with the prompt fixture tests (`npm test`).

## 3. Gate

- [x] 3.1 In `normalizeFollowUpMessage` (`decisionSchema.ts`), when the chosen `template_id` is not in `ctx.templates` but is in `ctx.hiddenTemplates`, reject with the hidden reason ("intro template already delivered to this client" / "reopen template: the client has not had the first contact yet"); keep the unknown-id message otherwise; verify with unit tests that the `validate_message` `business_rules` note carries the reason.
- [x] 3.2 Confirm the corrective retry text (`decisionTools.ts`) still reads correctly with the new note and that `npm run typecheck` passes.

## 4. Evals and docs

- [x] 4.1 Add `purpose` to the evals fixture templates (`evals/stages.ts`), add the `capital_update` fixture with the agreed body, and add a `generate_message` case: window closed, delivered intro, client message 3 days ago, both templates offered; expects a template answer that is the update template and not the intro; verify with `npm run evals` on that case (use the add-eval-case skill).
- [x] 4.2 Update `docs/agents.md` WhatsApp note (template purposes, hidden templates, loud failure reason) and `docs/pipeline.md` if the channel-state step is listed there; verify by reading the sections.

## 5. Owner steps (outside the code)

- [x] 5.1 Create `capital_declaration_update` in the Twilio Content Template Builder with the exact body from design.md (Utility, Hebrew, 2 variables) and submit it for WhatsApp approval (done 2026-10-15, SID `HXc0c20a33ebd77efb1bd004b5b041c9a7`).
- [ ] 5.2 Before deploying, verify the Twilio console shows the template's WhatsApp approval status as "approved".
- [ ] 5.3 Live check on the production client 811a122f (or a test client): retry the drafting; verify the scheduled draft is the update template, not the intro, and that after the client replies the first free-form message carries the licence explanation.
