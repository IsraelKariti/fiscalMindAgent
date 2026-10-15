## Context

See proposal.md for the incident. Relevant current state:

- `wa_templates` (migration 013, scoped per agent type by 051) holds Twilio Content SIDs; the DoC agent has one row, `capital_declaration_intro`. There is no admin UI for templates, only `GET/POST/DELETE /api/admin/wa-templates` (`src/api/waAdmin.ts`).
- `getWaChannelState` (`src/agents/declarationOfCapital/plan.ts`) decides what the planner may send: open window → free text, closed window → every template of the agent type. With a closed window and zero templates it returns `allowed: false`, and `loadWaChannelOrThrow` fails the drafting attempt loudly (drafting-failed marker, manual retry).
- `buildWhatsAppSection` (`prompt.ts`) prints the window state and the template list into the prompt; `prompt.md` rules 104-123 and 148-160 tell the planner when to use a template.
- `normalizeFollowUpMessage` (`decisionSchema.ts`) looks the chosen `template_id` up in `ctx.templates` and rejects an unknown one; the planner tool-calls gate (`decisionTools.ts`) surfaces that as a `business_rules` failure with a corrective retry.
- Templates must be created and approved by Meta through Twilio's Content Template Builder; the platform has one Twilio account shared by dev and prod, so a seeded SID is valid in both.
- The evals harness (`evals/stages.ts`) builds `ctx.templates` from the case's `wa.templates` names.

## Goals / Non-Goals

**Goals:**
- A closed-window contact after the first message never re-sends the intro.
- The planner only ever sees templates it may use, and the gate enforces the same rule.
- Missing configuration (no `reopen` template yet) is loud, not silent.

**Non-Goals:**
- No admin UI for templates (the API is enough; the owner registers one template once).
- No automatic creation or submission of templates through the Twilio Content API.
- No change to the retry-exhaustion behavior of the planner (four rejected answers → no message).

## Decisions

1. **Purpose column, not a name convention.** `wa_templates.purpose TEXT NOT NULL DEFAULT 'reopen' CHECK (purpose IN ('intro','reopen'))` (migration 064). The migration sets `intro` on `capital_declaration_intro`. Alternative: infer "intro" from the name; rejected because the rule must survive a renamed or second intro template.

2. **"First contact happened" = an outbound WhatsApp message with status `sent` exists for the client.** New query `emails.hasDeliveredOutbound(clientId)` (or reuse of the existing last-delivered lookup used by `listUnsentDraftsForClient`). Drafts, discarded drafts, and held first messages do not count, so a client whose intro is still waiting for approval is still "first contact". The 24h-window lookup already uses the inbound side the same way.

3. **Filter in `getWaChannelState`, before the prompt and the gate.** `getWaChannelState` gains `hasDeliveredOutbound` and returns `templates` = usable templates plus `hiddenTemplates` = the others with a reason. The prompt lists usable ones as today and adds one line per hidden template: `[hidden] capital_declaration_intro — intro template, already delivered to this client`. Because `ctx.templates` is the usable list, `normalizeFollowUpMessage` already rejects a hidden template as unknown; it is extended to look the id up in `hiddenTemplates` too and name the real reason in the note ("intro template already delivered to this client" / "reopen template: the client has not had the first contact yet"). Alternative: keep every template in the list and rely on a prompt rule; rejected because the incident shows the model follows the list.

4. **Closed window with no usable template → `allowed: false`** with reason `the 24h window is closed and no 'reopen' template is registered for this agent type` (or `'intro'` for first contact). `loadWaChannelOrThrow` keeps throwing, so the behavior matches the existing "no templates at all" case: drafting failed, manual retry, visible in the workspace and the logs. Alternative: let the planner run and answer a free-text draft that waits for the window; rejected, the scheduling contract requires a sendable message.

5. **Template text** (`capital_declaration_update`, Utility, 2 variables, Hebrew). Created by the owner in the Twilio Content Template Builder on 2026-10-15, Content SID `HXc0c20a33ebd77efb1bd004b5b041c9a7`, submitted for WhatsApp approval. Body, verbatim:
   ```
   שלום {{1}}, כאן העוזר הדיגיטלי של משרד רואה החשבון {{2}}.
   נשמח להמשיך מהנקודה שבה עצרנו באיסוף המסמכים להצהרת ההון.
   כשנוח לך — השב לי כאן שאתה מוכן, ונמשיך.
   ```
   Short and generic on purpose: it fits a reminder after silence and a late answer to a client question, and it ends with one plain call to action ("reply here that you are ready"). The prompt already says the first free-form message after the reply carries the content (`prompt.md` line 123); one sentence is added to the closed-window rule so the planner knows a `reopen` template never argues or explains.

6. **Seed the SID in the migration, like 051.** The platform has one Twilio account for dev and prod, so migration 064 inserts the row (`ON CONFLICT (content_sid) DO NOTHING`, `agent_type = 'declaration_of_capital'`, `purpose = 'reopen'`) with the body above. No manual registration step. Sending it before Meta approves fails at Twilio; the deploy waits for the approval (Migration Plan).

7. **Evals.** `evals/stages.ts` fixture templates gain `purpose`; a new case `dec_xx`: window closed, thread with a delivered intro and a client message 3 days ago, `wa.templates: ["capital_intro", "capital_update"]`, expects `message_kind: template` with the update template and a `template_excludes: ["capital_intro"]`-style assertion (added to the judge/asserts if missing).

## Risks / Trade-offs

- [Deployed before Meta approves the template] → Twilio refuses the send and the draft fails; deploy after the status shows "approved" (Migration Plan step 1).
- [Meta rejects the Utility template text] → Reword and resubmit in Twilio; the new SID replaces the one in migration 064 before it ships (or a follow-up migration if it already did). The rule and the code do not depend on the wording.
- [A client whose first message is held (first-message approval) and who is resumed days later] → No `sent` outbound exists, so the intro is still usable; unchanged behavior.
- [`hasDeliveredOutbound` counts a `sent` intro whose Twilio delivery failed] → Same as today's window logic: the row says sent; the reopen template is still the right message.

## Migration Plan

1. Owner: wait until the Twilio console shows `capital_declaration_update` as "approved" (submitted 2026-10-15).
2. Run migration 064 locally (`npm run db:migrate`); production runs it on deploy.
3. Deploy. Rollback: revert the code; the column and the seeded row are additive and harmless (the planner never sees a `reopen` row without the purpose filter).
