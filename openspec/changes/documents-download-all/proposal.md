## Why

An accountant who wants the client's documents on their own computer must download them one file at a time from the documents tab. A client of a capital declaration has ten to thirty files, so this is slow. The card title "מסמכים נדרשים" is also too narrow: the card shows received files, not only required ones.

## What Changes

- The title of the documents card changes from "מסמכים נדרשים" to "מסמכים".
- The card header gets a "הורדת הכל" (download all) button. One click downloads one zip file with the client's received files.
- The zip holds every file the tab lists, each file once, except the original of a split file (its pages are already in the child files).
- Files linked to a checklist item sit at the top level of the zip. Files that matched no item sit in a folder "קבצים שלא שויכו".
- Each file in the zip has the same name its own download button gives it today.
- The button is hidden when the client has no file to download.
- A new workspace API route streams the zip. It uses the same access check as the single-file download.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-documents`: new requirement for the card title, new requirements for the download-all button and the content of the zip.

## Impact

- Web: `web/src/components/DocumentsCard.tsx` (header button, title), `web/src/i18n.tsx` (title text, button texts), `web/src/api.ts` (zip URL helper).
- API: `src/api/workspace.ts` (new route), a new module beside `src/api/fileStream.ts` that builds the zip.
- Dependency: `archiver` becomes a direct dependency. It is already installed, because `exceljs` uses it.
- No database change, no migration, no prompt or pipeline change.
- Works in the monday custom object through the same URL token as the single-file download.
