## Why

A website fetch (tax authority, Harel, Menora, …) runs inside a throwaway browser container that only the client can open, by handing the agent a one-time code. When a step misbehaves, the only evidence that survives today is one screenshot of the failing moment plus a one-line error; a successful run leaves nothing at all. The operator has no other way into these sites, so every live session must leave behind as much as can be captured: a screenshot, the page's HTML, a complete page snapshot and the page's console and network errors, for every step, success or failure.

## What Changes

- The browser runner records **step evidence** at every provider step (the same points where it takes dev-only debug screenshots today): a full-page screenshot, the serialized HTML of the page (DOM as it is at that moment, every frame), a complete MHTML snapshot of the page with its resources, and a small record with the URL, title, time, console messages and failed or error HTTP responses seen since the previous step.
- The runner serves the evidence of a session over its existing authenticated HTTP contract (protocol version bump), and the worker pulls it after every step — including after a failure and before the container is torn down — and stores it in blob storage under the session, in production as well as locally.
- The evidence of successful runs is kept too, not only failures. The existing failure screenshot keeps working and becomes the last item of the same set.
- The retention sweep covers the whole evidence set; the default retention stays 14 days.
- Admins can see a session's evidence: the step detail modal of any fetch step (`tax_fetch.login_started`, `tax_fetch.otp_submitted`, `tax_fetch.failed`) shows the step gallery beside the details — screenshots, the HTML copy rendered in a sandbox or downloaded, the snapshot and the page record downloadable — and the site-access screen links each card's last access to the same gallery.
- The mock fetch (`TAX_FETCH_MOCK=true`) produces a small synthetic evidence set so the gallery can be checked locally without a browser.
- The dev-only `TAX_FETCH_DEBUG_DIR` file dump stays as it is.

## Capabilities

### New Capabilities
- `fetch-step-evidence`: what the runner captures at each step of a website fetch, how long the platform keeps it, and how an admin reaches it.

### Modified Capabilities
- `conversation-trace`: a fetch step's detail modal shows the session's evidence gallery beside the details (new requirement; the received-file document pane is unchanged).

## Impact

- `src/browserRunner/`: `launch.ts` (`debugShot` becomes the evidence capture point), `server.ts` (per-session evidence store, two new GET routes, failure body unchanged), `protocol.ts` (version 4), every provider keeps its step names.
- Worker: `taxFetch/fetchClient.ts` (pull evidence after each step, before any teardown), `taxFetch/failureShots.ts` → session evidence store under `debug/taxfetch/<day>/<sessionId>/`, `runner.ts` (audit rows carry the evidence prefix), `config/env.ts` (retention default), `queue/debugCleanupWorker.ts` (sweeps the new layout).
- API: new admin routes under `/api/admin/tax-fetch/:sessionId/evidence` (list, view, download), admin-only, streamed, HTML only ever rendered sandboxed.
- Web: `StepDetailModal.tsx` gains an evidence pane for `tax_fetch_session` steps; `AdminSiteAccess.tsx` links the last access to the gallery; new `#/site-access/sessions/:id` route.
- Deploy: the browser-runner image and the worker must move together (protocol bump, handled by `deploy.yml` lockstep); `.env.example` documents the retention default.
- Storage: roughly 5–30 MB per live session in the documents container, deleted after the retention window.
