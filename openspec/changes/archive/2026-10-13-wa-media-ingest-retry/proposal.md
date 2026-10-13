## Why

On 2026-09-24 a client sent a 1.6 MB PDF over WhatsApp. Twilio received it, but our one download attempt failed, so the file never reached storage or the database. The only record of the failure was one error line in the dev terminal. The planner then saw a message with a file name and no file, and drafted "the file itself did not arrive". Nothing in the workspace or the trace shows that a file was lost, and nothing retries a download that would have succeeded a moment later (the same download works now).

The same one-shot pattern exists for email attachments (Resend download), so the fix covers both inbound file channels.

## What Changes

- A file sent by a client (WhatsApp media, email attachment) is downloaded and stored with a bounded retry: a failed attempt is repeated a few times with a short pause before giving up.
- When every attempt fails, the platform records the failure as an audited code step on the client's timeline (admin trace), with the channel, the message it belongs to, the file's name hint and type, the number of attempts and the error. Today the failure is only printed to the process log.
- The planner is told, under the message in the thread transcript, that a file sent with that message could not be stored, so it asks the client to send it again instead of guessing from the file name.
- Files that are stored keep today's behavior (same names, same blob keys, same analysis).

## Capabilities

### New Capabilities
- `inbound-files`: how a file a client sends (WhatsApp media, email attachment) is downloaded and stored, what happens when that fails, and how the failure is shown to admins and to the planner.

### Modified Capabilities
- (none) — the trace already shows every audited step of a client; the new step row rides on the existing conversation-trace requirements.

## Impact

- `src/webhook/ingestWaMedia.ts`, `src/webhook/ingestAttachments.ts`: retry loop, audit row on final failure; callers pass the client's instance and name for the audit row.
- New small pure module for the retry policy, with a unit test.
- `src/audit/audit.ts`: new action `file.ingest_failed`.
- `src/db/queries/auditEvents.ts`: one query for a client's rows of one action (feeds the planner note).
- `src/agents/declarationOfCapital/plan.ts` + `prompt.ts`: the thread transcript gains a "file could not be stored" line under the message.
- `web/src/i18n.tsx`: label for the new step and its detail fields (the step modal already renders unknown fields generically).
- `docs/agents.md`: audit action list.
- No migration, no new env var, no change to the WhatsApp/Twilio setup.
