## Why

The first WhatsApp message a client receives (`capital_declaration_intro`) gives the client no way to say "no": a client who does not want the agent's help simply goes silent and keeps receiving reminders until the collection window ends. The owner chose a new opening message with two buttons, "נתחיל כאן בוואטסאפ" and "לא, אטפל בזה בעצמי", built in the Twilio Content Template Builder on 2026-11-01 (Content SID `HX9bcbb5536239a542c74a772f4a0e70d3`, Hebrew, Utility, 3 variables, submitted for Meta approval). The agent must send only that message from now on, and must know what to do when the client declines.

## What Changes

- A new seeded `intro` template, `capital_declaration_intro_v2` (SID `HX9bcbb5536239a542c74a772f4a0e70d3`), replaces `capital_declaration_intro` for the declaration-of-capital agent. The old row is deleted from every database, so the planner can never choose it again. **BREAKING** for a database that has the old intro only: the migration swaps the rows in place.
- The body states that a client who prefers not to use the chat must contact the office themselves and hand over every document directly; the two quick-reply buttons carry the choice.
- A client's decline, by the button or in words, stops the collection: the agent sends one fixed acknowledgement, the client is paused and marked declined, the pending send is cancelled, and the accountant receives one email that the client declined and will deliver the documents to the office. The planner never argues with a decline.
- A declined client shows the handed-off state in the workspace (badge, tiles, overview dot), with its own wording ("הלקוח סירב"); the accountant can resume the client as with an overdue stop.
- The planner gets one new tool, `client_declined`, for a refusal written in words; the button tap is recognised by code without a planner run.

## Capabilities

### New Capabilities
- `client-decline`: what happens when a client declines the WhatsApp collection: recognition of the decline (button or words), the acknowledgement, the stop, the accountant email, the workspace state and the resume.

### Modified Capabilities
- `whatsapp-templates`: the platform's intro template is now `capital_declaration_intro_v2` with a decline button; the old intro is removed. (The capability's first requirements are the delta of the not-yet-archived change `closed-window-reopen-template`; this delta adds to it.)

## Impact

- `migrations/071_intro_template_v2.sql` (new): insert the v2 row, delete the old intro row.
- `src/webhook/onInboundWhatsApp.ts` + `src/agents/types.ts`: the inbound hook passes the quick-reply button payload.
- `src/agents/declarationOfCapital/`: `index.ts` (decline before re-plan), new `clientDecline.ts` (recognition, acknowledgement text, hand-off routine), `decisionTools.ts`/`decisionSchema.ts` (`client_declined` tool), `plan.ts` (acting on the tool), `prompt.md` (decline rule), `notifyAccountant.ts` (`declined` email kind).
- `src/db/queries/clients.ts` (`markDeclined`, clearing on resume/due-date), `src/api/workspace.ts` + `router.ts` (resume clears the declined marker), `src/db/queries/dashboard.ts` (handed-off counts include declined).
- `web/src`: `format.ts` (`isDeclined`), `ClientHeader.tsx`, `StatTiles.tsx`, `Overview.tsx`, i18n strings.
- `evals/`: fixture templates renamed, one planner case for a typed refusal.
- `docs/agents.md`, `docs/pipeline.md`: the new functions and the template prerequisite.
- Production: needs migration 071 and Meta approval of the v2 template before deploy; until approval, Twilio refuses the send.
