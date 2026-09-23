## Why

In the admin trace, every `File Classification` and `Extract Document` chip looks the same. When a client sends three files in one turn, the trace shows three identical chips in a row and the admin cannot tell which call read which file without opening each one and reading the prompt. The call log never records the file, so nothing today can name it.

## What Changes

- Every LLM call that reads one received file (file splitting, file classification, document extraction) records the id of that file in the call log.
- The admin conversation endpoint returns, for each call, the file id and the file's stored name when the file still exists.
- In the trace (workspace conversation tab under impersonation), the stage chip of such a call shows the file's label after the stage name, using the same label the timeline already gives that file's attachment chip (display name, original name, page range for a split child). Calls that read no file, and calls recorded before this change, keep the plain chip.
- The call detail modal (opened from the chip) and the admin conversation viewer's call line show the same file label.
- Calls recorded before this change are not backfilled.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: adds a requirement that per-file LLM call rows name the file they read, in the trace chip, the call modal and the admin viewer; older rows and non-file calls keep the plain chip.

## Impact

- Database: one migration adding a nullable `document_file_id` column to `llm_calls` (no foreign key, like the table's other ids — call history must survive client deletion).
- Server: `LlmCallLogContext` and the call log writer carry the file id; the three per-file call sites pass it; the call list query joins the file's name; the admin conversation and call endpoints expose `documentFileId` / `documentFileName`.
- Web: `LlmCallSummary` type, the trace chip (`Timeline.tsx`), the call detail modal header (`AdminLlmCalls.tsx`), the admin viewer call line (`AgentConversationsCard.tsx`), a label string in `i18n.tsx`.
- Evals harness: unaffected — its file sink rows gain an absent/null field.
- Production needs the new migration (the worker startup script runs migrations).
