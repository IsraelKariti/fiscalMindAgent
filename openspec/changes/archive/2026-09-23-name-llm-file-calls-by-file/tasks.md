## 1. Storage

- [x] 1.1 Add `migrations/059_llm_calls_document_file.sql` adding the nullable `document_file_id UUID` column to `llm_calls` (no FK, no index, header comment explaining why) and verify `npm run db:migrate` applies it and `\d llm_calls` shows the column
- [x] 1.2 Extend `LlmCallRow`, `LlmCallListRow`, `InsertLlmCall` and `insert()` in `src/db/queries/llmCalls.ts` with `document_file_id` / `documentFileId`; extend `list()` and `getById()` with `LEFT JOIN document_files` returning `document_filename`; verify `npm run typecheck` passes

## 2. Recording at the source

- [x] 2.1 Add `documentFileId?: string | null` to `LlmCallLogContext` in `src/gemini/generate.ts` and copy it into the row in `logLlmCall` (`null` when absent); verify the evals file sink still writes valid JSONL (`npm run evals -- --help` or a one-case run) with the new field null
- [x] 2.2 Pass `documentFileId: file.id` at the splitting and classification call sites in `src/agents/declarationOfCapital/analyzeInboundFile.ts` and at the extraction call in `src/agents/declarationOfCapital/verifyDocument.ts`; verify by sending one PDF to a local test client and checking `SELECT purpose, document_file_id FROM llm_calls ORDER BY created_at DESC LIMIT 5` shows the file id on the three per-file purposes and NULL on `generate_message`

## 3. API

- [x] 3.1 Map `documentFileId` and `documentFileName` in `toAdminCall` (`src/api/llmAdmin.ts`) so both the conversation endpoint and `GET /admin/llm-calls/:id` return them; add the two fields to `LlmCallSummary` in `web/src/api.ts`; verify with `curl` (admin session) that the conversation JSON carries them and an accountant session still gets no `calls` (existing behaviour)

## 4. Web

- [x] 4.1 In `web/src/components/Timeline.tsx`, give `CallChip` access to the timeline's files (extend `StepFilesProps` with a by-id lookup or a `labelFor(fileId)` function and pass it from `TraceRow`), and render `stage · fileLabel` where `fileLabel` = `attachmentLabel(file)` of the loaded file, else `call.documentFileName`, else nothing (no trailing separator); the file part in its own `dir="auto"` span with ellipsis styling in `styles.css`; verify in the browser under impersonation that three classified files show three distinct chips, a split child reads "… · scan.pdf · pages a-b", a labelled child shows its display name first, and a `Generate Message` chip is unchanged
- [x] 4.2 In `web/src/components/admin/AdminLlmCalls.tsx` `CallDetailModal`, show `documentFileName` as a badge beside the stage key when present (new i18n key `adminLlmCallFile` = "קובץ"); verify opening a chip from 4.1 shows the same name and a `generate_message` call shows no badge
- [x] 4.3 In `web/src/components/admin/AgentConversationsCard.tsx`, append ` · <documentFileName>` after the stage key when present; verify in the admin conversation viewer for the same client
- [x] 4.4 Verify an old row (recorded before 059, `document_file_id` NULL) renders a plain chip, modal and viewer line with no empty separator

## 5. Wrap-up

- [x] 5.1 Run `npm run typecheck` and `npm test`, then commit per the repo's git workflow and note in the memory file that production needs migration 059
