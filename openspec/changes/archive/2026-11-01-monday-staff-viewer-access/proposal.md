## Why

A person on an accountant's staff list can open the accountant's workspace with Google sign-in, but the same person opening the FiscalMind custom object inside monday is told "your account is not activated yet" (seen live for michal@arierotem.com on 2026-11-01). The monday surface only consults the activated-accountants list and never the staff list, so staff members cannot use the product from monday at all.

## What Changes

- The monday custom object lets a person whose email is on an accountant's staff list in, as a read-only viewer of that accountant's workspace, exactly as the Google sign-in path does today.
- The monday surface shows the same "viewing <accountant>'s account, read-only" notice and hides the same controls as the standalone app does for a viewer.
- Every write request made from the monday surface under a staff member's session is refused as read-only, the same as under a Google session.
- Removal from the staff list takes effect on the next request from monday too; the object shows the "not activated" screen on its next load.
- No change to who may be added to a staff list, to the Google sign-in path, or to the admin panel.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `accountant-staff-access`: the "listed employee signs in as a read-only viewer" requirement and the "removal takes effect on the next request" requirement are widened from Google sign-in only to every sign-in surface, naming the monday custom object explicitly.

## Impact

- `src/api/monday.ts`: the session status and the monday "me" payload must report a staff viewer as allowed, with the accountant they view; the `/app` mount must resolve the staff viewer and apply the read-only gate before the paid-access gate, as `src/api/router.ts` already does.
- `src/api/auth.ts`: the staff-viewer lookup used by `GET /api/me` becomes shared so both surfaces compute access the same way.
- `web/src/monday/MondayObject.tsx` and `web/src/monday/api.ts`: the object passes the viewer to the workspace shell and marks it read-only, like `web/src/App.tsx`.
- `docs/agents.md`: the staff-viewer paragraph gains the monday surface.
- No migration, no new dependency, no change to the monday app configuration.
