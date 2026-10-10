## Context

See proposal.md for motivation.

Today each document type module (`src/agents/declarationOfCapital/documentTypes/<type>.ts`, function `verify`) builds an ordered array of check results and hands it to `verdictOf` in `verifyChecks.ts`. Conditional checks reach that array in two ways:

- `notExpiredCheck` and `periodCoversValuationDateCheck` return `null` when they do not apply; `verdictOf` filters the nulls out.
- The five identity entries (`id_checksum`, `id_matches_client`, `client_id_on_file`, `spouse_adopted`, `co_owners`) are built inside `resolveDocumentOwners` (`spouseIdentity.ts`) and `identityChecks` (`verifyChecks.ts`) only when their condition holds; otherwise they are simply never pushed.

`verifyDocument.ts` copies `verdict.checks` into the audit row's `detail.checks` (`key`, `passed`, `note`, `observed`, `expected`). The web modal (`StepDetailModal.tsx`) accepts the list only when every entry has a boolean `passed`, and renders ✓ / ✗.

`CheckResult.passed: boolean` is read by tests (`tests/spouseIdentity.test.ts`, `tests/documentTypes.test.ts`), by `verdictOf`, and by the trace. The evals judges (`evals/stages.ts`) have their own `Check` type and do not read the gate's `checks` list.

## Goals / Non-Goals

**Goals:**
- A `verify_extraction` row carries the full per-type check list; a reader can compare the modal against the type's documented list without a gap.
- A skipped check says why it was skipped, in the same Hebrew register as the failure notes.
- Old rows, the verdict, the `reasons` list and the planner prompt are untouched.

**Non-Goals:**
- Skipped entries in other gates (`validate_message`, `validate_classification`, `validate_file_split`, …). They have no per-type list a reader compares against; the spec keeps "absent" for them.
- A "7 of 11 passed" counter on the timeline row chip. The heading inside the modal is enough.
- Changing which checks a type runs, or the negative-amount rule for bank balances (a separate question).

## Decisions

**D1. Skipped is `passed: null` on the same entry, not a separate list.**
The modal renders `detail.checks` in order; a skipped check must sit at its position in the type's order (the Notion pages number them 1 to 11 in that order). A separate `skipped: [...]` array would lose the position or need an index. `null` keeps the entry shape identical and makes "skipped" impossible to confuse with a pass or fail. Alternative rejected: `passed: true` plus a `skipped: true` flag, because a passed count would then lie and any consumer that forgets the flag would show ✓.

**D2. `CheckResult.passed` becomes `boolean | null`; a `skipped(key, whyHe)` helper builds the entry.**
`skipped()` returns `{ key, passed: null, reason: whyHe, observed: null, expected: null }`. `verdictOf` keeps `ran = checks.filter(c => c.passed !== null)` for the verdict and the `reasons`, but returns the full list (including skipped) as `checks`. Tests that index by key keep working; the two tests that assert exact key lists are updated to the full lists.

**D3. The conditional helpers return the skipped entry instead of `null`.**
`notExpiredCheck` and `periodCoversValuationDateCheck` return `CheckResult` always. `verdictOf` stops accepting `null`. Type modules need no change: their `verify` arrays stay as they are, and a type that does not list a check (prior declaration has no `type_fields`) still does not carry it.

**D4. The identity skips are filled in by `identityChecks`, not by `resolveDocumentOwners`.**
`resolveDocumentOwners` stays the identity rule and keeps pushing only what it judged. `identityChecks` then walks the fixed order `subject`, `id_checksum`, `id_matches_client`, `client_id_on_file`, `spouse_adopted`, `co_owners` and inserts a `skipped()` entry for every key that is missing, choosing the reason from what it already knows (no owner prints an id; no id on file; nothing adopted; no match or no other owners). `subject` is not part of the list of a type that opts out of `subjectMatch` (crypto, power-of-attorney account, other assets, the generic row): the type does not require the client as owner, so the entry is neither run nor skipped, like `type_fields` for a type without fields. This keeps the spouse-identity tests unchanged except for the key-list assertions.

Skip reasons (Hebrew, one per key, fixed strings in `verifyChecks.ts`):
- `id_checksum`: במסמך לא מודפס מספר תעודת זהות של בעלים
- `id_matches_client`: same as above when no owner prints an id; ללקוח אין מספר תעודת זהות רשום — דווח client_id_on_file במקום when an id is printed but none is on file
- `client_id_on_file`: same first reason when no owner prints an id; ללקוח רשום מספר תעודת זהות — דווח id_matches_client במקום when an id is on file
- `spouse_adopted`: לא אומץ בן/בת זוג בבדיקה זו
- `co_owners`: המסמך לא זוהה כשייך ללקוח או לבן/בת הזוג when nothing matched; אין בעלים נוספים במסמך otherwise
- `not_expired`: במסמך לא נקרא תאריך תוקף
- `period_covers_valuation_date`: תאריכי התקופה לא נקראו במלואם

**D5. The web accepts `passed: boolean | null` and renders a third state.**
`isGateCheckList` accepts `null`; `GateCheckView.passed` becomes `boolean | null`. The list item gets class `gate-check-skip`, glyph "–", screen-reader text "לא נבדק", and the note in a muted color (not the failure red). The checks heading appends "N נבדקו · M לא נבדקו" when M > 0. `stepDetailsText` (copy details) needs no change: it serialises the detail as is.

**D6. `GateCheck` in `src/agents/shared/gateChecks.ts` documents the nullable state** but its `check()` helper stays boolean-only: no other gate writes skipped entries.

## Risks / Trade-offs

- [Any consumer that does `!c.passed` to mean "failed" would treat skipped as failed] → `verdictOf` is the only server consumer and is changed; the web has one render site. A grep for `.passed` in `src/`, `web/src/`, `tests/`, `evals/` is a task.
- [Longer `checks` lists in the audit row] → five to seven extra small entries per verification; negligible.
- [Notion check pages describe a skipped check as "skipped in other cases"] → still true; the gate page's intro sentence that says a skipped check is absent from the trace is reworded by hand (one task, follows `STYLE.md`).

## Migration Plan

No migration: the audit detail is JSON. Old rows have no `null` entries and render as today. Deploy with the normal push.
