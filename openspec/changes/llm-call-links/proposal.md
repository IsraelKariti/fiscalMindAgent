# Proposal: llm-call-links

## Why

A code step in the conversation trace can be handed to someone else: its modal has "copy link" and "copy details", and a local link is read from the shell with `npm run step`. An LLM call cannot. Its modal (opened from a trace chip) shows the prompt, the reply and the file, but offers no link and no self-contained text, and there is no shell command that prints a call by id. So a call the user wants to discuss has to be described by hand.

## What Changes

- The LLM call modal gets "copy link" and "copy details" buttons at its top, in the same place and style as the step modal's buttons. "copy link" copies `<site origin>/#/llm-calls/<call id>`; "copy details" copies that link followed by the complete call as formatted JSON (metadata, request with system instruction / history / query / schema, and the raw response).
- The existing call address `#/llm-calls/<id>` opens the call modal for an admin who is impersonating an accountant too. Today the workspace router treats that hash as unknown and rewrites it; only the non-impersonating admin dashboard understands it.
- A new shell command `npm run call -- "<link-or-id>"` (`scripts/showCall.ts`) prints one call from the local database as JSON, the way `npm run step` prints a step.
- Docs: the "Step links" section of `CLAUDE.md` and the trace section of `docs/agents.md` describe call links next to step links.

No new audience: the call endpoint stays admin-only, and the buttons live inside the admin-only modal.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: three added requirements — every LLM call has its own link that opens for an impersonating admin as well; the call modal copies the call's link; the call modal copies the call's full details as text.

## Impact

- Web: `web/src/components/admin/AdminLlmCalls.tsx` (modal header buttons), new pure helper `web/src/components/callLink.ts`, new `web/src/components/CallLinkPage.tsx`, `web/src/App.tsx` (hash intercept while impersonating), `web/src/i18n.tsx` (two labels, one not-found message).
- Scripts: `scripts/showCall.ts`, `package.json` (`call` script, test list).
- Tests: `tests/callLink.test.ts` (pure helper).
- Docs: `CLAUDE.md`, `docs/agents.md`.
- Server: no change. `GET /api/admin/llm-calls/:id` already returns the full call behind `requireAdmin`.
