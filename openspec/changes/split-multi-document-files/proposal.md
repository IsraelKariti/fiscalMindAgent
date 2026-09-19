## Why

Clients often scan several documents into one PDF (for example a bank balance confirmation, an ID copy and a loan statement). Today the agent treats one file as one document: the classifier returns a single verdict and a single `matched_document_id`, a file can link to only one checklist row, and verification reads the whole file. So only one of the documents inside the PDF is counted, and the agent asks the client again for documents the client already sent.

## What Changes

- A new LLM stage, `file_splitting`, runs after the injection screen and before the classifier. It runs only for a PDF with two or more pages (code reads the page count; images and one-page PDFs skip it with no LLM call). It answers one question: how many documents are in this file, and which pages belong to each.
- A new code gate, `validate_file_split`, checks the proposed page ranges: every range is inside the file, ranges are in order and do not overlap, every page belongs to exactly one range, and the number of documents is within a cap. It writes one audit row with its checks list, like the other gates.
- When the gate accepts two or more documents, code cuts the PDF into one child PDF per range. Each child is stored as a normal `document_files` row that points to its parent and records its page range.
- Each child goes through the existing classifier, unchanged: one file, one verdict. Linking, evidence rules and verification then work on children as they do on any file today.
- Children skip the injection screen, because the whole parent already passed it.
- When the gate rejects the answer, the stage fails, or the PDF cannot be opened, nothing is cut and the whole file goes to the classifier as today.
- The parent file gets a new analysis status, `split`. It is never classified, never evidence, and never linked to a checklist row. The planner is told it was split and must not use it.
- Workspace documents tab: the parent stays visible in the "files not matched" group with view/download controls and a "split into N documents" badge instead of an analysis line, so the accountant can open the original (for example in a dispute with the client). Each child shows a small note with its page range and the parent's name.
- The classifier stage itself (`file_classification`, its prompt, schema and gate) is not changed.

Known limit: a range is a run of consecutive pages. A scan whose pages are in mixed order will not split correctly. Merging several files into one document (the opposite case) is out of scope.

## Capabilities

### New Capabilities
- `file-splitting`: when the split stage runs, what its gate checks, how a file is cut into children, what happens to the parent, the fallback when the split is rejected or fails, and that the planner never uses the parent as evidence.

### Modified Capabilities
- `workspace-documents`: the content-analysis line gains the "split" badge for a parent file; a child file shows its page range and the parent's name; the parent of a split file stays in the unmatched group.
- `code-gates`: adds the checks reported by the new `validate_file_split` gate.

## Impact

- **New dependency**: `pdf-lib` (pure JavaScript, reads the page count and copies pages into new PDFs).
- **Database**: migration 058 adds `parent_file_id`, `page_from`, `page_to` to `document_files`; `analysis_status` gains the value `split` (TEXT, no CHECK). Production and the local DB must run it.
- **Backend**: `src/agents/declarationOfCapital/analyzeInboundFile.ts` (new step between the screen and the classifier), new `splitFile.ts` + `splitFileRules.ts`, `src/db/queries/documentFiles.ts`, `src/db/types.ts`, `src/agents/shared/fileEvidence.ts`, `prompt.ts` (parent line), `plan.ts` (never link a parent), `src/gemini/modelCatalog.ts`, `src/gemini/llmStages.ts`, `src/audit/audit.ts`.
- **Frontend**: `web/src/components/DocumentsCard.tsx`, `web/src/api.ts`, `web/src/i18n.tsx` (badge, note, purpose, gate and check labels).
- **Evals and tests**: a new adapter in `evals/stages.ts`, `evals/cases/file_splitting.json` with synthetic multi-document PDFs, `tests/splitFileRules.test.ts`.
- **Docs**: `docs/agents.md` (code gates section).
- **Cost**: one extra LLM call for every inbound PDF with two or more pages, plus one classifier call per child instead of one per file.
