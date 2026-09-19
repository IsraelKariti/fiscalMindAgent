## Why

When a code gate fails, the owner wants to show that exact run to Claude. Today the step detail modal has no address of its own, so the only way to share it is a screenshot, which Claude cannot search, quote, or match to a database row.

## What Changes

- Every code-step run (every audit row shown in the trace, gate rows included) gets its own link: `<site>/#/steps/<stepId>`. The precedent is `#/llm-calls/:callId`.
- The step detail modal gains a "copy link" button at its top, beside the title. It copies the full link of the step that is open and flashes a check mark, like the existing copy buttons.
- The modal also gains a "copy details" button. It copies the step's link followed by the step's full data as JSON text. This is the way to show Claude a step from any environment, production included: Claude's shell can read only the local database, so a production link alone tells it nothing, but pasted text always works.
- The modal's close button is removed (owner decision: it is redundant). The modal closes from the backdrop and the Escape key.
- Opening a step link in the browser shows that one step in the same modal, for an admin (impersonating or not). Anyone else does not see it.
- A new admin-only read endpoint returns one audit row by id, in the same shape the conversation endpoint already uses for its steps.
- A small local script prints one step as JSON from a pasted link (or a bare id), so Claude can read the run from the local database without a browser session.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: changes the modal requirement (no close button, copy buttons at the top) and adds three requirements: every step has its own link that opens the step detail modal, the modal offers a button that copies that link, and a second button that copies the link together with the step's full data as text. The visibility rule is unchanged (admin only).

## Impact

- `web/src/components/StepDetailModal.tsx`: copy-link and copy-details buttons (both reuse `CopyButton`).
- `web/src/App.tsx`: a `#/steps/:id` hash is handled before the admin / workspace split, because an impersonating admin sees the workspace, whose router would otherwise rewrite the hash.
- New `web/src/components/StepLinkPage.tsx` (loads one step, shows the modal, handles not-found).
- `web/src/api.ts`, `web/src/i18n.tsx`: one API call, a few labels.
- `src/api/router.ts`, `src/api/llmAdmin.ts`, `src/db/queries/auditEvents.ts`: `GET /api/admin/audit-events/:id`.
- New `scripts/showStep.ts` + an npm script.
- `docs/agents.md` (trace section) and the repo `CLAUDE.md`: how to read a pasted step link.
- No migration. No change for accountants.
