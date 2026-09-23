## Context

See proposal.md for the motivation. Today `web/src/components/Timeline.tsx` groups every received file by `email_id` (`filesByEmail`) and renders the group as chips inside that message's bubble; a child cut from a parent carries the parent's `email_id`, so it lands in the same bubble. The same grouping feeds the "copy conversation" text.

The admin trace (loaded only when `isAdmin` and shown per the code-steps toggle) already delivers each `validate_file_split` run as an `AdminConversationStep` with `targetId` = the parent file's id and `detail.cut` = whether children were created. The timeline's `files` prop already holds every file of the client with `parent_file_id`, `page_from`, `page_to` and `label`. `StepRow` is a single button that opens `StepDetailModal`.

Nothing on the server needs to change.

## Goals / Non-Goals

**Goals:**
- A client bubble shows only what the client sent.
- The admin sees the children where they were produced: on the split step row, in page order, with the labels used until now, opening in the existing file view.

**Non-Goals:**
- Any new surface for accountants (owner decision: they use the Documents tab).
- Changes to splitting, naming, matching, the step detail modal, or the documents list.
- Listing children in the copied conversation text (it only carries messages).

## Decisions

1. **Filter children out of `filesByEmail`, not out of the `files` prop.** The `attachmentLabel` helper needs the parent to build a child's label, and the step row needs the children; both read from `files`. Only the per-message grouping skips rows with a `parent_file_id`. Alternative rejected: filtering server-side would also hide children from the Documents tab and would need an API change.

2. **Children are attached to the step row by `targetId`, not by audit detail.** `StepRow` receives the timeline's `files` (or a prebuilt map parent id → children, sorted by `page_from`) and, when `step.action === 'validate_file_split'` and `step.detail.cut === true`, renders `files.filter(f => f.parent_file_id === step.targetId)`. This reuses live rows (labels update when a child is later named) and needs no new fields in the audit row. Alternative rejected: writing child ids into the audit detail would not show later-assigned display names and would leave old rows without chips.

3. **Chips sit outside the step button.** The step row becomes a container: the existing button (opens the modal) plus a `bubble-attachments`-style div of chips beneath it, each its own button that calls `setViewingFile(child)`. Nested buttons are invalid HTML and a chip click would otherwise bubble to the modal opener. `TraceRow`/`StepRow` gain an `onOpenFile` callback and the child list as props; the `FileViewModal` state stays where it is (in `Timeline`).

4. **Same label helper, same chip styling.** `attachmentLabel` moves up (or is passed down) so the step row and the bubble format identically. A small CSS rule (`.timeline-trace-attachments`) sets a top margin and left-to-right flow inside the `dir="ltr"` trace row; chip text keeps `dir="auto"` behaviour through the existing `attachment-chip-name` span.

5. **Chips only when `detail.cut === true`.** A rejected or one-document run has no children to show and must not show stale ones. The idempotent re-run path (children reused, no new gate row) needs nothing: the original row already carries `cut: true`. The `cut` field has existed since the step was introduced, so no older rows lack it.

## Risks / Trade-offs

- [The chips depend on the code-steps toggle] → This is the owner's choice; the Documents tab remains the always-on place for children.
- [Admin looks at an old client whose split row is missing, e.g. trace pruned] → The children are still on the Documents tab; the bubble simply shows fewer chips than before.
- [Chip click also triggering the row's modal] → Chips are siblings of the row button, not descendants; add `stopPropagation` defensively.
- [Timeline auto-scroll] → Chips only add height inside an existing `li`; the ResizeObserver follow logic already handles growth.

## Migration Plan

Front-end only. Deploy with the next push; no data migration, no rollback steps beyond reverting the commit.
