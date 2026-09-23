## Context

See proposal.md - Why. Today two pieces already exist and this change joins them:

- The file step modal (`StepDetailModal`) renders a two-pane layout: `.gate-modal-with-doc` grid, `.gate-modal-details` on one side, a `.gate-modal-doc` section on the other with name, download, open-full-size, and an `<img>` or `<iframe>` body. The document is fetched on open through `/api/admin/audit-events/:id/file` (+ `/view`, `/download`), resolved by `resolveStepFile` (audit row → `target_id` → `document_files`) and streamed by `streamFile` with `fileDisposition` deciding inline vs attachment.
- The LLM call detail modal (`CallDetailModal` in `AdminLlmCalls.tsx`) is a single scrolling `.card.modal` with an inline width/height style. `llm_calls.document_file_id` is set for the three per-file stages and comes back on `GET /api/admin/llm-calls/:id` as `documentFileId` / `documentFileName`.

Constraints: admin-only endpoints, no signed storage links, no file id in the browser's URL (the call id is the path to the file, like the step id is today), the document must never load with the list or the trace.

## Goals / Non-Goals

**Goals:**
- One shared document pane component and one shared CSS layout, used by both modals, so the two never drift.
- A call-keyed resolver and three call-keyed endpoints mirroring the step-keyed ones.

**Non-Goals:**
- Highlighting in the document what the model extracted.
- Showing the document for a call that recorded no file by guessing from the prompt.
- Changing the step modal's behavior or look.
- Backfilling `document_file_id` on old calls.

## Decisions

**1. Extract the document pane from `StepDetailModal` into a shared component** (`DocumentPane` in `web/src/components/DocumentPane.tsx`, props: `file: StepFile | 'loading'`, `viewUrl`, `downloadUrl`). `StepDetailModal` keeps its fetch and passes the step URLs; `CallDetailModal` fetches through the new call helpers and passes the call URLs. The load/missing state machine (`'none' | 'loading' | 'missing' | StepFile`) moves into a small hook (`useStepDocument(fetcher, enabled, key)`) so both modals share it.
   - Alternative: copy the JSX into `CallDetailModal`. Rejected: two copies of the same pane would drift (the step modal already went through a layout iteration).

**2. Reuse the existing CSS classes as-is** (`gate-modal-with-doc`, `gate-modal-details`, `gate-modal-doc*`). `CallDetailModal` drops its inline `style` when two-pane (the grid class sets width/height) and keeps it single-column otherwise. The class names keep their `gate-` prefix; renaming them is churn with no behavior gain.
   - Alternative: new `llm-modal-*` classes duplicating the rules. Rejected for the same drift reason.

**3. Call-keyed resolver next to the step-keyed one.** Add `resolveCallFile(callId, { getCall, getFile })` in `src/api/stepFile.ts` with the same shape as `resolveStepFile`: UUID-check the id, load the call, require `document_file_id`, load the file. Pure, unit-tested in `tests/stepFile.test.ts`. The handlers in `llmAdmin.ts` are the step handlers parameterised by resolver, so `/admin/llm-calls/:id/file`, `/file/view`, `/file/download` share `streamFile` and the 404 wording.
   - Alternative: let the browser call the existing per-file admin viewer with `documentFileId`. Rejected: the step endpoints were deliberately keyed by step id so the browser never names a file id and access follows the row the admin can already open; the call endpoints follow the same rule.

**4. Two-pane only when the file resolves.** Same as the step modal: `'none'` (no `documentFileId` on the call) → single column, no request; `'loading'`/file → two panes; `'missing'` (404) → single column plus the existing `stepDocMissing` string. The details request and the document request run in parallel; the document request starts as soon as the call details arrive with a `documentFileId` (the pane cannot know earlier whether the call has a file).

**5. i18n: reuse every existing string** (`stepDocPane`, `stepDocLoading`, `stepDocMissing`, `stepDocOpenFull`, `downloadFile`, `previewUnavailable`). No new keys.

## Risks / Trade-offs

- [The call modal's details column is much longer than a step's (system prompt, history, response)] → each pane scrolls on its own by the existing grid rules; the CallPane text boxes already cap their own height.
- [Two requests per modal open (details, then document)] → the second is a tiny JSON; the document body is loaded by the `<iframe>`/`<img>` only once the pane renders, as today.
- [The call browser page (`#/llm-calls`) is not inside a workspace, so the file id shown in the pane is served purely under the admin session] → identical to how step links work; admin-only guard on all three routes.
- [Old calls with a `document_file_id` whose file was later deleted show the "no longer available" note] → intended; matches the step modal.

## Migration Plan

No migration. Deploy web + server together (same build). Rollback is a revert.
