## Why

The `verify_extraction` step modal lists only the checks that ran. A bank balance document whose owner prints no ID number shows 6 checks, while the type's documented list has 11. The reviewer cannot tell from the modal whether the 5 ID checks were skipped on purpose, forgotten, or broken; they have to know the per-type list by heart and work out the gap themselves.

## What Changes

- The `verify_extraction` gate records every check of the document type's list, in the type's order. A check that did not apply is recorded as **skipped**, with a short Hebrew reason saying why it did not apply (for example "the document prints no owner ID number"). Skipped checks never affect the gate's result.
- The step detail modal renders a skipped check with its own neutral glyph and the word "לא נבדק" instead of ✓ / ✗, followed by the skip reason. The ran checks keep their current look.
- The evals judge and the planner's `reasons` list ignore skipped entries (they already read only failures).
- Other gates (`injection_detection_regex`, `validate_classification`, `validate_message`, `validate_file_split`, …) keep the current behaviour: a check that did not apply stays absent. Only `verify_extraction` has a per-type list that a reader compares against.
- Rows written before this change (no skipped entries) render exactly as today.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-gates`: the "Conditional check did not run" scenario of **Every code gate records the list of checks it ran** changes for `verify_extraction`: a check in the type's list that did not apply is listed as skipped with a reason, instead of absent. The `verify_extraction` bullet of **Checks reported by each existing gate** names the skip condition and reason of each conditional check.
- `conversation-trace`: **Code gate rows open a checks modal** gains the rendering of a skipped check (neutral glyph, "לא נבדק", skip reason).

## Impact

- `src/agents/declarationOfCapital/verifyChecks.ts`: `CheckResult` gains a skipped state; the conditional helpers (`identityChecks`, `notExpiredCheck`, `periodCoversValuationDateCheck`) return skipped entries instead of omitting them or returning `null`; `verdictOf` ignores skipped entries.
- `src/agents/declarationOfCapital/verifyDocument.ts`: the audit row copies the skipped state into `detail.checks`.
- `src/agents/shared/gateChecks.ts`: the `GateCheck` record documents the skipped state.
- `web/src/components/StepDetailModal.tsx`, `web/src/i18n.tsx`, `web/src/styles.css`: skipped rendering.
- Tests: `tests/documentTypes.test.ts`, `tests/spouseIdentity.test.ts` (key lists now include skipped entries), new assertions for skip reasons.
- Docs: `docs/agents.md` verification paragraph; the Notion "verify_extraction" gate page and the per-type check pages already say "Runs: only when …", so they stay correct; their intro sentence about absent checks is updated by hand.
