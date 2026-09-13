## Context

See proposal.md for motivation. Current state observed in the code:

- `DocumentsCard.tsx` renders the capital-declaration flow (`capitalRow`) and an older flat flow (`classicRow`). Both compute `filesFor(doc.id)` and use a shortcut: one unlabeled linked file puts only the view/download icons on the item's main line; two or more files (or a labeled file) render a `doc-file-list` of `doc-file-item` sub-rows with name and icons only.
- `FilesCard.tsx` owns the `AnalysisLine` component (verdict text, pending/failed/unsupported/blocked badges, suspicious and not-legible badges) and lists every file flat. It applies the `collected` row class, which strikes through the file name (that is the strikethrough seen in the screenshot).
- The only mounted agent type (`declarationOfCapital.tsx`) passes `capital={...}`, so `classicRow` is unreachable today but still compiled.
- `document_files.client_document_id` is nullable. Files are inserted unlinked and linked afterwards when the analysis returns a valid `matched_document_id`. Files whose analysis returns no match stay unlinked for good.
- `FileViewModal` is already owned by `DocumentsCard` (state `viewing`).
- No component tests exist under `web/src`; verification is `npm run typecheck` plus a manual check in the dev stack.

## Goals / Non-Goals

**Goals:**
- One card, no loss of information: every fact the removed card showed is still visible.
- Per-file analysis verdicts sit next to the file they describe.

**Non-Goals:**
- No change to how files are linked, analyzed, or verified.
- No change to `classicRow` beyond keeping it compiling; it is dead in the current single-agent setup and is not restyled.
- No dashboard changes (`filesReceived` string stays for the chart).

## Decisions

1. **Always render a sub-row per linked file in the capital flow; drop the inline-icons shortcut.**
   The analysis line needs a place under each file. A second text line does not fit on the item's main line next to badges and buttons. Alternative considered: keep the inline shortcut and show the analysis line under the item. Rejected because with two uploads of the same document there is no way to tell which verdict belongs to which file.

2. **Move `AnalysisLine` into `DocumentsCard.tsx` and delete `FilesCard.tsx`.**
   `DocumentsCard` becomes the only consumer. Alternative: keep a shared `AnalysisLine.tsx` module. Rejected as premature; it can be extracted later if a second consumer appears.

3. **Unmatched files are a final group inside the card, using the existing `doc-group` / `doc-group-title` styling.**
   It sits after the retired group, is rendered only when `files.some(f => f.client_document_id === null)`, and its title carries the count like the other groups. It is not collapsed by default because an unmatched file is something the accountant must act on. Alternative: a collapsed `<details>` like not-required/retired. Rejected because it would hide the one case where a file needs attention.

4. **File sub-row layout: two-line text block on the start side, actions on the end side.**
   `doc-file-item` grows from one line to a text column: line 1 = display name; line 2 = size · date; line 3 = analysis line (or badge). The `doc-file-label` keeps its ellipsis; the meta and analysis lines use `doc-desc muted`. No strikethrough on file names (the `collected` class is not applied to file rows).

5. **Download stays a click-time URL fetch.**
   Same reason as today: the monday transport appends a short-lived session token, so the URL cannot be precomputed into `href`.

## Risks / Trade-offs

- [Taller rows for single-file items] → the extra height carries the verdict, which is the information the accountant asked for. The item's main line stays unchanged.
- [`classicRow` diverges from `capitalRow`] → acceptable; it is unreachable. Note this in a code comment so the divergence is visible.
- [Progress badge could be misread as counting files] → the badge logic is untouched and the spec pins it to checklist items.

## Migration Plan

Frontend-only. Deploys with the next sandbox/prod build. Rollback = revert the commit. No data or API compatibility concerns.
