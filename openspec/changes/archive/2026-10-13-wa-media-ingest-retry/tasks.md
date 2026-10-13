## 1. Retry policy

- [x] 1.1 Add `src/webhook/ingestRetry.ts` with a pure `withAttempts(fn, { attempts, delaysMs, sleep? })` that returns `{ value, attempts }` and, after the last failure, throws an error carrying the attempt count and the last error as `cause`; verify with `tests/ingestRetry.test.ts` (succeeds on attempt 2 with one pause, gives up after 3 with the right cause, no pause after the last attempt) added to the `npm test` list.
- [x] 1.2 Add the `file.ingest_failed` action to `AuditAction` in `src/audit/audit.ts`; verify `npm run typecheck`.

## 2. Ingest paths

- [x] 2.1 `src/webhook/ingestWaMedia.ts`: wrap fetch + upload + insert of each item in `withAttempts` (3 attempts, 2 s / 8 s), keep analysis outside the retry, and on final failure log as today and `recordAudit` `file.ingest_failed` (severity warning, target the message row) with channel, providerAttachmentId, index, contentType, fileNameHint (the message body), attempts, last error, clientName; the function takes `{ clientId, agentInstanceId, clientName }` and `onInboundWhatsApp.ts` passes it. Verify with a unit test that stubs `fetch` (500 once then 200 stores once; always 500 records one failure row) and by reading a real row with `npm run step`.
- [x] 2.2 `src/webhook/ingestAttachments.ts` + `onInboundEmail.ts`: same retry and same failure row (fileNameHint = attachment file name, channel email); verify `npm run typecheck` and that the email path still stores a real attachment.

## 3. Planner note

- [x] 3.1 `src/db/queries/auditEvents.ts`: add `listForClientAction(clientId, action)`; `plan.ts` loads the client's `file.ingest_failed` rows, drops those whose providerAttachmentId is now in `document_files`, and passes the rest, grouped by message id, to `buildThreadTranscript`; verify `npm run typecheck`.
- [x] 3.2 `prompt.ts`: under an inbound message with lost files print the "could NOT store … ask the client to send it again" block (hint through the inline sanitizer); verify with a new `tests/lostFilesTranscript.test.ts` added to `npm test`: note printed for a lost file, not printed once the same attachment id is stored.

## 4. Web and docs

- [x] 4.1 `web/src/i18n.tsx`: add `file.ingest_failed` to `codeGateLabels` and labels for `providerAttachmentId`, `index`, `contentType`, `fileNameHint`, `attempts`, `error` in the step-detail label map; verify `npm run typecheck` and, under impersonation, open the step from task 2.1 and see the labelled rows. (Labels added and typechecked; the browser look at step 9e4f9bc8-6f79-41fc-8feb-69e1d17104fa is left to the owner.)
- [x] 4.2 `docs/agents.md`: add the new action to the audit/code-step list and one paragraph on the ingest retry; commit per the Git workflow.

## 5. Live check

- [x] 5.1 Re-ingest the lost file of 2026-09-24 (message MM822c586b8dca90bf3cb1ec306d0aaa6f) with a one-off script that calls the WhatsApp ingest with the Twilio media URL, confirm the file appears in the client's conversation and gets analysed, then delete the script.
