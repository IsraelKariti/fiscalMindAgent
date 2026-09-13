## Context

- Six code gates exist (`docs/agents.md`, "Code gates and the three injection layers"). Each is a pure rules function (`injectionRegex.ts`, `injectionScanRules.ts`, `analyzeFileRules.ts`, `formIntakeRules.ts`, `verifyChecks.ts`, `decisionSchema.ts` + the parse in `decide.ts`) followed by one `recordAudit` call at the call site, with `detail.result` and a free-text `reason`. Only `verify_extraction` records per-check results (`detail.checks: {key, passed}[]`, reasons in a separate `reasons` array).
- `audit_events.detail` is JSON and the admin conversation endpoint (`GET /api/admin/clients/:id/conversation`) already ships every step's full `detail` to the browser (`AdminConversationStep.detail: Record<string, unknown>`). Both trace surfaces already render the row from `detail.result` / `detail.reason` and put the raw JSON in the row's tooltip.
- Trace rows: `TraceRow` in `web/src/components/Timeline.tsx` (workspace, impersonation only) and the step branch in `web/src/components/admin/AgentConversationsCard.tsx` (admin viewer). LLM call chips already open `CallDetailModal`. Modals in this app are `modal-backdrop` + `card modal` with click-outside close; none handles Escape yet.
- `tests/llmStages.test.ts` fails on an undocumented stage; the `add-llm-stage` skill is the checklist for new gates.

## Goals / Non-Goals

**Goals:**
- One uniform `checks` contract produced by the pure rules modules, so the lists are unit-tested without an API key or database, and the call sites only copy them into the audit row.
- One shared modal component rendering any gate's checks from `detail` alone (no new endpoint, no migration).
- Backward compatibility: old rows (no `checks`) render unchanged.

**Non-Goals:**
- Making `normalizeDecision` report every business rule individually (it throws on the first failure; splitting it is a larger refactor). `validate_message` reports two checks now; finer checks can be added later without changing the contract.
- Showing the modal to accountants, or adding checks to non-gate steps (`apply_*`, `send_reply`).
- Re-recording checks for historical audit rows.

## Decisions

1. **Contract: `detail.checks: GateCheck[]` with `{ key: string; passed: boolean; note: string | null; observed: string | null; expected: string | null }`.**
   Rationale: `verify_extraction` already uses `{key, passed}`; adding `note` keeps its shape and gives failed checks their reason in place. `observed` / `expected` (revision of 2026-09-13) make a check self-explaining in the modal — a pass shows what was read, a failure shows the value and the reference it missed — without the reader opening the raw JSON. Both are short strings the rules module renders (capped at 300 chars), never structured objects, so the modal stays generic. Alternative considered: a map `{[key]: boolean}` — loses order and the note; a typed per-check `value` object — would force the modal to know every gate. A shared type `GateCheck` lives in `src/agents/shared/gateChecks.ts` (pure, plus a `check(key, passed, note, { observed, expected })` helper and a `maskId(digits)` helper that keeps only the last three digits — the audit rule "no raw ID numbers in detail" applies to check values too); `verify_extraction` maps its `CheckResult.reason` into `note` and its new `observed` / `expected` through.

2. **Rules modules return the checks; call sites do not compute them.**
   - `injectionRegex.ts`: new `injectionRegexChecks(text): GateCheck[]` — one entry per `INJECTION_PATTERNS` entry, `note` = the match sliced to 300 chars. `matchInjectionRegex` (first hit wins) stays for `kind`/`evidence`; `runInjectionRegexStep` records both.
   - `injectionScanRules.ts`: `InjectionScanGateResult` gains `checks` (`clean_without_evidence` | `hit_has_evidence` + optional `evidence_verbatim`), built inside `validateInjectionScan`; `recordScanGate` copies it.
   - `analyzeFileRules.ts`: `ClassificationGateResult` gains `checks` (`matched_id_known`, `matched_type_agrees` when applicable, `not_injection_suspected`, `legible`). `result` still reflects only the drop rules, as documented.
   - `formIntakeRules.ts`: `validateFormResolutions` returns `checks` — one per proposed type key, in `Object.entries(raw.verdicts)` order; dropped → `passed: false` with the existing drop message (minus the `typeKey: ` prefix) as `note`; accepted or unclear → `passed: true`.
   - `decide.ts`: builds `[json_schema, business_rules]` inline around the two steps it already separates (`schema.parse(JSON.parse(text))` then `normalizeDecision`); the failing step's error message (capped at 500 chars, same cap as today's `error`) is the note. The existing `error` field stays.
   - `verifyDocument.ts`: `checks: verdict.checks.map(c => ({ key, passed, note: c.reason, observed: c.observed, expected: c.expected }))`; `reasons` stays for existing readers.
   - **Observed values (revision of 2026-09-13).** `verifyChecks.ts` `CheckResult` gains `observed` / `expected`, filled inside `runChecks` next to each `add(...)`: `legible` (the verdict), `expected_type` (`actual_kind` vs the required document name — `CheckContext` gains `documentName`), `subject` (printed name or masked id vs `clientName`), `id_checksum` / `id_matches_client` (masked ids), `as_of_date` (date read or "לא מצוין" vs `31.12.<year>`), `not_expired` (valid-until vs today), `amounts` (the list rendered as `label value currency`, joined, capped). The amounts check splits its single boolean into the exact failing condition and names the offending amount in the note (none found / `<label>` negative / `<label>` above the sane cap / `<label>` not a number). The other gates fill `observed` from what they already hold: regex → the match; scan → the quoted evidence; classification → matched id, document type vs row type, the flags; form → verdict + cited question/quote; decision → answer length, then decision kind + channel. Each rules module keeps building the strings itself, so the tests assert them.
   Alternative considered: compute checks in the call sites from the existing return values — rejected because the reasons would be re-derived in a second place and untested.

3. **UI: one `GateChecksModal` component (`web/src/components/GateChecksModal.tsx`) fed an `AdminConversationStep`.**
   It parses `detail.checks` defensively (`isGateCheckList` type guard — array of objects with string `key` and boolean `passed`; `note` / `observed` / `expected` optional strings, so rows from before each revision still parse); anything else means "no checks", and the row is not clickable. Labels: `t.codeGateLabels[action]` (English technical labels like `llmPurposeLabels`, e.g. "Verify Extraction") and `t.gateCheckLabels[key]` (Hebrew short labels), both falling back to the humanized key. Structure: header (label, mono action key, timestamp, result badge), optional reason line, `<ul>` of checks with ✓ / ✗ glyphs via CSS classes (`gate-check-pass` / `gate-check-fail`); under each check a value line "נבדק: <observed>" and, when present, "צפוי: <expected>" (`dir="auto"` so Hebrew names and ISO dates each read correctly), then the note in a muted line under a failed check; a `<details>` with the raw JSON for admins who used the tooltip, and a close button. `role="dialog"`, `aria-modal`, `aria-labelledby`; a `keydown` listener on `document` closes on Escape (the first modal in the app to do so; `ConfirmModal` is left alone).
   Both surfaces reuse it: `TraceRow` renders a `<button type="button" class="timeline-trace-gate">` wrapping the row content when checks exist (keyboard-operable for free), otherwise the current `<li>`; the admin card does the same in its step branch. The `title` JSON tooltip stays on both.

4. **No API change.** The endpoint already returns `detail` in full; `requireAdmin` keeps gating it, which satisfies the visibility requirement without new code.

5. **Docs + skill.** `docs/agents.md` gate paragraph documents the `checks` contract; the `add-llm-stage` skill's step 3 ("parse → gate → recordAudit") requires `checks` in the audit detail and a test asserting the list.

## Risks / Trade-offs

- [`injection_detection_regex` rows grow from a few fields to eleven check entries per inbound message/file/form] → negligible in JSON size; `listForClient` already caps at 500 rows. No index or schema change.
- [`validate_message` shows only two checks, which may feel thin next to `verify_extraction`] → documented as the current granularity; the contract allows adding finer entries later without a UI change.
- [Two surfaces rendering the same row could drift] → both go through one modal component and one type guard; only the row wrapper differs.
- [Escape handling added to one modal while others lack it] → scoped to the new component; a follow-up can lift it into a shared hook.

## Migration Plan

- Deploy backend and frontend together (one commit stream on `master`, sandbox auto-deploys). No migration. Old rows keep rendering as before; new rows become clickable as soon as gates run.
- Rollback: revert the commits; extra `checks` fields in already-written rows are ignored by the old UI.
