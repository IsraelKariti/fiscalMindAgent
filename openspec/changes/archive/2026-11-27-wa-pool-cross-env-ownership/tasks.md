## 1. Ownership label helper

- [x] 1.1 Add `src/twilio/numberOwnership.ts` with `ownerLabel(agentType, instanceId)` and `parseOwnerLabel(friendlyName)` (null for `fiscalmind pool`, a phone number, or any other text); use `ownerLabel` in the purchase flow so both paths share one format. Verify with `tests/numberOwnership.test.ts` (round trip, pool, phone number, foreign text) via `npm test`.

## 2. Backend

- [x] 2.1 In `src/twilio/provision.ts` add `markNumberAsOwned(phoneNumber, label)` sharing its implementation with `markNumberAsPooled` (owned lookup, rename, log-and-swallow). Verify with `npm run typecheck` and that `markNumberAsPooled` behaves as before.
- [x] 2.2 Add a helper in `src/api/waAdmin.ts` that, given an owned number's friendly name, returns `claimedElsewhere` by parsing the label and checking `agentInstances.getById`; make GET `/api/admin/wa-numbers/orphaned` return every unassigned owned number with `claimedElsewhere` and the parsed `owner`. Verify by calling the endpoint locally and seeing the production number flagged true and a `fiscalmind pool` number false.
- [x] 2.3 In `adminUpsertWaSender` refuse with 409 "in use in another environment" before `claimSender` when the number is owned and claimed elsewhere; after a successful upsert call `markNumberAsOwned` with the instance's label. Verify: assigning the production number locally returns 409 and its webhook is untouched; assigning a `fiscalmind pool` number renames it in the Twilio console.
- [x] 2.4 In `adminReleaseOrphanedWaNumber` refuse with the same 409 for a number claimed elsewhere. Verify by POSTing the production number locally and getting 409.

## 3. Web

- [x] 3.1 Extend `OrphanedWaNumber` in `web/src/api.ts` with `claimedElsewhere` and `owner`; add the Hebrew note string ("in use in another environment") to `web/src/i18n.tsx`. Verify with `npm run typecheck`.
- [x] 3.2 In `WaPoolModal.tsx` and the orphaned-numbers section of `AdminSettings.tsx`, render flagged rows greyed out with the note and without the choose / release button. Verify in the browser on the local pool modal: the production number shows the note and has no button; a free number still has it.

## 4. Docs

- [x] 4.1 Update `docs/agents.md` (WhatsApp numbers section) with the friendly-name ownership convention and the cross-environment guard. Verify the section reads correctly.
