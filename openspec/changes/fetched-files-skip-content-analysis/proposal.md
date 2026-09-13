## Why

Files the platform fetches itself (tax authority, Altshuler Shaham, Harel) are saved, linked to their document, and verified, but the content-analysis step is never run for them because they already know their target. Their analysis status stays at the database default "pending", so the documents card now shows "טרם נותח" (not yet analyzed) under every fetched file, and the agent prompt calls them "not analyzed yet". Both are misleading: the file was checked, just by a different step.

## What Changes

- A new analysis status value, `not_needed`, means "the platform fetched this file itself; content analysis does not apply". Tax-fetch delivery stores it at insert time, so a fetched file is never visible as pending.
- Existing fetched files (provider attachment ids starting with `taxfetch-`) that are still pending are backfilled to `not_needed` by a migration.
- The documents card shows a neutral "הובא אוטומטית מהאתר" (fetched automatically from the site) badge for such files, with a tooltip, instead of "not yet analyzed".
- The agent prompt describes such a file as "content analysis: not applicable (platform-fetched, already linked to its document)" instead of "unavailable (not analyzed yet)".
- Evidence rules are unchanged: a `not_needed` file is not quarantined and does not count as client-supplied evidence. Fetched files are linked by code, not by the planner.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `document-fetch`: a fetched file is recorded as exempt from content analysis at delivery, and the agent is told so.
- `workspace-documents`: the per-file analysis line shows a "fetched automatically" badge for exempt files instead of "not yet analyzed".

## Impact

- `src/db/types.ts`, `web/src/api.ts`: `FileAnalysisStatus` gains `not_needed`.
- `src/db/queries/documentFiles.ts`: insert accepts an initial analysis status.
- `src/agents/declarationOfCapital/taxFetch/deliver.ts`: passes `not_needed`.
- `src/agents/declarationOfCapital/prompt.ts`: new wording for the status.
- `migrations/057_fetched_files_analysis_not_needed.sql`: backfill (data only, no schema change; the column is TEXT without a CHECK).
- `web/src/components/DocumentsCard.tsx`, `web/src/i18n.tsx`: new badge and strings.
- Local DB and prod need migration 057 (prod runs migrations on deploy).
