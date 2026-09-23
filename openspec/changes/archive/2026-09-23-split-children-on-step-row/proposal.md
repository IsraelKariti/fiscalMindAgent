## Why

When a multi-document PDF is cut into child files, the conversation view lists the children as attachments of the client's own message, next to the original. A reader takes them for files the client sent ("scan.pdf", "scan.pdf · pages 1-3", "scan.pdf · pages 4-5" in one bubble), when in fact the platform produced them. The children are a result of the split step and should be shown as such.

## What Changes

- The client's message bubble shows only the files that actually arrived on it. Child files cut from a parent are no longer attachments of that message, in the conversation view and in the "copy conversation" text.
- The admin trace row of the split step (`validate_file_split`) that cut the file lists the child files as attachment chips, in page order, with the same labels the bubble used ("scan.pdf · pages 1-3", or the display name first when the child has one). Clicking a chip opens the child file, as before.
- The chips appear only where the trace itself appears: for an admin with the code-steps toggle on. An accountant sees the child files only in the documents list, as decided by the owner.
- No change to how files are split, stored, named, matched or listed on the Documents tab.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `file-splitting`: the requirement "The conversation shows the original file and the files cut from it" changes: the message keeps only the original; the children move to the split step's trace row.

## Impact

- `web/src/components/Timeline.tsx`: the per-message attachment grouping skips children; the split step row renders the children of its target file as chips and opens them in the existing file view modal; the copy-conversation text drops children.
- `web/src/styles.css`: a small style for chips inside a trace row.
- `openspec/specs/file-splitting/spec.md` on archive.
- No server, database or API change: the trace already carries the step's target file id and the timeline already has every file with its parent id and page range.
