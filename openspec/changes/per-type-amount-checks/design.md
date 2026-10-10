## Context

See proposal.md — Why. Since `per-type-document-schemas` every document type is one module (`src/agents/declarationOfCapital/documentTypes/<type>.ts`) holding its zod schema, its prompt text, its `FIELDS` list and its `verify` list of check helpers. Two leftovers are still generic: the common `amounts` array in every schema and prompt, and `amountsCheck` in `verifyChecks.ts`, which ten modules call. Eight types already read money into named number fields; three (loan taken, loan given, crypto) read money only through the generic list. The `type_fields` helper judges a number field only for "is finite". The trace, the evals judge (`evals/stages.ts`) and 25 captured request fixtures depend on the exact prompt and schema text.

Two pending changes touch the same spec text (`per-type-document-schemas`, `skipped-checks-in-trace`); this change's deltas restate their wording and must be archived after them.

## Goals / Non-Goals

**Goals:**
- No generic money field and no generic money check anywhere in extraction or verification.
- Every number a type reads is named, has one meaning, and carries its own lower bound in the type's module.
- The three money-only-in-the-list types get the named fields the accountant actually needs.
- Old `verify_extraction` rows (with `amounts`) keep rendering; stored data is never rewritten.

**Non-Goals:**
- No change to check keys other than dropping `amounts`; `type_fields` stays the one check over typed fields.
- No currency checks beyond a three-letter pattern where a type declares a currency field; no exchange-rate logic.
- No upper "sane" cap; no change to the identity, date or expiry checks.
- No change to the step modal UI.

## Decisions

**D1. The bound lives on the field, judged by `type_fields`; no new check key.** `TypeField` gains `min?: number` (inclusive), allowed only on `kind: 'number'` (the registry test rejects it elsewhere). `typeFieldsCheck` fails a number below its `min` with a note built from the label: `min === 0` → `השדה "<label>" שלילי (<value>)`, otherwise `השדה "<label>" קטן מ-<min> (<value>)`. Alternative considered: one named check per money field (e.g. `balance_sign`) in each module's `verify`. Rejected: it multiplies check keys and i18n labels for one rule, and the owner's objection is to generic *fields*, not to a field declaring its own rule. The rule is still written in the type's own file, next to the field's meaning.

**D2. The bounds, per field.** `current_account_balance`: no `min` (overdraft). `deposits_balance`, `portfolio_value`, `closing_balance`, `total_deposits`, `principal_balance`, `outstanding_balance`, `debt_balance`, `market_value`, `purchase_cost`, `purchase_price`: `min: 0`. `contents_sum`: `min: 1` (an insured sum of zero is a misread). Vehicle and real estate never ran `amountsCheck`; giving their cost fields `min: 0` is a new (harmless) rule and is stated in the spec.

**D3. New fields for the three list-only types** (names follow the existing `*_balance` / `*_name` style):
- `loan_taken`: `lender_name` (text, optional), `outstanding_balance` (number, required, min 0). `verify` = legible, expected type, identity (subject), as-of date, type_fields.
- `loan_given`: `borrower_name` (text, optional), `debt_balance` (number, required, min 0). `verify` = legible, expected type, identity (subject), type_fields (no as-of date today; unchanged).
- `crypto`: `market_value` (number, required, min 0), `value_currency` (text, required, pattern `^[A-Z]{3}$`, hint as real estate's `price_currency`). `verify` = legible, expected type, identity (subjectMatch false, unchanged), as-of date, type_fields.
Alternative: leave them with no money field. Rejected: without the generic list they would verify no amount at all, which is a regression the owner would not accept.

**D4. Drop the one-trillion cap.** It was a property of the generic list; a per-field `max` would be the same constant repeated in every module. "Is finite" remains. Recorded as a conscious trade-off (R2).

**D5. Prompts and fixtures.** Every module loses its `- amounts:` prompt line and the `amounts` schema key; the three types gain one `- <key>:` line per new field under the "שדות ייעודיים" block (added where the other field-bearing modules place it). The 25 fixtures under `tests/fixtures/extractionCalls/` are regenerated once from the new modules (the same capture script as task 1.1 of `per-type-document-schemas`), reviewed in the diff (only the `amounts` line removed, only the new lines added), and committed. The registry test keeps guarding "every schema key has exactly one prompt line".

**D6. Evals.** `expected.amount` is removed from `evals/stages.ts` and the judge text; the 12 cases that used it get the same value under `expected.fields.<money key>` (`ext_01`, `ext_02`, `ext_04` get `current_account_balance` or `deposits_balance` according to the stored answer in the last results file; `ext_03`, `ext_22` already carry the field). Stored results are re-judged (`npm run evals:rejudge`); the `amount` check disappears from every case and no verdict changes.

**D7. Old rows.** `web/src/i18n.tsx` keeps the `amounts` check label; the modal renders whatever `checks` a row carries, so nothing else changes. `stepSummary.ts` and the step modal already list `fields` by label.

## Risks / Trade-offs

- [R1: a model keeps answering with an `amounts` key out of habit] → the schema is enforced (`responseJsonSchema`, every key required and no extra key); zod parse drops unknown keys; nothing reads it.
- [R2: no upper cap — a misread of 10^13 passes `type_fields`] → the accountant review and the attestation stay in place; the cap never fired in a year of records. Revisit per field if a real misread appears.
- [R3: regenerating fixtures could hide an unintended prompt change] → the task requires reviewing the fixture diff line by line before committing; the fixture test fails on any other drift.
- [R4: the three new required money fields make documents fail that passed before (a loan certificate without a readable balance)] → that was the point of the generic amounts check too ("no amounts found" failed); the new failure names the field by label, which is more actionable for the accountant.
- [R5: archive order] → this change restates the requirements of two unarchived changes; archiving it first would overwrite their text with a superset, which is safe, but the proposal still asks for them first so the archive diff reads cleanly.

## Migration Plan

Code only, no migration, no data rewrite. Deploy with the usual push to master (sandbox) and the manual promotion. Rollback = revert the commit; old and new rows both render under either version.
