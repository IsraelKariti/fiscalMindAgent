## 1. Bubble shows only what the client sent

- [x] 1.1 In `web/src/components/Timeline.tsx`, make the per-message grouping (`filesByEmail`) skip files with a `parent_file_id`; verify a split file's bubble shows only the original chip and the copy-conversation JSON lists only the original filename under that message.

## 2. Split step row lists the children

- [x] 2.1 Build a parent-id → children map (sorted by `page_from`, then id) from `files` and pass it, together with the shared `attachmentLabel` helper and an `onOpenFile` callback, through `TraceRow` to `StepRow`; verify `npm run typecheck` passes.
- [x] 2.2 In `StepRow`, when `action === 'validate_file_split'` and `detail.cut === true`, render the target file's children as attachment chips beneath the row button (siblings, not inside it), each chip opening the child in the file view modal; verify clicking a chip opens the child and does not open the step modal, and the row button still opens the step modal.
- [x] 2.3 Add a `.timeline-trace-attachments` rule in `web/src/styles.css` (top margin, wrapping row, left-to-right) and verify the chips look like bubble chips and Hebrew display names still render right-to-left inside them.

## 3. Verification

- [x] 3.1 In the local workspace as an impersonating admin with the code-steps toggle on, open a client whose PDF was split (the test client left in the local DB): verify the bubble shows one chip, the `validate_file_split` row shows one chip per child in page order with the expected labels, and a rejected/one-document split row shows no chips.
- [x] 3.2 Turn the code-steps toggle off and open the same client as the accountant (no impersonation): verify no chips appear anywhere in the chat and the children are still listed on the Documents tab.
- [x] 3.3 Run `npm run typecheck` and `npm test`; commit per the repo Git workflow.
