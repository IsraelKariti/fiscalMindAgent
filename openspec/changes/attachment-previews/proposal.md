# Proposal: attachment-previews

## Why

In the workspace conversation tab every file a client sent shows as a small text chip ("תמונה 90.9 KB", "מסמך PDF 115.9 KB"). A reader cannot tell a pay slip from a bank statement, or two identical-looking "תמונה" chips apart, without opening each one. A small picture of the file inside the chip makes the conversation readable at a glance.

## What Changes

- Every attachment chip in the conversation timeline (message bubbles, and the child chips under a `validate_file_split` trace row) shows a thumbnail of the file above its name and size: the scaled image for an image file, the rendered first page for a PDF.
- Thumbnails are rendered in the browser from the existing `/files/:fileId/view` stream: images straight into an `<img>`, PDFs through a lazily loaded pdf.js module that draws page 1 onto a canvas. No new server route, no stored thumbnails.
- A thumbnail is rendered only when its chip scrolls into view, and each rendered PDF page is kept in memory for the page's lifetime so scrolling back never re-renders it.
- A file whose thumbnail cannot be produced (unsupported type such as a spreadsheet, a corrupt or password-protected PDF, a load error) keeps today's icon-only chip. Nothing is lost, only the preview is missing.
- Clicking the chip (thumbnail or text) still opens the existing file viewer modal; the danger border for blocked or suspicious files stays.
- The "copy conversation" text, the documents tab, the admin conversation viewer and every modal are untouched.

## Capabilities

### New Capabilities
- `conversation-attachments`: how a received file is shown in the conversation timeline, with a visual preview.

### Modified Capabilities
- (none: `file-splitting` and `conversation-trace` describe chip labels and placement; both keep holding. The new capability adds the preview to the same chips.)

## Impact

- `web/src/components/Timeline.tsx`: `AttachmentChip` grows a preview area; a new small `AttachmentThumbnail` component with viewport-triggered loading.
- New `web/src/components/pdfThumbnail.ts`: dynamic import of `pdfjs-dist`, first-page render, in-memory cache keyed by file id.
- `web/package.json`: new dependency `pdfjs-dist` (loaded as a separate chunk only when a PDF chip becomes visible; the main bundle does not grow).
- `web/src/styles.css`: chip layout changes from one line to a small card (preview on top, name and size below); fixed preview box so the timeline does not jump while loading.
- No server, database, or API changes. The pdf.js worker file is served as a static Vite asset; the monday build (`build:gui`) must ship it too.
