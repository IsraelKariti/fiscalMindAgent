## Why

A file cut out of a multi-document PDF is named after the original file and its page range (`scan-p1-2.pdf`). The name says where the pages came from, not what they are, so the accountant has to open every cut file to know which one is the bank confirmation and which one is the ID copy. The meaning is known one step after the cut, when the classifier matches the cut file to a document on the client's list — but it is never used for the name.

## What Changes

- When the classifier matches a cut file (a child of a split PDF) to a document on the client's list, and the code gate accepts the match, the cut file gets a display name: the name of the matched document. The text comes from our own list, not from the model's free text and not from the client's file.
- The display name is what the documents list, the file viewer and the conversation show for that file. The original file's name and the page range stay visible next to it, so the source of the pages is never lost.
- The conversation attachment of a named cut file reads `<document name> · <original name> · pages X-Y` instead of `<original name> · pages X-Y`.
- Downloading a named cut file saves it under a name built from the document name, the original file's base name and the page range (for example `אישור יתרות - בנק לאומי (scan p1-2).pdf`).
- A cut file that matches no document, that is quarantined (not legible or suspected injection), or whose analysis failed keeps today's page-range name everywhere.
- When the planner later links a cut file to another list document than the one the classifier matched, the display name follows the link, so the name never disagrees with the row the file sits under.
- The stored file name (`<original>-p<from>-<to>.pdf`), the storage key and the idempotency key of a cut file do not change. The planner keeps seeing the stored file name. Files that were never split are not affected.
- Owner decision (2026-09-19): name from the matched list document only (option 1). The model's short description of the pages stays audit-only and is never used as a name.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `file-splitting`: a new requirement gives a child its display name on an accepted match (and keeps it in step with a later planner link); a new requirement covers the download name of a named child; the requirement about the conversation view changes the label of a named child.

## Impact

- `src/agents/declarationOfCapital/analyzeInboundFile.ts` — after the classification gate, set the display name of a child file that has an accepted match.
- `src/db/queries/documentFiles.ts` — a query that sets `label` on one file row. No migration: `document_files.label` exists (migration 035) and the UI already prefers it over `filename`.
- `src/api/workspace.ts` — download name of a labelled child file.
- `web/src/components/Timeline.tsx` — attachment label of a labelled child keeps the original name and page range.
- `web/src/components/DocumentsCard.tsx`, `FileViewModal.tsx` — already show `label ?? filename` and the "pages X-Y of <original>" line; checked, no change expected.
- A pure helper with unit tests for the two name formats; `docs/agents.md` file-splitting section.
- No new LLM call, no prompt change, no new env var.
