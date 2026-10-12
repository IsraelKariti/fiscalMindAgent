## Why

A Twilio WhatsApp number has one inbound webhook, and local dev, sandbox and production share the same Twilio account. Today a picture push (app logo or agent icon upload/removal) reuses the assignment path, which also re-points the number's webhook at the environment that made the upload. On 2026-10-11 a logo upload in production silently took the number `+13186166726` away from local dev, and every client reply for the next day was dropped by production as "unassigned number". The pending `agent-profile-picture` change already states that picture updates must never touch the webhook; the code does not honour it.

## What Changes

- A picture push (app logo upload/removal, agent icon upload/removal) updates only the sender's profile logo on Twilio. It never sends a webhook change, even when the sender's webhook points at another environment.
- Assigning a number and buying a number keep claiming the webhook for the current environment, exactly as today.
- The one-call "align" helper is split into a webhook-claiming call (assignment) and a logo-only call (picture pushes), so the two intents cannot be mixed again.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `whatsapp-sender`: adds the rule that only purchase and assignment may change a sender's inbound webhook; a picture update leaves the webhook as it is, whatever it points at.

## Impact

- `src/twilio/provision.ts` (`alignSender` split), `src/twilio/senderProfile.ts` (`planSenderUpdate` gets an optional webhook), `src/api/logoAdmin.ts` (uses the logo-only call), `src/api/waAdmin.ts` (unchanged behaviour, renamed call).
- `tests/senderProfile.test.ts` gains the logo-only plan cases.
- `docs/agents.md` sender paragraph: picture pushes do not claim the number.
- No migration, no API shape change, no UI change.
