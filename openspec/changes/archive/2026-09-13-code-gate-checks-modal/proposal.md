## Why

The conversation trace (workspace timeline in impersonation, and the admin conversation viewer) shows each code gate as a one-line row: shield icon, time, technical action key, a `result: true|false` badge and, sometimes, a reason. When a gate fails (for example `verify_extraction` with `result: false`) the admin cannot see which of the gate's checks failed without hovering the row to read raw JSON in a tooltip. Every gate already runs a fixed set of code checks; today only `verify_extraction` records them one by one (`detail.checks`), the others record only the overall verdict and a free-text reason.

## What Changes

- Every code gate audit row records the list of checks it ran, uniformly: `detail.checks` = ordered list of `{ key, passed, note }` (note = why it failed, `null` when passed). Gates: `injection_detection_regex`, `validate_injection_scan`, `validate_form_resolutions`, `validate_classification`, `validate_message`, `verify_extraction` (already has `checks`; gains `note`).
- Gate rows in both trace surfaces become clickable. A click opens an in-app modal (no browser dialogs) with: the gate's human label, the technical action key, the time, the overall result, and the list of checks, each with a check mark (✓) when it passed or an X (✗) when it failed, plus the note under a failed check.
- Rows recorded before this change (no `checks` list) are not clickable and render as today.
- The `add-llm-stage` skill and `docs/agents.md` are updated so a new gate must record `checks`.

## Capabilities

### New Capabilities
- `code-gates`: what every code gate's audit row must record (overall result, and the per-check list with pass/fail and failure note), and which checks each existing gate reports.
- `conversation-trace`: the admin-only conversation trace rows for code gates — clickability and the checks modal.

### Modified Capabilities
<!-- none: `admin-message-review` is untouched -->

## Impact

- Backend: `src/agents/shared/injectionRegex.ts`, `injectionScreen.ts`, `injectionScanRules.ts`; `src/agents/declarationOfCapital/analyzeFileRules.ts`, `analyzeInboundFile.ts`, `formIntakeRules.ts`, `formIntake.ts`, `decide.ts`, `verifyDocument.ts`. Pure rules modules return the check list; call sites put it in the audit `detail`. No DB migration (`audit_events.detail` is JSON).
- Frontend: `web/src/components/Timeline.tsx` (TraceRow), `web/src/components/admin/AgentConversationsCard.tsx`, new shared `GateChecksModal`, `web/src/i18n.tsx` (gate labels, check labels), `web/src/styles.css`.
- Tests: existing rules tests (`tests/injectionRegex.test.ts`, `injectionScanRules.test.ts`, `analyzeFileRules.test.ts`, `formIntake.test.ts`, `verifyChecks.test.ts`, `llmStages.test.ts`) extended for the check lists.
- Docs: `docs/agents.md` "Code gates" section; `.claude/skills/add-llm-stage`.
