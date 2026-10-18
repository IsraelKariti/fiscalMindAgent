## Context

`POST /api/admin/wa-senders/provision` (`src/api/waAdmin.ts`) takes only `{ agentInstanceId }`, resolves the picture URL and calls `provisionWhatsAppNumber(friendlyName, wabaId, pictureUrl)` in `src/twilio/provision.ts`, which hard-codes `displayName: env.TWILIO_WA_SENDER_NAME` into `buildSenderCreateBody`. The admin agent page (`web/src/components/admin/AgentPage.tsx`) confirms the purchase with the generic `ConfirmModal`, which has no input. The accountant's names are `users.name` (Google) and `whitelisted_emails.hebrew_name` (joined in by `users.getById`). `wa_senders` holds only the number.

The pending change `agent-profile-picture` already modifies the same spec requirement (picture in three levels); this delta is written on top of that wording so the two archive cleanly in either order.

Meta reviews the display name after registration; `planSenderUpdate` deliberately never changes it. This change keeps that invariant.

## Goals / Non-Goals

**Goals:**
- One place where the name is decided: the buy step, with a sensible per-accountant default.
- The submitted name is visible afterwards.

**Non-Goals:**
- Renaming an existing sender (Meta review, 30-day limit): out of scope; the admin releases and buys again if a name must change.
- Showing Meta's review state of the name (Twilio does not expose it on the sender resource in a reliable way).
- Validating the name against Meta's rules beyond length and single line; the admin is told the rules in the modal note.

## Decisions

- **Default computed on the server, returned by a small GET.** `GET /api/admin/wa-senders/:agentInstanceId/display-name-default` returns `{ displayName }`. The server already knows the accountant row, the own-WABA check and `TWILIO_WA_SENDER_NAME`; the web app would otherwise duplicate the fallback chain. Alternative: compute in the browser from the agent detail payload. Rejected because the agent page payload does not carry the accountant's Hebrew name or the own-WABA flag, and adding both only for this is more surface than one endpoint.
- **Pure helper `defaultSenderDisplayName({ hebrewName, name, brand, ownWaba })` in `src/twilio/senderProfile.ts`**, unit-tested like the other helpers there. The route calls it; the buy modal shows the result.
- **Request becomes `{ agentInstanceId, displayName }`, `displayName` required.** Validation in zod: trim, min 3, max 100, no `\r`/`\n`. Twilio's limit is higher, but 100 keeps a stray paste from being submitted. Alternative: optional with a server-side default. Rejected: the admin must see the name before it goes to Meta.
- **`provisionWhatsAppNumber` gains a `displayName` parameter** instead of reading the env; `TWILIO_WA_SENDER_NAME` becomes the brand part only (same env name, same default, so no `.env` change is needed anywhere).
- **Store it: migration 065 adds `wa_senders.display_name text NULL`.** `upsertForInstance` gets an optional `displayName`; the provision route passes it, the hand-assign route leaves it NULL (and the upsert clears it on a re-assign, since the stored name describes a registration this platform did). The agent detail payload gains `waDisplayName: string | null`. Alternative: read the name back from Twilio on every page load. Rejected: one more Twilio call per page view, and the stored value is what we submitted, which is what the admin wants to see.
- **Buy modal: a dedicated small `BuyWaNumberModal`** (same portal and classes as `ConfirmModal`, plus one `<input dir="auto">` and a muted note with the naming rules: the office name as it appears online, "by FiscalMind" when the link is not public, no extra punctuation). Alternative: add an optional input slot to `ConfirmModal`. Rejected: the modal is used in eight places; a second prop that changes its contract for one caller is not worth it. The modal fetches the default when it opens and disables Confirm until the default arrived or the admin typed a valid name.
- **Own WABA default drops the suffix.** Under the accountant's own Meta business, "by FiscalMind" is not required by Meta and would name an unrelated business.

## Risks / Trade-offs

- [Meta rejects the chosen name] → The number still registers and the sender can come ONLINE with the name under review; the agent page shows the submitted name, and the existing status line shows OFFLINE reasons. Rename is release-and-rebuy (documented in the modal note).
- [Mixed Hebrew/Latin rendering order on phones] → Cosmetic; the modal input uses `dir="auto"` so the admin sees roughly what the client sees.
- [Two pending deltas on the same requirement] → The MODIFIED text here already contains the three-level picture wording from `agent-profile-picture`; archive either first.

## Migration Plan

1. Pull, run `npm run db:migrate` (065). Production applies it in the deploy flow.
2. Existing senders keep their registered names; `display_name` stays NULL for them.
3. Rollback: revert the code; the extra column is harmless.
