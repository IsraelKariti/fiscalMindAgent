## Why

The LLM call modal shows a planner answer as its tool calls, and every document or file in those calls is only an id (`document_id`, `file_id`, `anchor_document_id`, `proven_by_file_id`). Nothing in the UI shows these ids next to a document or file name, so an admin reading a call — above all a call whose answer failed validation and therefore never became tool-call steps — cannot tell which checklist item or which received file the planner meant.

## What Changes

- The single-call endpoint returns, with the call, the names of the client's checklist items and received files (id → name), so the modal can label any id the answer mentions.
- In the call modal's tool-calls pane, every id field that names a document or a received file keeps its id exactly as recorded and gains a sibling name field right after it (`document_id` → `document_name`, `file_ids` → `file_names`, `anchor_document_id` → `anchor_document_name`, `proven_by_file_id` → `proven_by_file_name`, and so on for any `*_id` / `*_ids` key whose value is a known document or file).
- "Copy details" of a call carries the same names, so a pasted call is readable without the site.
- Ids that match nothing (a deleted file, a document of another client, a message id) show no name field; nothing is removed or replaced.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: the LLM call modal's tool-calls pane and its "copy details" text show the document and file names beside the recorded ids.

## Impact

- `src/api/llmAdmin.ts` (`adminGetLlmCall`): loads the client's documents and files and adds a `names` map to the returned call. Admin-only, as today.
- `web/src/components/admin/AdminLlmCalls.tsx`: the tool-calls pane renders the args with the added name fields; the call object passed to "copy details" includes the names.
- A small pure helper (web side) that inserts the name fields, with a unit test.
- No migration, no change to stored calls, no new audience.
