## Why

Every document type still shares one generic `amounts` list (label, value, currency) and one shared `amounts` check that rejects any negative value. The bank balance prompt tells the model that an overdraft is a legitimate value and to keep the minus sign, and the same shared check then fails the document on that sign (local step f5eac630, 2026-10-10: `current_account_balance: -13,685.83` → "הסכום עו"ש שלילי"). The owner's direction: no generic money field and no generic money check — each document type owns its named money fields, each with its own meaning and its own rule.

## What Changes

- **BREAKING** (internal): the common extraction field `amounts` and the shared `amounts` check are removed. New `verify_extraction` rows carry no `amounts` entry; rows written before keep theirs and still render.
- Every number field of a document type declares its own lower bound in the type's module, and the `type_fields` check enforces it with a note that names the field by label: the bank current-account balance accepts any sign (overdraft); deposits, portfolio value, fund balances, cumulative deposits, mortgage principal, purchase prices and costs accept zero and above; the contents-insurance sum must be above zero.
- The three types that had money only in the generic list get named money fields of their own: loan taken (`outstanding_balance`, required; `lender_name`, optional), loan given (`debt_balance`, required; `borrower_name`, optional), crypto (`market_value`, required; `value_currency`, required, three-letter code). Their prompts gain one instruction line per field; their verification gains `type_fields`.
- The shared sane-amount cap (one trillion) is dropped with the generic check; a number is still rejected when it is not finite.
- The evals `extract_document` cases stop expecting a generic `amount` and expect the type's named money field instead; the judge text, `evals/README.md` and the add-eval-case skill say so.
- Docs, the LLM-stages page (prompt and schema per type, already per type) and the Notion extraction pages reflect the new field sets.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `document-extraction`: the common fields no longer include a list of amounts; a number field may declare a lower bound and `type_fields` fails when the value is below it; the first-set-of-typed-fields list gains the loan-taken, loan-given and crypto fields and states each number field's bound.
- `code-gates`: `verify_extraction` no longer reports an `amounts` check; `type_fields` also fails for a number below its field's bound; the bank balance row lists ten checks, not eleven.
- `conversation-trace`: the extraction-verification modal scenarios no longer mention the amounts found or an eleven-check bank row.

This change's deltas are written on top of the pending changes `per-type-document-schemas` and `skipped-checks-in-trace` and MUST be archived after them.

## Impact

- `src/agents/declarationOfCapital/verifyChecks.ts` (`ExtractedFields.amounts`, `amountsCheck`, `renderAmount`, `MAX_SANE_AMOUNT` removed; `typeFieldsCheck` reads the field's bound), `documentTypes/types.ts` (`TypeField.min`), every `documentTypes/<type>.ts` (schema line, prompt line, field bounds; three types gain fields and `type_fields`).
- `tests/fixtures/extractionCalls/*.json` (25 captured requests regenerated), `tests/documentTypes.test.ts`, `tests/verifyChecks.test.ts`, `tests/spouseIdentity.test.ts`, `tests/provenFacts.test.ts` (answer fixtures lose `amounts`).
- `evals/stages.ts` (the `amount` expectation removed), `evals/cases/extract_document.json` (12 cases converted to `fields`), `evals/README.md`, `.claude/skills/add-eval-case/SKILL.md`.
- `docs/agents.md` (helper list, field sets, the `verify_extraction` paragraph), `docs/pipeline.md` row 7 if it names the check.
- `web/src/i18n.tsx` keeps the `amounts` label for old rows; no UI change.
- Notion: the per-type pages under "4. Document extraction" and the `verify_extraction` code gate's "Checks per type" cards (per `STYLE.md`).
- No migration, no API change, no rewrite of stored records.
