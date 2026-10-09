# Design: llm-call-links

## Context

Code steps already have the full set: a pure helper (`web/src/components/stepLink.ts`) that builds the link, parses the hash and formats the "copy details" text; `StepLinkPage` mounted by `App.tsx` before the admin / workspace split; two `CopyButton`s in `StepDetailModal`; `scripts/showStep.ts` behind `npm run step`. LLM calls have half of it: an admin address `#/llm-calls/:callId` parsed by the admin dashboard router (`web/src/components/admin/route.ts`), a `CallDetailModal` (`web/src/components/admin/AdminLlmCalls.tsx`) that loads the call by id from `GET /api/admin/llm-calls/:id`, and the server side complete. This change copies the step pattern onto calls, reusing the existing address instead of inventing a second one.

## Decisions

### Reuse `#/llm-calls/<id>` as the call link

One call, one address. The admin call browser already opens `#/llm-calls/:callId` as a drill-down, and closing the modal there keeps the admin in the browser. That stays. What is missing is the impersonating case: the workspace router does not know the hash and rewrites it to boot. So `App.tsx` intercepts `#/llm-calls/<id>` only when `isAdmin && impersonating` and mounts a `CallLinkPage`, the same way it mounts `StepLinkPage` for `#/steps/<id>` (that one for every admin, because the admin dashboard has no step route). Closing goes to `#/`, which the workspace resolves to its default agent. Non-admins never reach the intercept and fall through to their workspace as today.

Alternative considered: a new `#/calls/<id>` namespace handled for every admin like steps. Rejected: two addresses for the same call, and the admin browser's deep link would stop behaving as a drill-down.

### A pure `callLink.ts` helper, unit-tested

`web/src/components/callLink.ts` mirrors `stepLink.ts`: `callLinkOf(callId, origin)`, `isCallHash(hash)` (true for `#/llm-calls/<anything>`), `parseCallHash(hash)` (uuid or null; a bare `#/llm-calls` is not a call link and returns null), `callDetailsText(call, origin)`. No React, no `window`; callers pass `window.location.origin`. `tests/callLink.test.ts` covers the four, including the trailing slash, a malformed id, a stray `%`, and that the details text starts with the link and carries the request and response verbatim.

`isCallHash` is deliberately `#/llm-calls/<something>` only (not the bare `#/llm-calls`): while impersonating there is no call browser to show, and a bare hash must keep falling through to the workspace.

### "copy details" = the whole `LlmCallDetail`

The text is the link, a blank line, then `JSON.stringify` of the call object the modal already holds (`LlmCallDetail`: summary fields + `request` + `response`), formatted. No field is picked or dropped, so the "copied text matches the modal" scenario holds by construction. The response is kept as the raw string the model returned (the modal pretty-prints it only for display).

### Buttons in the modal header

`CallDetailModal` gets a `gate-modal-head` wrapper around its `<h2>` with a `btn-row gate-modal-copy` holding two `CopyButton`s, same classes as the step modal so the layout and the copied-state behaviour are identical. The buttons render only once the call has loaded (they need the data). New i18n keys: `callCopyLink`, `callCopyDetails`, `callNotFound`, `callNotFoundHint`; the back button reuses `stepBackToApp`.

### `CallLinkPage`

Mirrors `StepLinkPage` but thinner: `CallDetailModal` already loads by id, so the page only parses the hash and renders either the modal or the "call not found" card (for a malformed id). A well-formed id that matches no row is already reported inside `CallDetailModal` as the existing load-failed banner; the page keeps that behaviour rather than duplicating the request.

### `npm run call`

`scripts/showCall.ts` takes the last uuid in its argument, reads `llmCalls.getById`, joins the client name like the admin endpoint does, and prints the same shape as "copy details" (camelCase keys) so the two sources read alike. Exit 1 with the same hints as `showStep.ts` when the id is missing or not in this database.

## Risks / Trade-offs

- The "copy details" text of a long extraction call can be large (full prompt plus response). Accepted: that is the point of the paste, and the step text already behaves the same for big gate details.
- A malformed id under impersonation shows the new not-found card, while a well-formed unknown id shows the modal's load-failed banner. Both are in-app messages; wording differs slightly. Accepted to avoid a second request in the page.

## Migration Plan

None. No schema or server change. Deploy is the normal push.

## Open Questions

None.
