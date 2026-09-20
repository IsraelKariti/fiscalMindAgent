## Why

The step detail modal of a file step (for example `validate_classification`) names the checked file only as text (`whatsapp-media-1-p1-9.pdf`). To judge whether a check was right ("observed: Harel", "item company not identified") the admin must leave the modal, find the client, find the file and open it. The document and the checks should be in view together.

## What Changes

- When a step is about a received file (its target is a `document_file`), the step detail modal becomes a two-pane modal: the step details on one side, the actual document on the other.
- The document pane shows a PDF in the browser's own PDF viewer and an image as a picture. Other file types show a plain "preview unavailable" note.
- Above the document: the file's name, a "download" button and an "open full size" button (opens the document alone in a new browser tab).
- The document is requested only when the modal opens, never while the trace list loads.
- On a narrow screen the document moves below the details.
- A step that is not about a file keeps today's single-column modal. A file step whose file no longer exists keeps the single-column modal with a short "document no longer available" note.
- Works in all three places the modal opens: the workspace trace under impersonation, the admin conversation viewer, and a step link (where the admin may not be impersonating anyone).
- New admin-only server routes that return a step's file (its name and type, an inline view, a download), resolved from the step id. No new audience: same admin guard as the single-step route.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `conversation-trace`: the step detail modal gains a document pane for file steps, and a new requirement covers the admin-only access to a step's file.

## Impact

- Web: `web/src/components/StepDetailModal.tsx` (two-pane layout, document pane), `web/src/api.ts` (step file calls), `web/src/styles.css`, `web/src/i18n` strings.
- Server: `src/api/llmAdmin.ts` + `src/api/router.ts` (three admin routes under `/api/admin/audit-events/:id/file`), reuse of the blob streaming and inline-type allowlist now private to `src/api/workspace.ts`.
- No database migration. No new dependency (no PDF library; the browser renders the PDF).
- Docs: `docs/agents.md` section on the trace, if it lists the admin step routes.
