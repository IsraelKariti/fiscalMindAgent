## Why

In the admin conversation trace, only code-gate rows (the ones with a `checks` list) can be clicked. Every other step (`apply_additions`, `apply_retirements`, `document.retired`, `review.message_pending`, `send_reply`, …) shows just its action name and time. To learn what the step actually did (which document was added, which one was retired, which draft was parked) the admin has to hover the row and read a raw JSON tooltip, and for some steps that JSON holds only document ids, not names.

## What Changes

- Every code-step row in both trace surfaces (workspace conversation tab under impersonation, and the admin conversation viewer) becomes clickable and opens the same in-app modal that gate rows open today.
- The modal gains a "what this step did" section rendered from the step's detail in plain words: document names, instance names, evidence quotes, channel, scheduled time, counts. Gate rows keep their checks list beneath it; the raw JSON stays available in a collapsed section.
- The planner's `apply_*` steps and `document.collected` record the names (not only the ids) of the documents they touched, so the modal can show them. Rows written before this change fall back to showing the id.
- No change for accountants: the trace, and therefore the modal, remains admin-only.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: every step row opens the detail modal (not only gate rows); the modal shows a human-readable summary of the step's detail; the "rows without checks stay as they are" requirement is removed; apply steps record what they changed by name.

## Impact

- `web/src/components/GateChecksModal.tsx`: becomes the step detail modal (checks list optional, new summary section).
- `web/src/components/Timeline.tsx` and `web/src/components/admin/AgentConversationsCard.tsx`: every `StepRow` / `AdminStepRow` becomes a button.
- `web/src/i18n.tsx`: labels for the summary fields and for the non-gate step actions.
- `src/agents/declarationOfCapital/plan.ts`: `apply_resolutions`, `apply_additions`, `apply_retirements`, `apply_collections` and `document.collected` details gain document names (and file names for pairs).
- `openspec/specs/conversation-trace/spec.md` and `docs/agents.md` (trace section): updated wording.
- No migration, no API shape change (the detail JSON only gains keys).
