## Why

When the collection window ends (30 days by the agent's setting), the agent goes silent: the client is paused and the accountant gets an email, but the client is told nothing. The client does not know the conversation stopped, who handles the file now, or where to send what is still missing.

## What Changes

- On the morning of the first business day after the agent stopped a client because the collection window ended, the client receives one fixed WhatsApp message: the conversation here has ended, the documents are being forwarded to the tax advisor, the advisor's name and contact email, and thanks for the cooperation.
- The message is a fixed approved WhatsApp template (`finish_conversation`). No LLM writes or picks it, and it is not held for review.
- A business day is Sunday to Thursday that is not a holiday and not a holiday eve (the same calendar the agent already uses for proactive messages). The morning is 09:00 in the accountant's timezone.
- The advisor is the tax advisor stored on the client. A client without a stored advisor email gets the accountant's name and email instead.
- The message is not sent when the accountant resumed the client or set a new due date before that morning.
- WhatsApp templates get a third purpose, `handoff`. The planner is never offered a `handoff` template.
- The collection window itself does not change: the number of days stays the admin's setting, the stop and the email to the accountant stay as they are.

## Capabilities

### New Capabilities
- `handoff-notice`: the fixed message the client receives after the agent stopped at the end of the collection window: when it is sent, what it says, who it names, and when it is skipped.

### Modified Capabilities
- `collection-window`: "the agent sends no further message after the stop" gets one exception, the handoff notice.
- `whatsapp-templates`: a third template purpose, `handoff`, that the planner is never offered; the seeded `finish_conversation` template.

## Impact

- New daily job in the worker (09:00 local) next to the overdue scan (`src/queue/overdueScanWorker.ts`, `src/worker.ts`).
- New module in `src/agents/declarationOfCapital/` for the notice (who gets it, the variables, the send); `docs/pipeline.md` lists its functions.
- `src/agents/shared/sendAtGuard.ts`: the blocked-day test is exported for reuse.
- `src/twilio/sendAndRecord.ts`: a template send that records the message on the client's timeline.
- `src/db/queries/clients.ts`: list / claim / release queries on a new `agent_fields.handoff_notice_sent_at` marker; a new due date clears it.
- `src/agents/declarationOfCapital/templatePurpose.ts`, `src/db/types.ts`, `src/api/waAdmin.ts`, the admin template screen: the `handoff` purpose.
- Two migrations: the purpose check, and the template seed. The seed needs the template's Twilio Content SID, which exists only after the owner creates the template and Meta approves it.
- No change to the planner prompt's rules, the decision schema, or the workspace UI beyond the message showing on the timeline.
