## Context

See proposal.md for motivation. Observed in the code:

- `document_files.analysis_status` is TEXT with default `'pending'` and no CHECK (migrations 010, 054). Values today: pending, done, failed, unsupported, blocked.
- `documentFiles.insertIfNew` does not set the status; `setAnalysis` / `setBlocked` overwrite it later and stamp `analyzed_at`.
- Tax-fetch delivery (`taxFetch/deliver.ts`) inserts, links to the target document, marks collected, and runs `verifyCollectedDocument`. It never calls the inbound analyzer (`analyzeInboundFile.ts`), which is the only writer of `done`.
- Readers of the status: `fileEvidence.ts` (quarantine + evidence rules), `prompt.ts` (`formatFileAnalysis`), `DocumentsCard.tsx` (`AnalysisLine`), `Timeline.tsx` (blocked-only check). There is no retry scan that picks up pending files.
- Fetched rows are identifiable by `provider_attachment_id LIKE 'taxfetch-%'`.

## Goals / Non-Goals

**Goals:**
- A fetched file is never observable as "pending" (not in the UI, not in the prompt, not in the database after delivery).
- Existing fetched rows are corrected once.

**Non-Goals:**
- Running the content analyzer on fetched files. Verification already checks them, and the analyzer's job (match a file to a document) is moot for them.
- Changing evidence rules. `not_needed` deliberately stays outside `isVerifiedLegibleFile` / `fileMatchesDocument`.
- Exposing the file source (WhatsApp vs fetch) as a separate API field. The status value carries the one fact the UI needs.

## Decisions

1. **Set the status at insert time, not in a follow-up update.**
   `insertIfNew` gains an optional `analysisStatus?: 'pending' | 'not_needed'` (default `'pending'`). Alternative: call `setAnalysis(file.id, 'not_needed', null)` right after insert. Rejected: that leaves a window where the row reads pending and would stamp `analyzed_at`, which should mean "the analyzer ran".

2. **Name the value `not_needed`.**
   It describes the analysis, not the source, which keeps the status column about one thing. Alternative `fetched` was rejected as a source label living in an analysis column.

3. **Backfill by a data-only migration (057).**
   `UPDATE document_files SET analysis_status = 'not_needed' WHERE analysis_status = 'pending' AND provider_attachment_id LIKE 'taxfetch-%'`. No schema change; the column has no CHECK. Alternative: fix rows by a one-off script. Rejected because prod runs migrations on deploy and a script would need a manual step.

4. **Prompt wording.**
   `formatFileAnalysis` gets an explicit branch before the "unavailable" fallback: `content analysis: not applicable — the platform fetched this file itself from the provider site and linked it to its document`. This keeps the agent from asking the client to resend a file the platform obtained.

5. **UI badge.**
   `AnalysisLine` gets a `not_needed` branch: `badge-neutral`, text "הובא אוטומטית מהאתר", tooltip explaining that the file was fetched by the platform and checked by verification, so content analysis does not apply. The approved row's verification summary (issuer · date · amount) stays as today.

## Risks / Trade-offs

- [A future code path inserts fetched files without the flag] → the default stays `pending`, so the failure mode is the current wording, not data loss. The delivery path is the only fetch writer today.
- [Old front-end bundle meets the new status] → falls into the generic "not done" branch and shows "not yet analyzed", same as today. No crash.

## Migration Plan

1. Deploy code and migration 057 together (worker startup runs migrations in prod). Locally run `npm run db:migrate` after pulling.
2. Rollback: revert the commit. Rows already set to `not_needed` are harmless to old code (generic "not done" branch).
