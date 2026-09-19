## Context

See proposal.md for the motivation. The facts that shape the approach:

- A trace step is one `audit_events` row. Its uuid is already sent to the browser as `AdminConversationStep.id`, so the link needs no new identifier and no migration.
- Steps reach the browser only inside `GET /api/admin/clients/:clientId/conversation` (up to 500 rows of one client). There is no way to load one step by id.
- The app has no router library. Navigation is the URL hash, parsed by two separate routers: `admin/route.ts` (admin not impersonating) and `workspaceRoute.ts` (everyone else). The workspace router treats an unknown hash as "boot" and rewrites it, so a step link would be lost for an impersonating admin.
- `requireAdmin` checks the real signed-in user, so admin endpoints keep working during impersonation.
- The reader of the link is mainly Claude, which has no browser session by default but has the local database.
- Precedent: `#/llm-calls/:callId` is a shareable link that opens `CallDetailModal`, which loads its own data by id.

## Goals / Non-Goals

**Goals:**
- One short, stable link per step that works in the browser for an admin in either mode.
- One click in the modal to copy it.
- Claude can turn a pasted link into the step's full data with one command, locally.
- Claude can read a step from any environment, production included, from text the owner pastes.

**Non-Goals:**
- No link for accountants and no public or token-based sharing.
- The link does not navigate to the step's place in the client's conversation. It shows the step alone.
- No change to how steps are recorded, and no copy button for LLM call chips (they already have `#/llm-calls/:id`).
- Reading production steps from Claude's shell. The script reads whatever `DATABASE_URL` points at (the local database).

## Decisions

**1. Link form: `#/steps/<audit row id>`, context-free.**
The alternative was to extend the workspace deep link (`#/as/:email/agents/:id/clients/:id?step=...`). That link is long, exists only under impersonation, differs between the two trace surfaces, and the workspace router rejects ids with a query glued on. A flat `#/steps/:id` is the same from both surfaces and is trivial for Claude to parse. "steps" rather than "gates" because every step row opens the modal, not only gates.

**2. Handle the hash in `App.tsx`, before the admin / workspace split.**
After `api.me()` resolves, if the hash matches `#/steps/<uuid-like>` and the real user is an admin, `App` renders a small `StepLinkPage` in place of the dashboard or workspace. Otherwise the existing flow runs unchanged (a non-admin falls into the workspace router, which treats the hash as boot and lands them in their own workspace). Alternative considered: add the route to both routers. Rejected because it doubles the work and the workspace router has no notion of admin-only screens. `App` listens to `hashchange` so that closing works without a reload.

**3. `StepLinkPage` loads the step and reuses `StepDetailModal`.**
It calls the new endpoint, shows the spinner while loading, then renders `StepDetailModal`. On close it sets the hash to `#/`: the admin router shows the overview, and the workspace router boots to the default agent. On 404 or a malformed id it renders an in-app "step not found" card with a button that does the same. No second modal component.

**4. New endpoint `GET /api/admin/audit-events/:id`.**
Guarded by `requireAdmin`, id validated with zod uuid, 404 when missing. It returns the row in the exact `AdminConversationStep` shape the conversation endpoint emits (reuse that mapper; extract it if it is inline). The `discarded` flag is omitted, because it is computed from the whole thread and only affects whether the timeline hides a row. A new `auditEvents.getById` query sits next to `listForClient`. The read is not itself audited, consistent with the other admin GETs (`auditAdminMutation` records mutating calls only).

**5. Copy buttons: reuse `CopyButton`, placed at the top of the modal beside the title; no close button.**
Owner decision during the build: the buttons belong at the top, and the close button is redundant, so the bottom action row is removed. The modal closes from the backdrop and Escape. Because no button takes focus on open any more, the dialog element itself is focused (`tabIndex={-1}`, `preventScroll`) so Escape and Tab start inside the modal.
The text is `window.location.origin + '/#/steps/' + step.id`, built by one helper (`stepLinkOf`) that the page and the tests share. Origin plus `/` rather than `location.href` minus hash, because `App` already normalises the path to `/`. `CopyButton` is icon-only, so it gets a visible text label beside it ("copy link") through a small wrapper or a new optional `label` prop; the title / accessible name comes from a new i18n key. monday surfaces never show the trace (no admin there), so the iframe origin question does not arise.

**6. "Copy details" button: link plus JSON, built in the browser.**
A pure helper `stepDetailsText(step, origin)` (in `stepLink.ts`, next to `stepLinkOf`) returns the link on line one, a blank line, then `JSON.stringify` of `{ id, occurredAt, action, actorType, severity, targetType, targetId, suspectedInjection, detail }` with two-space indent. The modal already holds the whole step, so no request is needed and the text is identical in every environment. The `discarded` flag is left out, as in decision 4. The button is a second `CopyButton` with its own visible label and accessible name, placed beside "copy link". Alternatives considered: giving Claude's shell a production credential (rejected: a standing secret for a convenience feature), and a markdown summary instead of JSON (rejected: JSON is lossless and already what the raw section shows; Claude reads it as easily).

**7. `scripts/showStep.ts` for Claude.**
`npm run step -- <link-or-id>` extracts the uuid (last path segment of the hash, or the argument itself), reads the row with `auditEvents.getById`, and prints JSON: id, time, action, severity, target, client id and the full detail. Exit code 1 with a plain message when not found. This is the path Claude uses; the repo `CLAUDE.md` gets a short section saying so, so a future session does not try to fetch the URL over HTTP. The same section says a link from another host cannot be read this way and that the owner should paste "copy details" text.

## Risks / Trade-offs

- [The link shows the step without its conversation around it] → The modal already names the action, time and, in the detail, the documents and files. The script output includes the client id, which is enough for Claude to pull the surrounding rows.
- [A link copied on production points at a database Claude's shell cannot read] → The owner uses "copy details" there; the pasted text carries everything. When only a non-local link arrives, Claude names the environment (from the host) and asks for "copy details" instead of guessing.
- [The copied text holds client data (names, amounts, document names) and ends up in a Claude conversation] → Same data the owner already shares by screenshot, and the button exists only for admins. No new exposure on the site itself.
- [`navigator.clipboard` needs a secure context] → localhost, the ngrok domain and production all qualify; same constraint as the existing copy buttons.
- [Hash handled in `App` could shadow a future workspace route named `steps`] → The workspace namespace starts with `agents` or `as`, so there is no overlap today; the match is anchored to `#/steps/` plus a uuid.

## Migration Plan

No migration and no data change. Deploy is the normal push. Rollback is a revert; old links then fall back to the default page.
