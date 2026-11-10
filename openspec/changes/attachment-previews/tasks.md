## 1. Dependency and helper

- [x] 1.1 Add `pdfjs-dist` to `web/package.json`, install, and verify `npm run build --prefix web` emits the pdf.js chunk and the worker asset in `web/dist` for all three entries.
- [x] 1.2 Add `web/src/components/attachmentPreview.ts` with `previewKind(file)` (image / pdf / null, mirroring the server inline allowlist) and `renderPdfThumbnail(url)` (dynamic pdf.js import, first page to a JPEG data URL, concurrency limit, `null` on any error); verify with a new root test `tests/attachmentPreview.test.ts` covering `previewKind` for png, jpeg, pdf, xlsx and html, and that the module loads under `npm test`.

## 2. Chip component

- [x] 2.1 Add `AttachmentThumbnail` in `Timeline.tsx`: IntersectionObserver-gated fetch of `api.fileViewUrl`, `<img>` for images, cached pdf render for PDFs, placeholder while loading, fallback to no preview on failure; verify by opening a local conversation with an image and a PDF and seeing both previews.
- [x] 2.2 Use it in `AttachmentChip` for both sites (message bubbles and split-row children); verify a split child shows only its own first page, and clicking a preview opens `FileViewModal` without opening the step modal.
- [x] 2.3 Keep the danger border and hover texts on chips with a preview; verify with a local file whose analysis has `injection_suspected` (or by temporarily flagging one row).

## 3. Styles

- [x] 3.1 Add the card layout (`.attachment-chip-preview` fixed box, column chip, row fallback modifier) in `web/src/styles.css`; verify fallback chips look as before, and that the timeline still opens at the latest message with previews loading (no jump).
- [x] 3.2 Check RTL and narrow layout: previews align in the bubble, chips wrap, nothing overflows the bubble on a phone-width window.

## 4. Wrap-up

- [x] 4.1 Run `npm run typecheck`, `npm test`, and `npm run build:gui`; verify the monday-object build loads the worker (open the built page locally or confirm the asset path in `web/dist`).
- [x] 4.2 Add a short note to `docs/agents.md` (workspace UI section) that chips carry browser-rendered previews via pdf.js, then commit per the Git workflow.
