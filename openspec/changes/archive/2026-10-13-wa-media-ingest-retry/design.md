## Context

See proposal.md — Why. Both ingest paths (`src/webhook/ingestWaMedia.ts`, `src/webhook/ingestAttachments.ts`) run inside the client's in-flight turn (`withInboundInFlight`, openspec `inbound-turn`), download bytes with one `fetch`, upload to Blob Storage under a deterministic key, insert into `document_files` with `insertIfNew` (unique on the provider attachment id), then analyse. Each item is wrapped in one try/catch that only logs. The turn's maximum wait is `INBOUND_MAX_WAIT_SECONDS` (300 s), so a few seconds of retry delay is safe. Every step in the admin trace is an `audit_events` row (`recordAudit`), and the step modal renders unknown detail fields generically.

## Goals / Non-Goals

**Goals:**
- One shared retry policy for both channels, testable without network.
- A lost file is visible where admins already look (trace step) and to the planner (transcript note).
- No schema change, no new env var.

**Non-Goals:**
- Retrying the analysis stage (splitting, classification); a failed analysis already counts as finished (`inbound-turn`).
- A manual "re-download" button in the workspace. Admins can re-run the ingest with a script; a UI for that is a separate change.
- Telling the client automatically without the planner: the reply stays a planner decision.

## Decisions

1. **Retry unit = the whole fetch + upload + insert of one item.** Alternative: retry only the `fetch`. The blob upload can also fail transiently, and both steps are idempotent (deterministic blob key overwrites in place; `insertIfNew` is unique on the provider attachment id), so retrying the unit is simpler and covers both. Analysis runs once, after the insert, outside the retry.

2. **Policy: 3 attempts, pauses of 2 s then 8 s, every error retried.** Alternative: retry only network errors and 5xx. The failing request is authenticated and the URL came from the provider, so a 4xx is almost always transient too (signed-URL clock skew, 429). Three cheap attempts beat an error classifier we cannot test against real provider errors. The policy lives in a small pure module (`src/webhook/ingestRetry.ts`: `withAttempts(fn, { attempts, delaysMs, sleep })` returning `{ value, attempts }` or throwing an error that carries the attempt count and the last error as `cause`) so the unit test needs no network.

3. **Failure = audit row `file.ingest_failed`, severity `warning`, actor `system`, target the inbound message row.** Detail: `channel`, `providerAttachmentId`, `index`, `contentType`, `fileNameHint`, `attempts`, `error` (first line of the last error, cause chain included, capped), `clientName`. The callers pass a small context `{ clientId, agentInstanceId, clientName }` instead of the bare `clientId` so the row carries the instance like every other step. Alternative: a column on `emails`. Rejected: needs a migration and would not show in the trace.

4. **Planner note comes from the audit rows, not a new table.** `plan.ts` loads the client's `file.ingest_failed` rows (new `auditEvents.listForClientAction(clientId, action)`), drops those whose `providerAttachmentId` now exists in `document_files` (a later delivery stored it), groups the rest by `targetId` (message row), and `buildThreadTranscript` prints under that message a block of the form: "Attachments the client sent with this message that the platform could NOT store (download failed after N attempts): - <hint> (<type>) — this file is NOT available; ask the client to send it again." Alternative: put the note in the planner state block. Rejected: the note belongs next to the message it explains.

5. **UI: labels only.** `codeGateLabels['file.ingest_failed']` and detail-field labels in `web/src/i18n.tsx`; no new component. The row uses the default step glyph; severity `warning` needs no new styling.

## Risks / Trade-offs

- [Retries lengthen the in-flight window by up to ~10 s per lost file] → far below the 300 s maximum wait; the quiet window restarts anyway.
- [A permanent error (provider deleted the media) costs three attempts] → three attempts and 10 s is negligible; the step row then explains it.
- [Twilio redelivers the webhook while our retries are still running] → the second run's `insertIfNew` and deterministic blob key keep one file; at worst two failure rows for one file, which the trace tolerates.
- [`fileNameHint` from a WhatsApp body is untrusted client text] → passed through the existing inline sanitizer before it reaches the transcript, and shown in the modal in its own writing direction like every other value.

## Migration Plan

Deploy with the normal push; no migration. Rollback = revert the commit; existing `file.ingest_failed` rows stay in the trail and render generically.
