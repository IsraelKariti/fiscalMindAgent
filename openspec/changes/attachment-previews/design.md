## Context

See proposal.md - Why. Today `AttachmentChip` in `web/src/components/Timeline.tsx` is a one-line button (icon, label, size) used in two places: message bubbles (`filesByEmail`) and the child chips under a `validate_file_split` trace row. Clicking it sets `viewingFile`, which opens `FileViewModal`. That modal already streams the file from `GET <prefix>/clients/:id/files/:fileId/view` through `api.fileViewUrl(clientId, fileId)` (async, because the monday transport appends a short-lived `?sessionToken=`). The server serves only PDF, PNG, JPEG, GIF and WebP inline (`INLINE_VIEW_TYPES`); everything else comes back as a download.

The server has no rasteriser: `pdf-lib` (used for splitting) can copy pages but cannot draw them, and the app image has no poppler/canvas. The browser runner container has Chromium, but it is a separate ACI job, not a request-time service.

The web app has no React test runner; pure helpers under `web/src/components/*.ts` are tested from the root `tests/` suite (for example `timelineRows.test.ts`).

## Goals / Non-Goals

**Goals:**
- A thumbnail in every timeline chip for images and PDFs, with zero server changes.
- No cost on conversations the reader does not scroll: lazy, viewport-triggered loading.
- No regression of the timeline's scroll-follow behaviour (fixed-size preview box).

**Non-Goals:**
- Thumbnails in the documents tab, the admin conversation viewer, or any modal.
- Stored thumbnails, a thumbnail API, or server-side rendering.
- Previews for spreadsheets or other non-image, non-PDF types.

## Decisions

**1. Render PDF thumbnails in the browser with `pdfjs-dist`, loaded on demand.**
Alternatives: (a) server-side rendering: no rasteriser available, and adding a native dependency to the app image is a deploy risk for a cosmetic feature; (b) an `<iframe>` per chip: each iframe spins up the browser's full PDF viewer, far too heavy for a chat with dozens of files, and it steals clicks. pdf.js is the standard pure-JS renderer; imported with `import('pdfjs-dist')` inside the thumbnail helper so it lands in its own chunk and the main bundle does not grow. The worker is referenced with `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` so Vite emits it as an asset for all three HTML entries (dashboard, monday-object, picker).

**2. Images use a plain `<img>` on the existing view URL.**
The browser decodes and scales; no canvas needed. `loading="lazy"` is not enough on its own because the URL is fetched asynchronously (session token), so the same viewport trigger as PDFs gates the URL fetch.

**3. One `AttachmentThumbnail` component, one `IntersectionObserver` per chip, one module-level cache.**
The component owns: visibility (observer with a root margin of about one viewport so previews are ready before they scroll in), the async `fileViewUrl` call, and the kind switch (image vs PDF). PDF results are cached in a module-level `Map<fileId, Promise<string | null>>` holding a data URL of the rendered page (JPEG, quality about 0.6, about 320 px wide); image chips only need the URL, which the browser's HTTP cache already handles. Caching the promise (not the value) dedupes concurrent requests from the two chip sites and from React strict-mode double mounts. Alternative considered: caching inside component state, which is lost on every re-render of the timeline list, and that happens on each new message.

**4. Failure = fall back to today's chip.**
The helper resolves to `null` on any error (fetch status, pdf.js exception, zero pages). The chip then renders exactly the current markup. A small pure helper `previewKind(file): 'image' | 'pdf' | null` mirrors the server allowlist and is unit-tested from `tests/`.

**5. Chip layout becomes a small card.**
`.attachment-chip` switches to a column layout: a fixed `.attachment-chip-preview` box (about 160 x 110 px, `object-fit: contain`, dark neutral background, rounded) on top, then the existing name/size line. Chips without a preview keep the current row layout via a modifier class, so the fallback is pixel-identical to today. The fixed box is reserved from first paint, which keeps the timeline's ResizeObserver follow logic untouched.

## Risks / Trade-offs

- [pdf.js chunk size, roughly 400 KB gzipped] → loaded only once a PDF chip is near the viewport; cached by the browser afterwards.
- [Rendering many PDFs at once on a long chat] → viewport gating plus a small in-module concurrency limit (3 renders at a time) so the UI thread stays responsive.
- [Worker asset path in the monday iframe build] → verify `build:gui` emits the worker and the monday-object page loads it; if the asset base is wrong there, fall back to pdf.js's "no worker" mode (slower, still correct).
- [Thumbnails of blocked / injection-suspected files] → the server already restricts inline types to safe images and PDF; rendering through pdf.js (no script execution) or `<img>` is as safe as the existing viewer modal. The danger border stays.
- [Memory of data URLs over a long session] → bounded by the number of files viewed; a few hundred KB per hundred chips. Acceptable; the cache is per page load.

## Migration Plan

Front-end only. Deploys with the next build; no migration, no env var. Rollback = revert the commit.
