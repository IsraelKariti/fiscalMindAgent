## Why

Since the step-modal document view (2026-09-20), a code step whose recorded target is a received file (a gate, a split, a tie) opens with the document beside its details. The verification steps that run after extraction (`verify_extraction`, `document.verified`, `document.verification_failed` after a failed check, `client.spouse_inferred`) are about one received file too, but their recorded target is the list item the file was tied to, with the file named only inside the step's details. So the `verify_extraction` modal, the one an admin opens most often to judge a failed check against the page, still shows a single column with no document. The admin must leave the modal, find the file in the timeline and open it in the viewer, the very detour the document view removed.

## What Changes

- The step detail modal treats a step as "about a received file" when either its recorded target is a received file (as today) or its recorded target is a document list item and its recorded details name one received file. Such a step opens in the two-pane layout: details in one pane, the document in the other, exactly as the file steps do today (same buttons, same narrow-screen behavior, same "document no longer available" note when the file is gone).
- The server resolves a step's document by the same widened rule, addressed by the step id alone, admin-only, streamed under the admin session. The file named in the details is served only when it belongs to the same client as the step; otherwise the answer is "not found".
- A step that names no file (a planner step, a retirement, a replan after verification) keeps the single-column modal and requests no document. A step whose details name several files (the per-file arrays of a replan or a tie) is not changed by this proposal.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: the two requirements "A file step shows its document beside the details" and "A step's document is served to admins only" widen what "a step about a received file" means, so the verification steps that name their file in the details get the document pane and the document endpoints.

## Impact

- Server: `src/api/stepFile.ts` (the step-to-file resolver also reads a file id from the step's details when the target is a document list item, and checks the file's client), `src/api/llmAdmin.ts` (the audit row already carries `client_id` and `detail`; no new routes), `tests/stepFile.test.ts`.
- Web: `web/src/components/StepDetailModal.tsx` (the "is this a file step" rule moves to a small shared helper that also looks at `detail.fileId`), a new helper next to `web/src/components/stepLink.ts`.
- No database change: the verification steps already record `fileId` in their details.
- Specs: `openspec/specs/conversation-trace/spec.md`.
