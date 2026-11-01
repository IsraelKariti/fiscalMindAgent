## Context

See proposal.md - Why. Today a staff viewer is gated in one place on the server and one flag in the UI:

- Server: `viewerMayRequest(method, path)` in `src/api/viewerAccess.ts` is the single allow-rule (GET on `/agents` and `/agents/...` only). Both middleware chains apply it the same way: `router.ts` for the cookie session and `monday.ts` for the monday object (`resolveStaffViewer` → `viewerReadOnlyGate` → `requireWhitelisted`). Route handlers never check the viewer role themselves.
- UI: `Workspace.tsx` passes `readOnly={Boolean(viewer)}` into `ClientView.tsx`, which merges it with the deleted-client case (`readOnly = client.deletedAt != null || viewerReadOnly`) and hands one `readOnly` to `ClientHeader`, `WhatsAppCard`, `DocumentsCard` and `Timeline`. `Timeline` hides every action bubble control behind that flag; the approve-draft control is additionally admin-only through the admin `ViewerProvider`.
- The five conversation-flow actions are four routes under `/agents/:agentId/clients/:id/`: `PUT pause` (body `{paused}` — both pause and resume), `POST send-now`, `POST retry-send`, `POST redraft` (both "retry draft" and "regenerate"). All are in `src/api/workspace.ts` and already run under the accountant's `req.userId`, which `resolveStaffViewer` sets for a viewer, so they need no change.

## Goals / Non-Goals

**Goals:**
- Keep the single server allow-rule and the single UI entry point; widen both by the same list of actions so they cannot drift.
- Keep the deleted-client read-only path exactly as it is (everything hidden).

**Non-Goals:**
- Roles or per-accountant switches on the staff list.
- Any change to the add-client, edit, delete, document, WhatsApp, due-date, settings or admin paths.

## Decisions

1. **Widen the allow-rule by route pattern, not by a per-route check.**
   `viewerMayRequest` gains: method PUT or POST on a path matching `^/agents/[^/]+/clients/[^/]+/(pause|send-now|retry-send|redraft)$`. Everything else keeps today's rule. Alternative considered: marking the four handlers with a "viewer allowed" flag. Rejected: the rule would then live in two places (gate + handlers) and `docs/agents.md` already names the gate as the one place to read.

2. **The whole `redraft` route is allowed, so both "retry draft" and "regenerate" are available to a viewer.**
   The two buttons share the route; allowing one on the server allows the other, and the spec requires the UI and server to agree. Regenerating only asks the agent for a new draft, it sends nothing, so the wider grant is harmless. Alternative: a second route for retry only. Rejected as needless surface for the same effect.

3. **Split the UI flag in `ClientView`: `readOnly` (deleted client) vs `viewer`.**
   `ClientView` receives the viewer flag as a separate prop and computes two values: `readOnly = client.deletedAt != null` for the timeline, and `readOnly || viewer` for header, WhatsApp card and documents card (unchanged behaviour there). `Timeline` keeps its single `readOnly` prop and needs no change: for a viewer it now receives `false` on a live client. The approve-draft control stays hidden because it already requires the admin viewer context, not this flag. Alternative: a new `canDriveConversation` prop threaded into `Timeline`. Rejected: more props for the same outcome.

4. **Notice wording changes in `i18n.tsx` only.** The Hebrew notice says the viewer looks at the named accountant's account, may start, pause and resume conversations, and cannot change anything else. The monday object reuses the same string through `Workspace`.

5. **Tests: extend `tests/viewerAccess.test.ts`** with the four allowed routes (PUT pause, POST send-now, POST retry-send, POST redraft), and with refusals for look-alikes: `PUT .../pause` on a non-client path, `DELETE .../pause`, `POST .../clients` (create), `PATCH .../clients/:id`, `PUT .../whatsapp`, `PUT .../due-date`, `POST .../documents`.

## Risks / Trade-offs

- [A viewer resumes a held first message the accountant wanted to review first] → This is the accountant's explicit request; the same late-send confirmation modal shows for the viewer. No per-member switch is built (proposal assumption); if the accountant later wants one, it is a staff-list role, a separate change.
- [The pause route also clears the overdue-stopped marker and runs the form-answer pre-resolution for a manual-kickoff client] → Same code path as for the accountant; audit rows for those steps (where recorded) carry the accountant as actor because `req.userId` is the accountant. If per-person attribution is wanted later, the handlers would need `req.realUserId`; out of scope.
- [UI drift: a future action button added to `Timeline` behind `readOnly` becomes viewer-visible automatically] → Acceptable: `Timeline` is the conversation-flow surface by definition; non-flow controls live in the other cards.

## Migration Plan

No migration. Deploys with the next push; takes effect on the viewer's next page load (the notice) and next request (the gate). Rollback: revert the commit.
