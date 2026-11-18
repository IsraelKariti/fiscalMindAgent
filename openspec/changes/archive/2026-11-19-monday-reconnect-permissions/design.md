## Context

The monday connection is a one-token-per-accountant OAuth grant (`monday_oauth_tokens`: `user_id`, `access_token`, `scopes`, `monday_account_id`). `src/api/mondayOauth.ts` holds the requested scope list (`MONDAY_OAUTH_SCOPES = 'boards:read boards:write docs:read users:read'`), the status route, the popup start URL route, and the callback that upserts the token. The Settings UI (`web/src/components/ClientSourcesSettings.tsx`) renders the monday row: "Connect monday" when not connected, a green badge plus "Disconnect" when connected. It already has `openConnectPopup`, which opens the start URL in a popup, listens for the `fm-monday-connected` postMessage and polls the status route until `connected` is true. Two features (`users:read` → tax advisor lookup, `boards:write` → board write-back) degrade silently on an old token; `docs/agents.md` asks accountants to "reconnect monday" by hand.

## Goals / Non-Goals

**Goals**
- Tell the accountant, in the place they already know, that the agent lacks a monday permission, and let them grant it in one click plus monday's own approval.
- Keep the stored scope comparison robust to ordering so the notice never nags a fully granted account.
- No disconnect step, no migration, no new routes.

**Non-Goals**
- Automatic prompting elsewhere (client page banners, email). The Settings page is the single place.
- Scope checks for Google Drive (its scope has not changed; can follow the same pattern later).
- Changing which scopes the app requests.

## Decisions

1. **Compute "missing" on the server, in one pure helper.** New `src/api/mondayScopes.ts` exports `requestedMondayScopes(): string[]` and `missingMondayScopes(stored: string | null): string[]` (split on whitespace, lowercase, Set difference against the requested list; `null` stored → `[]`). The status route adds `missingScopes: string[]` to its JSON. Why server-side: the requested list lives only there, and a pure helper is unit-testable without a DB.

2. **Reuse the connect flow unchanged for the update.** The update button calls the existing `openConnectPopup(api.mondayConnectUrl, api.mondayConnection, 'fm-monday-connected')`. The start route and callback already accept a connected user (identity rides the signed state token; the callback upserts). The only backend change is storing monday's returned `scope` verbatim, which the callback already does. Alternative rejected: a dedicated `/reconnect` route — it would duplicate the start/callback pair for no behavioral gain.

3. **Popup "done" detection for the update case.** `openConnectPopup` finishes when `getStatus()` reports `connected`, which is already true before the update. Pass a status predicate instead of relying on `connected`: the helper gains a third parameter `isDone: (conn) => boolean` (default `conn.connected`); the update button passes `conn.missingScopes.length === 0`. The postMessage path and the popup-closed path still call `load()`, so the notice clears either way.

4. **UI placement.** Inside the connected branch of the monday `SettingsRow`, render a `settings-notice settings-notice-warning` block (reuse an existing warning style if one exists, else add one class) with the text and a `btn btn-primary btn-small` "Update monday permissions" button. The notice text names the consequences in plain Hebrew: "tax advisor not recognized, board status not updated". Scope names are not shown to the accountant.

5. **Docs.** `docs/agents.md` lines about "must reconnect monday" (tax advisor §, board write-back §) are replaced by one sentence pointing to the Settings notice; the "Adding a scope" step becomes: append to `MONDAY_OAUTH_SCOPES`, enable it in the monday Developer Center, done — the notice handles accountants.

## Risks / Trade-offs

- **monday may return scopes in a different format** (e.g. comma-separated or omitting the field). Mitigation: split on `[\s,]+`; when `scope` is absent the callback already falls back to the requested list, which yields "nothing missing" — correct, since the grant was for that list.
- **Monday Developer Center not updated** for a new scope: the approval popup would fail or return the old list, and the notice stays. The warning in the callback log (`token exchange`) already surfaces this; the docs step is the guard.
- **Status polled every 2 s while the popup is open** — unchanged from today's connect flow.

## Migration Plan

None. Existing rows keep their `scopes` string; the first page load after deploy shows the notice to accountants with an old token. Rollback = revert the commit; the extra JSON field is ignored by an older web build.

## Open Questions

- None blocking. If the user wants the notice also inside the monday custom object header (not only Settings), that is a follow-up.
