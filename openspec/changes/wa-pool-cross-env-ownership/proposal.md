## Why

Production and local development share one Twilio account but each has its own database. The admin "choose from pool" list takes every number the account owns and removes only the numbers assigned in the *local* database, so a number that production uses (today `+972533453901`) shows up as free in local dev. Choosing it would move the number's inbound webhook to the local machine and production would stop receiving client replies on it.

## What Changes

- The number's friendly name in Twilio becomes the cross-environment ownership record. Buying a number already names it `fiscalmind <agentType> <instanceId>` and unassigning renames it to `fiscalmind pool`; assigning a number *from the pool* will now also rename it to the owning agent's label (today it keeps whatever name it had).
- The pool / orphaned-numbers list marks a number as "in use in another environment" when its Twilio name records an agent instance that does not exist in this environment's database. The admin UI (pool modal and the Settings orphaned-numbers section) shows such numbers greyed out with that note, with no "choose" and no "release" button.
- Assigning such a number to an agent (pool pick or manual entry) and releasing it from the orphaned-numbers section are refused with a clear error, so one environment cannot take or destroy a number another environment is using.
- Numbers with no ownership label at all (named by the phone number, or any name outside the `fiscalmind …` convention) keep today's behavior: they are offered as free.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `whatsapp-sender`: adds the requirements "Twilio number name records the owning agent" (name set on purchase and on pool assignment, reset on unassignment) and "Numbers owned by another environment are not offered" (flagged in the pool list, unselectable in the UI, refused on assignment and release).

## Impact

- `src/api/waAdmin.ts`: pool listing, assign (`POST /api/admin/wa-senders`), orphaned release.
- `src/twilio/provision.ts`: rename-on-assign next to the existing rename-on-unassign; a small pure helper for parsing / building the ownership label, with a unit test.
- `web/src/components/WaPoolModal.tsx`, `web/src/components/admin/AdminSettings.tsx`, `web/src/api.ts`, `web/src/i18n.tsx`: the flagged state and its Hebrew note.
- No migration. No change to the WhatsApp sender itself (webhook / logo rules stay as specified).
