## Context

See proposal.md — Why. The call modal (`web/src/components/admin/AdminLlmCalls.tsx`) parses a tool-call response into `{name, args, turn}` entries and prints each call's `args` as JSON. The single-call endpoint (`adminGetLlmCall` in `src/api/llmAdmin.ts`) already loads the call's client for `clientName`. Tool-call *steps* (`toolStepDetails.ts`) already record names beside ids, but an answer that fails validation produces no steps, so the call modal is the only view of it. "Copy details" (`callDetailsText` in `web/src/components/callLink.ts`) serializes the whole `call` object after the link line.

## Goals / Non-Goals

**Goals:**
- Names beside ids in the tool-calls pane and in the copied text, with the ids untouched.
- One request, no change to stored data.

**Non-Goals:**
- Changing the step modal (tool steps already carry names; `validate_message` carries no ids to label except inside its error text).
- Naming message ids (`evidence_message_id`): the quote is already next to it.
- Showing ids on the Documents tab cards.

## Decisions

- **Server adds a `names` map to the call**: `call.names = { documents: { [id]: name }, files: { [id]: displayName } }`, built from `clientDocuments.listForClient` and `documentFiles.listForClient` of `row.client_id`; empty maps when the call has no client. Alternative considered: the web side fetching the client's documents and files itself — rejected, the modal opens from call links and the call browser where no client context is loaded, and it would add two requests per open.
- **File display name rule**: `label ?? filename`, the same rule the file viewer uses for a received file.
- **Pure web helper `withNamedIds(args, names)`** (next to `toolCallsOf`): walks the top-level keys of `args` in order; for a string value under a key ending in `_id` that is a known document or file id, inserts `<key minus _id>_name` right after it; for an array of strings under a key ending in `_ids`, inserts `<key minus _ids>_names` with one entry per id (a known id gives its name, an unknown id keeps the id so positions match). Keys are not walked further (planner tool args are flat). Alternative: a fixed list of known keys — rejected, every future tool with a `*_id` arg should get the name for free.
- **Copy details**: no change to `callDetailsText`; because `names` is part of `call`, the copied JSON already includes the map next to the unchanged `response`. The pane shows the names inline; the copied text shows them as the map — both satisfy "beside, not rewritten".

## Risks / Trade-offs

- [A client with hundreds of files makes the `names` map large] → it is a few KB of ids and short names; acceptable for an admin-only single-call request.
- [A key ending in `_id` that is neither a document nor a file (`evidence_message_id`)] → no match in the map, no field added; the helper only labels what it knows.
- [A deleted document] → `listForClient` returns the client's current rows; the id stays bare. Acceptable: the recorded detail is unchanged, only the convenience is missing.

## Migration Plan

Deploy as usual; no migration, no data rewrite. Rollback = redeploy the previous build.
