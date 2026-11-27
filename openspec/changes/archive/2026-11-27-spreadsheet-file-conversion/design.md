## Context

Every model read of a received file goes through one of three call builders that take `{ bytes, contentType, filename }` and put the bytes in a Gemini `inlineData` part: `buildFileScreenCall` (injection screen), `buildAnalysisCall` (classifier) and `buildExtractionCall` (extractor). Gemini accepts PDF, images, audio, video and plain text as inline parts, not office formats, so `isAnalyzable` (`analyzeFile.ts`) keeps the PDF+image allowlist and `skipUnsupportedFile` marks everything else `unsupported` before any call. The code-side regex injection layer reads a text layer that `extractFileText` (`fileText.ts`) builds for PDFs only. The admin document routes (step, call, workspace files) all stream through `streamFile` + `fileDisposition`, and the two web panes (`DocumentPane`, `FileViewModal`) decide on preview from the content type.

The evals harness (`evals/stages.ts`) calls the same three builders on fixture files from `evals/files/`, which `make-files.ts` generates.

## Goals / Non-Goals

**Goals:**
- One code path that turns a spreadsheet into the exact text the model reads, reused by the three call builders, the regex layer, the admin inline view and the evals harness.
- No change to the stored file, the DB schema, the planner prompt or the gates.

**Non-Goals:**
- Reading legacy `.xls`, Word, or any other office format (a later change can add a renderer per format behind the same helper).
- Rendering a spreadsheet to PDF or an image. Text is what the data is; a picture would only cost OCR.
- Storing the rendering. It is deterministic and cheap to rebuild from the blob (the Altshuler file is 11 KB).

## Decisions

**D1 — A "model file" helper, not a stored conversion.** New `src/agents/shared/modelFile.ts` exports `toModelFile({ bytes, contentType }) → Promise<{ bytes, contentType, text: string | null }>`: PDF and images pass through untouched (`text` = the PDF text layer or null); a spreadsheet returns `Buffer.from(rendering)` with `text/plain` and `text` = the rendering. The three call builders keep their signature; the callers (`screenFileForAttackText`, `classifyAndStore`, `extractDocumentData`, and the evals stage functions) pass the model file instead of the raw one. Alternative considered: converting at ingest and storing a child file with `text/plain`. Rejected: it would add a second row per spreadsheet to the Documents tab and the split/child machinery, for no gain.

**D2 — Rendering rules live in `src/agents/shared/spreadsheetText.ts`.** `renderSpreadsheetText(bytes, contentType): Promise<string>`: workbook via `exceljs` (`Workbook.xlsx.load`), CSV by a small code parser (UTF-8 with optional BOM, quoted fields with doubled quotes, comma or semicolon delimiter chosen by count on the first line). Output format per the spec: `--- sheet: <name> ---` line, then rows joined by `\t`, empty rows skipped, trailing empty cells dropped, dates as `dd.mm.yyyy`, formula cells by their `result`, rich-text cells flattened, caps 2,000 rows/sheet and 60,000 chars with a final `[… cut]` line. Throws on a workbook it cannot open; the caller maps that to `failed`. Alternatives: SheetJS `xlsx` (npm build is stale, 0.18.5, with open advisories — rejected); hand-parsing the zip + XML (no dependency, but shared strings, inline strings, date serials and rich text each add their own branch — rejected for now; the helper's interface lets us swap later).

**D3 — The text layer for the regex layer is the rendering.** `extractFileText` becomes async-capable: `toModelFile` returns `text`, and `screenFileForAttackText` uses it for the regex layer in place of `extractFileText(body, contentType)`. The PDF path is unchanged (still the sync `extractPdfText`). The evals `injection_detection_regex` stage reads the same `text`.

**D4 — `isAnalyzable` learns two types and a lower cap.** Add `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` and `text/csv` with a 5 MB raw-size cap (a 5 MB workbook renders far below the 60k-char cap anyway). `verifyDocument.loadCheckableFile` keeps using `isAnalyzable`, so a tied spreadsheet reaches extraction. A render failure inside `analyzeInboundFile` marks the row `failed` (existing status, existing planner line) and skips the model; inside `extractDocumentData` it stalls the item with a "file could not be read" reason (existing stall path).

**D5 — Inline view serves the rendering.** `streamFile(res, file, 'inline')` for a spreadsheet type answers `text/plain; charset=utf-8`, inline, with the rendering (nosniff header kept); `'attachment'` still streams the blob. `fileDisposition` is unchanged for every other type. The web panes add a third branch: for a spreadsheet content type, fetch the inline URL as text and show it in a `<pre dir="auto">` block; "open full size" links to the inline URL (the browser shows plain text). Since the server answers `text/plain`, nothing is ever interpreted as HTML.

**D6 — WhatsApp extension map.** `EXTENSION_BY_TYPE` in `ingestWaMedia.ts` gains the two spreadsheet types. No change for email attachments (they keep the sender's file name).

**D7 — Evals.** `make-files.ts` writes `altshuler_loan_balances_2025.xlsx` with `exceljs` (the real file's layout: a "תיאור / ערך" header, one row per field, two value columns for the two loans, "נכון לתאריך" = 31.12.2025). One `file_classification` case (checklist has a `loan_taken` item for Altshuler Shaham) and one `extract_document` case (`loan_taken`, remaining balance + as-of date). The stage functions route the file through `toModelFile` so the eval sees the same text as production.

## Risks / Trade-offs

- [A provider's sheet may hold several documents (one per loan) in one table] → The classifier already answers `holdings` with up to 20 entries; the Altshuler sheet is one document of one loan type with two loans, which the existing per-item split handles. No new split logic.
- [The rendering loses layout: merged headers, colours, column widths] → Balance sheets are label/value tables; the tab-separated form keeps the label next to its value, which is what the extractor needs. Evals will show if a real sheet confuses the model.
- [`exceljs` is a large dependency (~3 MB with jszip and saxes)] → Server-side only, loaded lazily inside the renderer module so the web process start time is unaffected. Pinned exact version.
- [A zip bomb in an `.xlsx`, or a slow parse on the web process] → File analysis runs on the web process (the webhook path), like the PDF text layer today, so the renderer must stay bounded: the 5 MB raw cap, the 2,000-row and 60,000-char caps, and a stop as soon as a cap is hit (no parse of further sheets). `exceljs` inflates entries through streams, so a 5 MB file that inflates to hundreds of MB is cut by the row cap before it is all read; the renderer also refuses a workbook whose inflated sheet entry exceeds 50 MB.
- [The same sheet may be rendered three or four times per file (screen, classify, extract, admin view)] → Each render is milliseconds for the sizes involved; not worth a cache.

## Migration Plan

- `npm install exceljs` (exact version), `npm run typecheck`, `npm test`, `npm run evals -- --stage file_classification,extract_document` for the two new cases.
- No migration, no env var. Deploy as usual; files already stored as `unsupported` are not re-analyzed (the client can resend, or the admin can re-run analysis if that action exists).
- Rollback: revert the commit; stored spreadsheets go back to `unsupported`.
