## 1. Built-in default and storage

- [x] 1.1 Render `web/public/petal-seal.svg` to `web/public/petal-seal.png` (640×640) with a one-off Playwright script kept in `scripts/`, delete `web/public/logo.png`, and `grep` the repo for `logo.png` to confirm no reference remains; verify the PNG opens and shows the petal seal.
- [x] 1.2 Add `migrations/061_agent_instance_logo.sql` (`ALTER TABLE agent_instances ADD COLUMN logo_blob_key text;` with a header comment), `logo_blob_key: string | null` on `AgentInstanceRow`, queries `agentInstances.setLogoBlobKey(id, key | null)`, `agentInstances.getByLogoKey(key)` and `agentInstances.listWithSenders()` (instances that have a `wa_senders` row, with number and key); define the `app_logo_blob_key` setting key next to the other `app_settings` keys; verify `npm run db:migrate` applies 061 locally and `npm run typecheck` passes.
- [x] 1.3 Create `src/storage/logos.ts` (`sniffImageType`, `newLogoBlobKey`, `logoUrl`, `defaultLogoUrl`, `effectivePictureUrl` with `level`, `senderPictureUrl` https-only) and delete `resolveSenderLogoUrl` + `TWILIO_WA_SENDER_LOGO_URL` (`src/config/env.ts`, `.env.example`, `src/twilio/senderProfile.ts`); verify with unit tests in `tests/logos.test.ts` (PNG/JPEG accepted, PDF/SVG rejected; agent key wins over app key wins over default; `http` base yields undefined for Twilio), added to the `npm test` list, and `tests/senderProfile.test.ts` updated for the removed helper.

## 2. Public serving

- [x] 2.1 Add `src/webhook/logoRoute.ts` (`GET /logos/:key`): resolve the key against the app logo setting, then `agent_instances.logo_blob_key`; stream the blob with its content type and `Cache-Control: public, max-age=31536000, immutable`; 404 for unknown keys; mount it in `src/webhook/app.ts` next to `mediaRoute`; verify with curl against the dev server that a current key returns the image, a random key returns 404, and `/petal-seal.png` is served by the static files.

## 3. Twilio wiring

- [x] 3.1 Change `provisionWhatsAppNumber(friendlyName, wabaId, pictureUrl)` and `alignSender(phoneNumber, pictureUrl)` in `src/twilio/provision.ts` to take the URL (remove `senderLogoUrl()`); update `adminUpsertWaSender` and `adminProvisionWaSender` in `src/api/waAdmin.ts` to read the app logo key and pass `senderPictureUrl(...)` for the instance; verify `npm run typecheck` and `npm test` pass.

## 4. Admin API

- [x] 4.1 Add `GET /api/admin/app-logo`, `PUT /api/admin/app-logo` (route-level `express.raw({ type: ['image/png','image/jpeg'], limit: '2mb' })`, `requireAdmin`) and `DELETE /api/admin/app-logo`: sniff type (400 otherwise), upload the blob, upsert/remove the setting, best-effort delete the previous blob, then `alignSender` for every instance from `listWithSenders()` that has no own icon, each in its own try/catch; respond `{ logoUrl, defaultLogoUrl, sendersUpdated, sendersFailed }`; verify with curl: PNG 200 + setting written, PDF 400, 3 MB 413, accountant session 403, DELETE returns the default.
- [x] 4.2 Add `PUT /api/admin/agents/:agentInstanceId/logo` and `DELETE /api/admin/agents/:agentInstanceId/logo` (same parser and guard): sniff, upload, set/clear the column, delete the previous blob, then `alignSender(phone, newEffectiveUrl)` in a try/catch when the instance has a number; respond `{ logoUrl, effectivePicture, waProfileUpdated: true | false | null }`; idempotent DELETE when no icon is set; verify with curl on an instance with and without a picture and with a non-admin session.
- [x] 4.3 Extend the admin agent listing (`adminListAccountantAgents` in `src/api/admin.ts`) with `logoUrl` (own icon or null) and `effectivePicture: { url, level }`; verify the JSON in the browser devtools or curl.

## 5. Admin UI

- [x] 5.1 Add `adminGetAppLogo`, `adminUploadAppLogo(file)`, `adminDeleteAppLogo`, `adminUploadAgentLogo(instanceId, file)` and `adminDeleteAgentLogo(instanceId)` to `web/src/api.ts` (PUT with the `File` as body and its MIME type as `Content-Type`); extend the admin `AgentInstance` type with `logoUrl` and `effectivePicture`; verify `npm run typecheck`.
- [x] 5.2 Add the "לוגו המערכת" card to `web/src/components/admin/AdminSettings.tsx`: round preview, caption own/default, styled file button (hidden input, accept PNG/JPEG, client-side 2 MB check), remove button when an own logo exists, result line with the senders updated/failed counts; Hebrew strings in `web/src/i18n.tsx`, styles in `web/src/styles.css`; verify in the browser that upload, replace and remove update the preview without a reload.
- [x] 5.3 Add the "אייקון הסוכן" card to `web/src/components/admin/AgentPage.tsx` with the three-level caption (own / app logo / default), the same upload and remove controls, and a banner line when `waProfileUpdated === false`; verify in the browser that the agent page follows an app-logo change and an own-icon upload/removal.

## 6. Docs and verification

- [x] 6.1 Rewrite the WhatsApp sender paragraph in `docs/agents.md` around the three-level order (agent icon, app logo, `petal-seal.png`), the `/logos/<key>` route, migration 061 and the removed env var; verify the text matches the built behavior.
- [ ] 6.2 Live check (owner, needs Twilio credentials and a public `APP_BASE_URL`): upload the app logo on the settings page and confirm the existing sender's picture changes in the Twilio console and in a WhatsApp chat; upload an own icon for that agent and confirm it replaces the app logo; remove it and confirm the app logo returns; record the result in this file.
- [ ] 6.3 Commit per the repo Git workflow (pull --rebase, typecheck, commit, push).
