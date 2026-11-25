## 1. Server: names with the call

- [x] 1.1 In `adminGetLlmCall` (`src/api/llmAdmin.ts`) build `names: { documents: { [id]: name }, files: { [id]: label ?? filename } }` from the call's client (`clientDocuments.listForClient`, `documentFiles.listForClient`), empty maps when the call has no client; add it to the returned `call`. Verify: `npm run typecheck`, and `GET /api/admin/llm-calls/<planner call id>` as admin returns the map with the client's items and files.

## 2. Web: names beside ids

- [x] 2.1 Add a pure helper `withNamedIds(args, names)` (web side, next to `toolCallsOf` or in `callLink.ts`) that inserts `<key>_name` / `<key>_names` fields right after every top-level `*_id` / `*_ids` key whose value is a known document or file id, leaving every other key and value untouched and preserving key order. Verify: a unit test in `tests/` with a `tie_file` call (both ids known), an `add_instance` call with `file_ids` (one known, one unknown) and a call with `evidence_message_id` (no field added).
- [x] 2.2 In the call modal's tool-calls pane render `withNamedIds(tc.args, call.names)` instead of `tc.args`; the `names` map rides on the `call` object so "copy details" includes it with no change to `callDetailsText`. Verify: open the production planner call `75fa2974-84f8-45e6-9521-8c4e0cb9f2bd` (the failed answer) and see `file_name` and `document_name` after each id; press "copy details" and see the `names` map in the pasted text with the response unchanged.
- [x] 2.3 Type the `names` field on the web call type (`web/src/api.ts`) and keep calls without it working (treat as empty maps). Verify: `npm run typecheck` and `npm test` pass; a questionnaire or drafting call (no tool calls) opens unchanged.

## 3. Docs

- [x] 3.1 Note the `names` map in `docs/agents.md` next to the call-modal / call-link description. Verify: the section reads correctly.
