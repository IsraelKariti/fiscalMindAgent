## Context

See proposal.md - Why. Today `provisionWhatsAppNumber` (`src/twilio/provision.ts`) creates the Twilio sender with `profile: { name: env.TWILIO_WA_SENDER_NAME }` and `claimSenderWebhook` only updates the webhook of an existing sender during assignment (`adminUpsertWaSender` in `src/api/waAdmin.ts`). The Twilio Senders v2 API accepts `profile.logo_url` on both create and update (the SDK typings show `logoUrl` on the profile object; the body is sent as snake_case, same caveat as the existing code). Meta fetches the image itself, so the URL must be public `https`. The dashboard SPA serves `web/public/logo.png` from the site root (`express.static(web/dist)`), so `<APP_BASE_URL>/logo.png` is already a public URL in production and sandbox.

## Goals / Non-Goals

**Goals:**
- Every sender the platform registers or assigns shows the logo on WhatsApp.
- Zero new production config in the common case: the default derives from `APP_BASE_URL`.
- Local dev (localhost base URL) keeps working without Twilio errors.

**Non-Goals:**
- Changing the sender display name on assignment (Meta reviews name changes; externally registered senders keep theirs).
- Filling the other profile fields (about, description, address, websites, vertical).
- A bulk "re-brand all senders" admin action; re-assigning a number covers the few existing senders.
- Serving the logo from a dedicated route; the static file is enough.

## Decisions

- **Env var `TWILIO_WA_SENDER_LOGO_URL` with default `${APP_BASE_URL}/logo.png`.** Resolved in `src/config/env.ts` next to `TWILIO_WA_SENDER_NAME`. Alternative: hard-code the production URL. Rejected: sandbox and any future domain would need code edits.
- **Only `https` URLs are sent.** A helper `senderLogoUrl()` in `provision.ts` returns the URL when it starts with `https://`, else `undefined` and logs once per call that the logo is skipped. Alternative: send whatever is configured and let Twilio fail. Rejected: in dev the localhost default would break every "buy number" test run.
- **Assignment aligns the logo in the same function as the webhook claim.** `claimSenderWebhook` becomes `alignSender(phoneNumber)` (single Twilio list + at most one update carrying both `webhook` and `profile.logo_url` when either differs). The profile update sends only `logo_url`, never `name`. Alternative: a separate second update call. Rejected: two round trips and two failure paths for no benefit.
- **Logo failure is non-fatal, webhook failure stays fatal.** If the combined update fails and the webhook was the part that needed changing, the assign route keeps its 502. If only the logo needed changing, the error is logged and assignment proceeds. Implementation: when the webhook already matches, send the profile-only update inside a try/catch; when the webhook differs, send both in one call and let errors propagate as today (the webhook is the thing that must not silently stay wrong).
- **Twilio field comparison.** The current logo is read from `sender.profile?.logoUrl` (SDK camelCase on responses). Compare as exact string.

## Risks / Trade-offs

- [Meta may cache or reject the image (size/format rules)] → `logo.png` is a 256×256 PNG, 47 KB, well inside Meta's limits; if a reject shows up in logs, swap the file, no code change.
- [Twilio update with `profile` could trigger a profile re-review and briefly flip the sender OFFLINE] → the admin status check (`getSenderLiveStatus`) already surfaces OFFLINE; logo-only updates are documented by Twilio as not needing name review.
- [Sandbox `APP_BASE_URL` points at a host Meta cannot reach] → sandbox is public (`sandbox-il-web`), and the `https` guard skips anything non-public.

## Migration Plan

1. Deploy (no migration). New "buy number" runs pick up the logo automatically.
2. For each existing production sender: re-assign the same number to its agent in the admin panel (one click per sender); the update applies the logo. Alternatively upload the picture in the Twilio console under Messaging → Senders → WhatsApp senders.
3. Rollback: revert the commit; already-set logos stay on the senders (harmless).
