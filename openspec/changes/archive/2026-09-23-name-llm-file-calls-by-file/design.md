## Context

See proposal.md — Why.

- `llm_calls` (migration 049) has `user_id`, `agent_instance_id`, `client_id`, `purpose`, payloads and prices — and no file id. The only trace of the file today is the untrusted text part "שם הקובץ כפי שנשלח: …" inside `request.contents`, which the list query does not return.
- The row is written fire-and-forget by `logLlmCall` in `src/gemini/generate.ts` from a `LlmCallLogContext` the call site passes. `runLlmCall` (`src/gemini/llmCall.ts`) forwards `opts.log` unchanged, filling `purpose` from the spec.
- The three per-file call sites already hold the `document_files` row: `analyzeInboundFile.ts` (splitting at ~line 184, classification at ~line 278) and `verifyDocument.ts` (extraction at ~line 194).
- `GET /api/admin/clients/:clientId/conversation` (`src/api/llmAdmin.ts`) returns `calls` via `llmCalls.list` + `toAdminCall`; `GET /api/admin/llm-calls/:id` returns one call via `getById` + the same mapper.
- The workspace timeline (`web/src/components/Timeline.tsx`) already has every file of the client and an `attachmentLabel(file)` helper that yields the display name / original name / "parent · pages a-b" text used by attachment chips and the split step row. The admin viewer (`AgentConversationsCard.tsx`) has no files list.

## Goals / Non-Goals

**Goals:**
- One nullable column, written at the source, read by the existing list/detail queries.
- The chip label is computed on the client from the timeline's own files list, so a split child, a labelled file and a plain file read exactly like their attachment chips.
- Graceful fallback when the file is gone or the row predates the column.

**Non-Goals:**
- Backfilling old rows (see Decisions).
- Adding the file to the `#/llm-calls` browser table or its filters.
- Making the chip open the file — it keeps opening the call modal; the file opens from the message's attachment chip or the step modal.

## Decisions

1. **Store the file id on `llm_calls`, not in `request`/`detail` JSON.**
   Migration `059_llm_calls_document_file.sql`: `ALTER TABLE llm_calls ADD COLUMN document_file_id UUID;` — no foreign key and no cascade, like `client_id` on the same table (call history must survive client deletion, see the 049 header comment). No index: the only reads are per-client lists already served by `llm_calls_client_idx`.
   *Alternative rejected:* parsing the filename out of the request text — it is the untrusted filename the client chose, it is a name not an id (two files can share a name), and it is absent from the list query.

2. **Carry it through `LlmCallLogContext.documentFileId?: string | null`.**
   `InsertLlmCall`/`LlmCallRow` gain `documentFileId` / `document_file_id`; `logLlmCall` copies it (`null` when absent). The evals harness's file sink writes the same row object, so its JSONL rows simply gain `documentFileId: null`; nothing there reads it.
   Call sites: splitting and classification pass `documentFileId: file.id`; extraction passes `file.id` of the file being verified. `runLlmCall` needs no change beyond the widened type (it spreads `opts.log`).

3. **Resolve the name on the server too, as a fallback.**
   `llmCalls.list` and `getById` `LEFT JOIN document_files df ON df.id = lc.document_file_id` and select `df.filename AS document_filename`. `toAdminCall` maps `documentFileId` and `documentFileName` (`null` when no file or the file is gone). The web `LlmCallSummary` gains both fields.
   *Why both:* the workspace timeline prefers its own `attachmentLabel(file)` (display name, split page ranges) for consistency with the chips beside it; the admin viewer and the call modal have no files list and use `documentFileName`; a deleted file leaves both null and the chip stays plain.

4. **Chip text.** In `CallChip`, `label` becomes `stage` + (`fileLabel ? " · " + fileLabel : "")`, where `fileLabel = files.byId.get(call.documentFileId)?.attachmentLabel ?? call.documentFileName ?? null`. `CallChip` needs the timeline's files map, so `TraceRow` passes the existing `StepFilesProps` (extended with a `byId: Map<string, DocumentFile>` or a `labelFor(id)` function) to calls as well as steps. The file part renders in its own `<span dir="auto">` so a Hebrew display name shows correctly inside the `dir="ltr"` chip.

5. **Modal and viewer.** `CallDetailModal` shows `documentFileName` as a neutral badge beside the stage key when present (new i18n label `adminLlmCallFile`, Hebrew "קובץ"). `AgentConversationsCard` appends ` · <name>` after the stage key when present.

6. **No backfill.** Old rows keep `document_file_id = NULL`. A backfill could pair each old call with the gate step that follows it (same client, `validate_classification` / `verify_extraction` target id, nearest start time), but the pairing is heuristic and the value is low: the trace is a debugging aid for recent runs. Recorded as accepted.

## Risks / Trade-offs

- [The call row is written after the answer; a split child classified microseconds later could be confused with its parent] → not an issue: the id is taken from the `file` variable at the call site, never inferred by time.
- [`LEFT JOIN document_files` on every call list] → per-client lists are ≤200 rows; the join is on the primary key.
- [A file deleted with its client] → the whole conversation is gone with it; a file deleted alone leaves `documentFileName` null and the chip plain, which the spec allows.
- [Long filenames widen the chip] → the chip already wraps in a flex row; the file span gets `max-width` + ellipsis like attachment chips.

## Migration Plan

1. Merge; local `npm run db:migrate` applies 059. Sandbox applies it on push; production applies it in the worker startup script on the next promotion.
2. Rollback: the column is nullable and only read by the admin queries; reverting the code leaves an unused column, which is harmless.
