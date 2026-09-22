## Context

See proposal.md — Why. The company comparison lives in one place, `compareCompanies` (`institutions.ts`), which returns one of four verdicts: `same`, `different`, `file_unidentified`, `item_unidentified`. Two callers act on it:

- `validateClassification` (`analyzeFileRules.ts`) — the file check's gate. It runs the type check (`matched_type_agrees`) before the company check, so by the time `issuer_matches_item` runs the file's `document_type` already equals the item's `type_key`. Today every verdict but `same` drops the match.
- `tieAllowedByCompany` (`institutions.ts`) via `companyRefusal` (`fileTies.ts`) — the planner's pairs. `filterPairsByCompany` (existing items) has no type check of its own; `assignFilesToNewRows` (items created this cycle) checks the type before it calls `companyRefusal`. Today both unidentified verdicts need the client's quote.

The observed rows (2026-09-20, client "ניב") all carry `match_dropped: "item company not identified"` with an identified file company; their items are named after people.

## Goals / Non-Goals

**Goals:**
- One rule, in one function, that both callers share: `item_unidentified` is allowed on type agreement; `file_unidentified` still needs the client's words; `different` is never allowed.
- The step detail keeps saying that the comparison was one-sided.

**Non-Goals:**
- No change to the classifier prompt, the planner prompt, the institutions table or the questionnaire.
- No re-run of the file check on files already stored with a dropped match; the planner can pair them and the pair is now accepted.

## Decisions

1. **Split the two "unidentified" verdicts in `tieAllowedByCompany`, not in the callers.** `tieAllowedByCompany(comparison, hasEvidence)` returns true for `item_unidentified` regardless of evidence; `file_unidentified` keeps needing `hasEvidence`. Both callers already call it (the gate does not — it branches on `verdict === 'same'`; it will call `tieAllowedByCompany(comparison, false)` instead), so the rule cannot drift between the file check and the planner. Alternative: change `compareCompanies` to return `same` when the item names no company — rejected, because the step detail would then claim a same-company match that never happened.

2. **Type agreement for planner pairs to existing items is checked in `companyRefusal`, only for the `item_unidentified` verdict.** `companyRefusal(file, doc, hasEvidence)` refuses with the existing reason `type_differs` when `file.analysis.document_type !== doc.type_key` and the item names no company. It stays out of the `same` case, so a resend of a known-company file keeps working exactly as today even when the classifier typed it loosely. Alternative: a type check for every pair — a wider behavior change than the owner chose, and it would touch the resend path.

3. **The gate's `issuer_matches_item` check passes with `expected: 'not identified'`.** `passed: true`, `note: null` (the `code-gates` contract allows a note only on a failure), `observed: <file company>`. The passed check next to "not identified" is what tells the admin the comparison was one-sided. `match_dropped` stays null, so the planner's file line shows a plain match. Alternative: no check at all when the item names no company — rejected, because the admin then cannot see from the step that the comparison was one-sided.

4. **The drop note `'item company not identified'` goes away** — only `'companies differ: …'` and `'file company not identified'` remain; `tests/stepLink.test.ts` keeps the old string as an opaque fixture.

## Risks / Trade-offs

- [An item named after a person collects files from several companies: "קרן השתלמות ניב" may end with Meitav, More, Phoenix and Yelin Lapidot files attached] → accepted by the owner; the documents tab shows the company on each file (child label / analysis issuer), and the verification stage still checks each file against the item. Noted as a known limit in `docs/agents.md`.
- [A file of the wrong person: a report of "מיכל" attached to "קרן השתלמות ניב"] → the classifier already reads the item's name and the holder names; the gate never checked holders before this change either, so nothing gets weaker. Verification (`verification-reply`) reads the file against the item and can fail it.
- [Two items of the same type, both without a company ("קרן השתלמות ניב", "קרן השתלמות מיכל")] → the classifier picks one by the holder name it reads; a wrong pick is the same class of error as today for two items of the same company.

## Migration Plan

Code only, no migration. Deploys with the next push. Rollback = revert the commit; stored analyses are unaffected either way.
