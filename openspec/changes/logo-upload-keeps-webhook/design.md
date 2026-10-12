## Context

`alignSender(phoneNumber, pictureUrl)` in `src/twilio/provision.ts` is the single Twilio update path for an existing sender. It builds one body with `planSenderUpdate(current, { webhookUrl: env.TWILIO_WEBHOOK_URL, logoUrl })`, so every caller claims the webhook for the calling environment. Callers today: `adminUpsertWaSender` (assignment, must claim) and the four picture routes in `src/api/logoAdmin.ts` via `pushPicture` (must not claim). The pending `agent-profile-picture` delta already says picture updates "touch only the profile logo, never the webhook or display name". See proposal.md for the incident.

## Goals / Non-Goals

**Goals:**
- A picture push can never carry a webhook change, by construction (different function, no webhook input).
- Assignment and purchase behave exactly as before.

**Non-Goals:**
- Locking a number to one environment, or warning when another environment holds it. Sharing one Twilio account across environments stays a known trade-off.
- Any change to the admin UI or response shapes.

## Decisions

- **Two functions instead of a flag.** `alignSender` becomes `claimSender(phoneNumber, pictureUrl)` (webhook + logo; throws on a webhook failure as today) and a new `pushSenderPicture(phoneNumber, pictureUrl)` (logo only; throws on failure so `pushPicture` keeps reporting it). A boolean parameter on one function was rejected because the bug was exactly a caller picking the wrong intent without noticing.
- **`planSenderUpdate` takes an optional webhook.** `wanted.webhookUrl` becomes `string | undefined`; when undefined no `webhook` key is planned and `webhookChanged` is false. Both functions share the sender lookup and the snake_case update call through a small private helper, so the Twilio quirks stay in one place.
- **No-op rules unchanged.** The logo-only path still sends nothing when the logo already matches or when the picture URL is not public https (`senderPictureFor` returns undefined).

## Risks / Trade-offs

- [A later caller reuses `claimSender` for a non-assignment update] → the function's doc comment names the two allowed callers, and `pushSenderPicture` is the obvious choice for anything picture-related.
- [A number stolen earlier stays stolen] → re-assigning the number in the right environment (or `claimSender` from a script) still claims it; this change only stops new silent takeovers.
