## Why

A client sent the loan balances of their Altshuler Shaham study-fund loans as an Excel file over WhatsApp. The platform stored it but marked it "unsupported", because the model is only given PDF and image files, so the agent could only say "the content was not verified yet" and the list item stayed `claimed`. Clients get such balance tables from provider sites as spreadsheets, so the agent has to read them like any other document.

## What Changes

- A spreadsheet file (Excel `.xlsx`, CSV) a client sends is turned by code into a plain-text table (one block per sheet, one line per row, cells separated by tabs) before any model call. The classifier, the file injection screen and the document extraction read that text instead of the raw bytes; the stored file stays the original.
- The text rendering also feeds the code-side regex injection layer, the same way a PDF's text layer does today.
- A spreadsheet that code cannot open (damaged, password-protected) is marked "analysis failed", not "unsupported".
- WhatsApp media of a spreadsheet type is stored with the right file extension (`.xlsx`, `.csv`) instead of `.bin`.
- The admin step modal and the LLM call modal show a spreadsheet file as the same text the model read, instead of "preview unavailable".
- Evals: one classification case and one extraction case on a synthetic Altshuler loan-balance spreadsheet.
- Legacy binary Excel (`.xls`) and Word files stay unsupported (non-goal).

## Capabilities

### New Capabilities
- `spreadsheet-files`: how a spreadsheet a client sends is rendered to text for the model, which formats are covered, the size limits, and how an unreadable spreadsheet is reported.

### Modified Capabilities
- `conversation-trace`: "A file step shows its document beside the details" and "A step's document is served to admins only" — a spreadsheet file is shown (and served inline) as its plain-text rendering instead of "preview unavailable" / download only.

## Impact

- `src/agents/shared/`: new spreadsheet-to-text module; `fileText.ts` returns the rendering as the file's text layer; a shared "what the model is given for this file" helper used by the injection screen, the classifier and the extractor.
- `src/agents/declarationOfCapital/analyzeFile.ts` (`isAnalyzable`), `analyzeInboundFile.ts`, `verifyDocument.ts`, `extractionCall.ts`.
- `src/webhook/ingestWaMedia.ts` (extension map).
- `src/api/fileStream.ts` / `fileDisposition.ts` and the admin document routes: inline view of a spreadsheet serves the text rendering as `text/plain`.
- `web/src/components/DocumentPane.tsx`, `FileViewModal.tsx`: render the text rendering in a `<pre>` for spreadsheet files.
- New dependency: an xlsx reader (`exceljs`); CSV is parsed by code.
- `evals/make-files.ts`, `evals/cases/file_classification.json`, `evals/cases/extract_document.json`; `tests/`; `docs/pipeline.md`, `docs/agents.md`.
