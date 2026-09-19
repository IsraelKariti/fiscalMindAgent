## Context

See `proposal.md` for the motivation. The facts in the code that shape the design:

- `analyzeInboundFile.ts` is the single entry point for every inbound file (email attachment and WhatsApp media both reach it through `webhook/analyzeStoredFile.ts`, which already holds the file bytes). Its order today: analyzable check → three injection layers → `analyzeFile` (classifier) → `validate_classification` audit → `documentFiles.setAnalysis`.
- The classifier (`analyzeFile.ts` + `analyzeFileRules.ts`) returns one verdict and one `matched_document_id` per file. The owner wants it to stay that way: a classifier call analyzes one document.
- `document_files.client_document_id` is a single column: a file links to one checklist row. Several files per row already work (`workspace-documents` spec, multi-employer 106 forms).
- `verifyDocument.ts` extracts name, id, date and amounts from the whole linked file. A mixed file would mix these fields.
- `document_files.provider_attachment_id` is UNIQUE and is the dedupe key of `insertIfNew`. `analysis_status` is TEXT with no CHECK constraint (migration 057 added `not_needed` without a schema change).
- The planner prompt lists files per inbound message by `email_id` (`prompt.ts`), with one `formatFileAnalysis` line per file. `plan.ts` links every planner-proposed pair unless the file is quarantined.
- The workspace files endpoint returns `SELECT *` rows, so new columns reach the UI without an API change. Deleting a client removes the blob of every file row.
- The repo has no PDF library. Every LLM stage follows the `add-llm-stage` checklist: pure rules module, gate with a `checks` list, audit row, purpose registration, stage description, eval adapter, docs.

## Goals / Non-Goals

**Goals:**
- Keep the classifier, the evidence rules, linking and verification unchanged: after the cut, every child is an ordinary one-document file.
- Make the model's output as small as possible (page numbers only drive behavior), so code can check all of it.
- Fail open to today's behavior: any problem in the new step means "no split", never a lost or failed file.
- Keep the original file reachable for the accountant.

**Non-Goals:**
- Mixed-order scans (pages of one document that are not consecutive).
- Merging several files (for example three photos) into one document.
- Splitting multi-page images (TIFF) or files above the 14 MB analysis limit; they keep today's behavior.
- Re-splitting files that were received before this change.
- Any change to the classifier prompt, schema or gate.

## Decisions

### 1. A separate stage before the classifier, not page ranges inside the classifier
The new stage `file_splitting` answers only "which pages form each document". The classifier keeps its contract of one file, one verdict.
- Why: the owner's rule that a classifier call analyzes a single document; the split answer is fully checkable by code (numbers against a known page count), while a combined answer would mix checkable ranges with uncheckable per-segment verdicts; evals stay simple (one question per stage).
- Alternative considered: the classifier returns segments with a match each. Rejected for the reasons above, and because a wrong range would silently corrupt the match of the same call.

### 2. Names and modules (per the `add-llm-stage` pattern)
- purpose `file_splitting`; gate step `validate_file_split`.
- `src/agents/declarationOfCapital/splitFileRules.ts`: zod schema and the pure gate `validateFileSplit(raw, pageCount)`.
- `src/agents/declarationOfCapital/splitFile.ts`: `FILE_SPLIT_PROMPT`, `buildFileSplitCall`, and the runtime function that calls `runLlmCall`, runs the gate and returns the accepted ranges.
- `src/agents/declarationOfCapital/pdfPages.ts`: the only module that imports `pdf-lib`: `readPdfPageCount(bytes)` and `cutPdf(bytes, ranges)`.

### 3. Model output schema
```
{ documents: [ { first_page: int, last_page: int, kind: string } ] }
```
`kind` is a few words naming what the pages look like (for example "bank balance confirmation"). It is written only to the audit row (sanitized, capped at 80 characters) so an admin can see why the model split where it did. No code path branches on it and it never reaches the planner prompt or the UI. Temperature 0.1, like the classifier.
- Alternative considered: ranges only. Rejected: the audit trail and the eval report would show bare numbers, which makes wrong splits hard to understand.

### 4. Where the step sits in `analyzeInboundFile`
```
isAnalyzable? --no--> 'unsupported' (as today)
   |
injection layers (whole file) --hit--> 'blocked' (as today)
   |
PDF and readPdfPageCount >= 2 ? --no--> classify (as today)
   |yes
file_splitting call -> validate_file_split -> audit row
   |
rejected / error / 1 document --> classify whole file (as today)
   |
2+ documents: cutPdf -> store children -> parent 'split' -> classify each child
```
The classify-and-store part of `analyzeInboundFile` (from `listForClient` to `setAnalysis`) is extracted into one internal function that takes a file row and its bytes. The whole-file path and the per-child path both call it, so children get the same `validate_classification` audit row and usage accounting. The whole split block sits in its own `try/catch`: any throw logs an error and falls through to the whole-file classify.

### 5. Children skip the injection layers
The regex and the LLM screen already covered every page of the parent. Children contain a subset of the same bytes. Running the screen again would cost one more LLM call per child for no new information. The classifier's own `injection_suspected` flag and the extractor's flag still apply to each child, so two later layers remain.

### 6. Storage of children
- Migration `058_document_files_split.sql`: `parent_file_id UUID NULL REFERENCES document_files(id) ON DELETE CASCADE`, `page_from INT NULL`, `page_to INT NULL`, an index on `parent_file_id`. No CHECK change for `analysis_status` (none exists); the TypeScript union gains `'split'`.
- Child row: same `client_id` and `email_id` as the parent (so the planner lists it under the same message), `provider_attachment_id = <parent's>#p<from>-<to>` (deterministic, so `insertIfNew` makes a retry idempotent), `blob_key = clients/<clientId>/<parent attachment id>/split/p<from>-<to>.pdf`, `filename = <parent base name>-p<from>-<to>.pdf`, `content_type = application/pdf`, own `size_bytes` and `sha256`, `analysis_status = 'pending'`.
- Order: upload and insert all children first, then set the parent to `'split'`, then classify the children one by one. If the process dies before the parent is marked, a later run re-inserts nothing (dedupe) and the state is still consistent; children left `'pending'` show as "not yet analyzed", the same outcome a crash has today.
- Alternative considered: no child files, a join table file↔document with page ranges, and verification told which pages to read. Rejected: it changes linking, evidence rules, verification, the planner and the UI, and extraction over mixed pages is less reliable than over a cut file.

### 7. The parent after a split
`analysis_status = 'split'`, `analysis = NULL`, `client_document_id` stays NULL.
- `fileEvidence.ts`: `isQuarantined` returns false for it (it is not suspicious), and `fileMatchesDocument` / `isVerifiedLegibleFile` already return false because the status is not `'done'`. No change needed there beyond a comment.
- `plan.ts`: proposed pairs whose file has status `'split'` are dropped before linking and before the collected/claimed decision, next to the existing quarantine skip.
- `prompt.ts` `formatFileAnalysis`: a new branch, in the style of the `not_needed` line: the file was split into N separate files listed next to it; never use this file as evidence and never match it; judge the split files instead.

### 8. Gate details
Checks run in the order of the `code-gates` delta spec and stop adding range checks after the first failed one, so the list shows only checks that ran. The cap is a constant `MAX_SPLIT_DOCUMENTS = 20`. A single document covering all pages passes the gate with `result: true`; the runtime then simply does not cut. Full coverage is required so no page is silently dropped: a cover page or a blank page must belong to a neighbor range or form its own range (its child will then classify as `other` and land in the unmatched group).

### 9. PDF library: `pdf-lib`
Pure JavaScript, no native build (the app runs in App Service containers and the dev machine is Windows), reads the page count and copies pages between documents. Loaded with `ignoreEncryption: false`, so an encrypted PDF throws and takes the fallback path.
- Alternatives: `pdfjs-dist` (can read but not write PDFs), calling `qpdf` (a native binary to install in every image).

### 10. UI
`DocumentsCard.tsx` gets the new columns from the files endpoint. The badge function gains a `'split'` branch (count = files whose `parent_file_id` is this file). A child renders one extra muted line built from `page_from`, `page_to` and the parent's display name, looked up in the same files array; "page 6" when from equals to. The parent falls into the unmatched group by the existing filter (`client_document_id === null`), so no grouping logic changes. Hebrew strings go to `web/src/i18n.tsx` with the other document-tab strings.

## Risks / Trade-offs

- [The model puts a boundary one page off] → The gate cannot see this. Mitigations: the child with the wrong page usually fails the classifier match or the verification checks and reopens the item with a reason; the parent stays available to the accountant; eval cases measure boundary accuracy before and after prompt changes.
- [The model over-splits one long document (for example a 12-page bank statement into 12)] → The prompt states that a multi-page statement from one issuer is one document; eval cases cover it; the cap bounds the damage; the unmatched group shows the pieces and the parent.
- [Extra cost and latency on every multi-page PDF] → One small call (ranges only). Images and one-page PDFs, the common WhatsApp case, make no call. The admin can pick a cheaper model for the `file_splitting` purpose in the existing per-purpose model setting.
- [Children skip the injection screen] → Accepted: they are byte subsets of a screened file, and the classifier and extractor flags still run per child.
- [Verification attempts] → A child that fails verification reopens its checklist item as today; the client is asked to resend that one document, not the whole scan.
- [pdf-lib cannot parse some scanner output] → Falls back to today's behavior; logged as a warning so the rate is visible.

## Migration Plan

1. Merge with migration 058. Locally run `npm run db:migrate`. Sandbox and production run migrations in their deploy flow.
2. No backfill: old files keep their status; only new inbound PDFs are split.
3. Rollback: revert the code. The three new columns are nullable and unused by old code. Rows with status `'split'` would show as "not yet analyzed" in the old UI; if that matters, run `UPDATE document_files SET analysis_status = 'unsupported' WHERE analysis_status = 'split'`.

## Open Questions

- The exact Hebrew wording of the badge, its tooltip and the page note (decided during implementation, with the other i18n strings).
