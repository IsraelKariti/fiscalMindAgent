## Context

See proposal.md - Why. Today the picture is one platform-wide value: `senderLogoUrl()` in `src/twilio/provision.ts` resolves `TWILIO_WA_SENDER_LOGO_URL` / `<APP_BASE_URL>/logo.png` (pure helper `resolveSenderLogoUrl` in `src/twilio/senderProfile.ts`) and both `provisionWhatsAppNumber` and `alignSender(phoneNumber)` call it internally. `web/public/logo.png` is a purple shield unrelated to the product; the product icon is `web/public/petal-seal.svg` (favicon in `web/index.html` and `web/monday-object.html`, `brand-mark` images in the SPA). Meta accepts PNG/JPEG only, fetched from a public `https` URL, and may re-fetch later, so a long-lived URL is needed. Admin-owned per-instance facts are columns on `agent_instances` (`tax_year`, `review_mode`, `admin_paused`) edited from `web/src/components/admin/AgentPage.tsx` through `requireAdmin` routes; platform-wide admin facts live in `app_settings` (`src/db/queries/appSettings.ts`: `get`/`upsert`/`remove` by key, used by the kill switch, model and budget settings on `AdminSettings.tsx`). Files live in the private Azure blob container (`src/storage/blob.ts`); the only public file route is the signed, expiring `/media/:token` (`src/webhook/mediaRoute.ts`). `express.json()` is mounted app-wide with its 100 KB default, so an image upload needs its own body parser. No image library exists in the project; Playwright does (browser runner).

## Goals / Non-Goals

**Goals:**
- Three levels, one order, visible in the admin panel: agent icon, app logo, built-in default.
- Both admin controls look like the existing settings cards; no popups, errors in the page banner.
- The sender of an agent always shows the effective picture without the admin re-assigning its number.
- No new dependency; no env var for pictures.

**Non-Goals:**
- Resizing, cropping or format conversion of uploads (the admin uploads a ready square image).
- Changing the web app's own favicon or brand mark from the uploaded app logo (the user chose: the app logo is the WhatsApp default only).
- Showing agent icons in the accountant's workspace or in emails.
- Changing the sender display name.

## Decisions

- **Built-in default = `web/public/petal-seal.png`, rendered once from the SVG.** A 640×640 PNG committed to the repo, produced by a one-off Playwright script (the SVG opened in a headless page and screenshotted) rather than a new dependency. `logo.png` is deleted. Alternative: keep `logo.png` as the fallback. Rejected: it is the wrong picture. Alternative: serve the SVG. Rejected: Meta does not accept SVG.
- **App logo = blob + `app_settings` key `app_logo_blob_key`.** Agent icon = blob + new nullable column `agent_instances.logo_blob_key` (migration `061_agent_instance_logo.sql`). Blob keys are `logos/<32 random hex>.<png|jpg>`; a replacement always gets a new key, so a new URL. Alternative: `bytea` in Postgres. Rejected: the container exists and both consumers only need a URL. Alternative: a pasted URL field. Rejected: the admin would have to host the image elsewhere.
- **One public route `GET /logos/:key`** in `src/webhook/logoRoute.ts`, mounted in `src/webhook/app.ts` next to `mediaRoute`. It resolves the key against the app logo setting first, then `agent_instances.logo_blob_key` (new query `agentInstances.getByLogoKey`), streams the blob with its content type and `Cache-Control: public, max-age=31536000, immutable`; unknown keys 404. No session: 128 random bits, and only current keys resolve. The built-in default is the static `/petal-seal.png`. Alternative: the signed `/media/:token`. Rejected: 15-minute expiry, Meta re-fetches later.
- **Resolution in one pure helper, `src/storage/logos.ts`.** `sniffImageType(buffer)` (magic bytes: PNG `89 50 4E 47`, JPEG `FF D8 FF`), `newLogoBlobKey(ext)`, `logoUrl(key, appBaseUrl)` (`<APP_BASE_URL>/logos/<key>`), `defaultLogoUrl(appBaseUrl)` (`<APP_BASE_URL>/petal-seal.png`), `effectivePictureUrl({ instanceKey, appLogoKey, appBaseUrl })` returning `{ url, level: 'agent' | 'app' | 'default' }`, and `senderPictureUrl(...)` = the `https`-only form for Twilio (undefined + the existing "skipped" log line in dev, where the base is `http://localhost`). `resolveSenderLogoUrl` and `TWILIO_WA_SENDER_LOGO_URL` are removed; its unit tests move to the new helper. `APP_BASE_URL` stays the public origin (as the old default) so admin previews work in dev too.
- **Twilio helpers take the URL as a parameter.** `provisionWhatsAppNumber(friendlyName, wabaId, pictureUrl)` and `alignSender(phoneNumber, pictureUrl)` lose the internal lookup; `adminUpsertWaSender` and `adminProvisionWaSender` in `src/api/waAdmin.ts` already hold the instance and pass `senderPictureUrl(...)` after reading the app logo key once. `planSenderUpdate` is unchanged. Alternative: look the instance up inside `alignSender` by number. Rejected: during assignment the number is not yet linked to the instance.
- **Upload routes with a raw body.** `PUT /api/admin/app-logo` and `PUT /api/admin/agents/:agentInstanceId/logo`, each with route-level `express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' })` and `requireAdmin`; matching `DELETE` routes. Flow: sniff type (400 otherwise, 413 from the parser above 2 MB), upload the blob, write the key (setting or column), best-effort delete the previous blob (logged), then push to Twilio: the agent route calls `alignSender` for that instance's number if any; the app-logo route loops over `waSenders.listAll()` joined with the instance's `logo_blob_key`, skipping instances with an own icon, each call in its own try/catch. Responses: agent route `{ logoUrl, waProfileUpdated: true | false | null }`; app route `{ logoUrl, sendersUpdated, sendersFailed }`. Pictures are never rolled back on a Twilio failure: the next assignment or upload retries. Alternative: multipart. Rejected: needs a parser dependency for one file field; the browser `fetch` sends a `File` as-is with its MIME type.
- **Admin API shapes.** `GET /api/admin/app-logo` returns `{ logoUrl: string | null, defaultLogoUrl }`. The agent listing (`adminListAccountantAgents`) gains `logoUrl` (own icon or null) and `effectivePicture: { url, level }` so the page can label the preview without re-deriving the order.
- **UI.** `AdminSettings.tsx` gets a card "לוגו המערכת" (round 96 px preview, caption own/default, styled file button over a hidden `<input type="file" accept="image/png,image/jpeg">`, remove button when an own logo exists, result line "x senders updated"). `AgentPage.tsx` gets the same card as "אייקון הסוכן" with the three-level caption. Client-side type/size check for an instant message; the server is the authority. Listing reload after each action, like the other admin actions, so previews never go stale (the URL changes on every upload).

## Risks / Trade-offs

- [Meta rejects or ignores a non-square or oversized picture] → UI text asks for a square PNG/JPG; 2 MB cap; Twilio errors are logged and shown as "saved, WhatsApp profile not updated". No automatic resizing.
- [An app-logo change fans out to every sender] → one Twilio list + one update per sender, sequential, each failure isolated; the count of failures is in the response. Volumes are tiny (single-digit senders).
- [A profile update may put a sender through a brief Meta review (OFFLINE)] → unchanged from today's alignment; the agent page shows live status with re-check.
- [Public route is unauthenticated] → unguessable keys, only current keys resolve, image responses only, read-only. Same model as `/media/:token` without expiry.
- [Orphaned blobs if delete-after-replace fails] → logged; keys are listable under `logos/` for a later sweep. Not worth a job for admin-only uploads.
- [Removing `TWILIO_WA_SENDER_LOGO_URL`] → the env schema drops it; production and sandbox do not set it today, so nothing to clean up.

## Migration Plan

1. Pull migration 061 and run `npm run db:migrate` locally; production runs it during deploy.
2. Deploy. Existing senders keep the old shield until an admin uploads the app logo on the settings page (pushed to every sender without an own icon) or re-assigns a number (which now sends the petal seal default).
3. Rollback: revert the commit. The column and setting can stay; senders that carry a `/logos/...` URL keep showing it only while the route exists, so after a rollback re-assign each number once.
