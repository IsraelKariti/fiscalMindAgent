## 1. Shared check contract

- [x] 1.1 Add `src/agents/shared/gateChecks.ts` with the `GateCheck` type (`key`, `passed`, `note: string | null`), a `check()` builder and `allPassed()` helper; verify `npm run typecheck` passes and the module imports nothing from `gemini/`, `db/`, `audit/`.

## 2. Gates report their checks (pure rules first, then call sites)

- [x] 2.1 `injectionRegex.ts`: add `injectionRegexChecks(text)` (one entry per pattern, note = matched text capped at 300); `runInjectionRegexStep` puts it in `detail.checks`. Verify with a new case in `tests/injectionRegex.test.ts`: "ignore all previous instructions" yields eleven entries, only `ignore_instructions` failed with a note, and a clean text yields eleven passed entries.
- [x] 2.2 `injectionScanRules.ts`: `validateInjectionScan` returns `checks` (`clean_without_evidence` / `hit_has_evidence` / conditional `evidence_verbatim`); `recordScanGate` copies it. Verify in `tests/injectionScanRules.test.ts`: the four existing verdict cases assert the exact check list, including that `evidence_verbatim` is absent when the text is `null`.
- [x] 2.3 `analyzeFileRules.ts`: `validateClassification` returns `checks` (`matched_id_known`, conditional `matched_type_agrees`, `not_injection_suspected`, `legible`); `analyzeInboundFile.ts` writes it. Verify in `tests/analyzeFileRules.test.ts`: unknown id → `matched_id_known` failed with the id in the note while `legible` passed; type mismatch → `matched_type_agrees` failed; suspected injection → `not_injection_suspected` failed while `result` stays `true`.
- [x] 2.4 `formIntakeRules.ts`: `validateFormResolutions` returns `checks` (one per proposed type key, drop reason as note); `formIntake.ts` writes it. Verify in `tests/formIntake.test.ts`: a mix of accepted, unclear and dropped verdicts produces one entry per key in proposal order with the right `passed`/`note`.
- [x] 2.5 `decide.ts`: record `checks` = `[json_schema, business_rules]` per attempt, the failing step's message as note, `business_rules` absent when parsing failed. Verify in `tests/intakeDecision.test.ts` (or a new `tests/decideChecks.test.ts` that stubs `runLlmCall`): a schema-invalid answer → only `json_schema` failed; a normalization-rejected answer → `json_schema` passed, `business_rules` failed with the rejection text.
- [x] 2.6 `verifyDocument.ts`: map `verdict.checks` into `{key, passed, note: reason}`; keep `reasons`. Verify in `tests/verifyChecks.test.ts` that `runChecks` reasons are the strings the audit note will carry, and by reading one fresh `verify_extraction` row in the local DB after a verification run (`SELECT detail->'checks' FROM audit_events WHERE action='verify_extraction' ORDER BY occurred_at DESC LIMIT 1`).

## 3. Trace UI

- [x] 3.1 Add `web/src/components/GateChecksModal.tsx` (type guard `isGateCheckList`, header with label / action key / time / result badge, optional reason, check list with ✓ / ✗ and notes, raw-JSON `<details>`, close button, backdrop click and Escape close, `role="dialog"` + `aria-modal` + `aria-labelledby`); add `codeGateLabels` and `gateCheckLabels` to `web/src/i18n.tsx` and the `.gate-check-*` / `.timeline-trace-gate` styles to `web/src/styles.css`. Verify `npm run build --prefix web` (or the GUI typecheck) passes.
- [x] 3.2 `Timeline.tsx` `TraceRow`: when the step has a checks list, render the row content inside a `<button type="button">` that opens `GateChecksModal`; otherwise keep the current `<li>`. Verify in the workspace under impersonation with the "שלבי קוד" toggle on: a `verify_extraction` row opens the modal listing its checks with ✓ / ✗, an `apply_collections` row is not clickable, and Enter / Space / Escape work from the keyboard.
- [ ] 3.3 `AgentConversationsCard.tsx`: same wrapper + modal in the step branch. Verify in the admin conversation viewer that a gate row opens the same modal.
- [x] 3.4 Confirm old rows: on the local DB, a gate row written before task 2 (no `detail.checks`) still renders with badge and reason and shows no click affordance.

## 4. Docs, skill, and delivery

- [x] 4.1 Update `docs/agents.md` ("Code gates" section: the `checks` contract and the per-gate lists) and `.claude/skills/add-llm-stage/SKILL.md` (audit row must carry `checks`; test must assert the list). Verify by reading both diffs.
- [ ] 4.2 Run `npm test` and `npm run typecheck`; commit per the repo git workflow (pull --rebase, commit, push). Verify the push lands on `origin/master`.
