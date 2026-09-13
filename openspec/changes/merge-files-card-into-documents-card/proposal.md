## Why

The workspace documents tab shows two cards for the same information: the required-documents checklist (with view/download per linked file) and a second flat "קבצים שהתקבלו" (files received) card that repeats every file. The only things the second card adds that the checklist lacks are the content-analysis verdict per file and the files that matched no required document. Accountants have to read two lists to understand one client, and a duplicate upload (visible today) looks like two different files.

## What Changes

- Every file linked to a checklist item is shown as its own sub-row under that item in the required-documents card, with its name, size and date, the content-analysis verdict or status badge, the injection/legibility warning badges, and the view/download buttons. The current shortcut that hides the file's name and puts only the icons on the item's main line is dropped in the capital-declaration flow.
- Files that are linked to no checklist item are shown in a new "files not matched" group at the bottom of the required-documents card, with the same per-file detail and actions. The group is hidden when there are no such files.
- **BREAKING (UI only)**: the separate "קבצים שהתקבלו" card is removed from the documents tab. No API or data change.

## Capabilities

### New Capabilities
- `workspace-documents`: what the workspace documents tab shows an accountant about a client's required documents and the files received for them.

### Modified Capabilities
- (none)

## Impact

- `web/src/components/DocumentsCard.tsx`: per-file sub-rows gain the analysis line; new unmatched-files group.
- `web/src/components/FilesCard.tsx`: deleted; its analysis-line rendering moves into the documents card.
- `web/src/agents/declarationOfCapital.tsx`: documents tab no longer mounts the files card.
- `web/src/i18n.tsx`: one new string for the unmatched group title; `filesReceived` stays (still used by the dashboard chart).
- `web/src/styles.css`: file sub-row layout grows a second text line.
- No backend, API, database, or agent-behavior changes.
