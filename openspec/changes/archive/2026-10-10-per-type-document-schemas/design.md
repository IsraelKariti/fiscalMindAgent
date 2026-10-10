## Context

See proposal.md for motivation. Today:

- `catalog.ts` holds, per type, business content (names, descriptions, hints, papers, discovery question) **and** the extraction contract (`checks` flags, `fields`, `fieldsAnyOf`).
- `verifyChecks.ts` holds the common zod schema, `extractionSchemaFor` / `extractionJsonSchemaFor` (extend the base by the field list), `typeFieldsPromptBlock`, the one `EXTRACTION_PROMPT` with `{{type_context}}` / `{{date_context}}` / `{{validity_context}}` placeholders, and `runChecks`, which decides from the flags which checks to run.
- `extractionCall.ts` (`buildExtractionCall`, `checksFor`, `fieldsFor`) assembles the request; `verifyDocument.ts` (`documentTypeRules`, `extractDocumentData`, `checkExtractedData`, `recordVerifyExtractionStep`) runs it; `evals/stages.ts` and `scripts/verifyExtractionSample.ts` reuse the same functions; `src/gemini/llmStages.ts` shows one prompt and the base schema.
- Trace rows and stored verification records are keyed by the check keys (`legible`, `expected_type`, `subject`, `id_checksum`, `id_matches_client`, `spouse_adopted`, `co_owners`, `client_id_on_file`, `as_of_date`, `not_expired`, `amounts`, `type_fields`, `period_covers_valuation_date`) and by the `fields: [{key,label,value}]` list; `stepSummary.ts` and the step modal render them.

## Goals / Non-Goals

**Goals:**

- One file per document type that a reader can open and see the whole contract: the exact schema, the exact prompt, the exact checks.
- Checks are small named helpers; a type's `verify` is a plain ordered list of helper calls, no flag logic.
- Byte-for-byte identical trace rows, stored records, check keys and verdicts for the same model answer. Eval verdicts unchanged.
- The stages page shows every type's prompt and schema.

**Non-Goals:**

- Changing any prompt wording, any field, any check rule, or any catalog business content. (Per-type tuning becomes easy afterwards; it is not part of this change.)
- Splitting the classification/analysis stage or the catalog's papers per type.
- Changing the `verify_extraction` audit detail shape or the code-gates spec.
- Touching the Notion documentation pages (their content stays true).

## Decisions

**D1. Module shape.** New folder `src/agents/declarationOfCapital/documentTypes/`, one file per catalog key (`bankBalance.ts`, `securitiesPortfolio.ts`, `pensionProvident.ts`, `studyFund.ts`, `lifeInsuranceSavings.ts`, `realEstate.ts`, `mortgageBalance.ts`, `loanTaken.ts`, `loanGiven.ts`, `vehicle.ts`, `contentsInsurance.ts`, `businessOwnership.ts`, `crypto.ts`, `privateInvestment.ts`, `poaAccount.ts`, `priorDeclaration.ts`, `otherAssets.ts`) plus `generic.ts` (ad-hoc rows, `type_key` NULL or unknown). Each default-exports one `DocumentTypeSpec`:

```ts
interface DocumentTypeSpec {
  key: string;                       // catalog key, or 'generic'
  schema: z.ZodType<ExtractedAnswer>; // the full flat answer object, written out
  jsonSchema: Record<string, unknown>; // zodToJsonSchema(schema) minus $schema, computed once at module load
  prompt: string;                    // the full system prompt, with ITEM placeholders only
  fields: readonly TypeField[];      // { key, kind, labelHe, required, pattern?, patternHintHe? } — trace labels + evals judge
  fieldsAnyOf?: readonly string[];
  verify(answer: ExtractedAnswer, ctx: CheckContext): ChecksVerdict;
}
```

Alternative considered: keep a base zod object and `.extend()` per module. Rejected: the owner asked for each schema written out; the guard test (D5) is what keeps copies honest.

**D2. Prompt placeholders.** Each module's `prompt` is the whole text (the untrusted-content doctrine, the common field instructions, the accepted forms for the type, the type's analysis hint, the type's field lines, the valuation-date line when the type is date-dependent, the valid-until line when it carries a validity date). Only values that vary per checklist row stay as placeholders: `{{expected_name}}`, `{{expected_description}}`, `{{paper_context}}`, `{{tax_year}}`. `buildExtractionCall` fills these four and nothing else. `{{type_context}}`, `{{date_context}}`, `{{validity_context}}`, `{{filename}}` disappear.

The type description currently repeated "when it differs from the row description" is kept as the literal "מסמכים קבילים לסוג זה: …" line in the module prompt (always present for typed rows; a row whose description equals the catalog text simply sees it twice, which is harmless and simpler than the old conditional).

**D3. Check helper library.** `verifyChecks.ts` keeps the shared types (`ExtractedFields`, `ExtractedAnswer`, `DocumentParty`, `CheckContext`, `CheckResult`, `ChecksVerdict`), the id utilities, `typeFieldValue`, and gains one exported helper per check, each returning `CheckResult[]`:

- `legibleCheck(answer)`, `expectedTypeCheck(answer, ctx)`
- `identityChecks(answer, ctx, { subjectMatch })` → `{ checks, identity }` (subject, id_checksum, id_matches_client, spouse_adopted, co_owners, client_id_on_file, in today's order)
- `asOfDateCheck(answer, ctx)`, `notExpiredCheck(answer, ctx)`, `amountsCheck(answer)`
- `typeFieldsCheck(answer, ctx, fields, anyOf)`, `periodCoversValuationDateCheck(answer, ctx, fields, from, to)`
- `verdictOf(checks, identity)` → `ChecksVerdict` (passed/reasons ignore `client_id_on_file`, as today)

`runChecks` is deleted. `CheckContext` loses `checks`, `fields`, `fieldsAnyOf` (the module knows them). A type's `verify` reads like:

```ts
verify(answer, ctx) {
  const { checks: identity, identity: who } = identityChecks(answer, ctx, { subjectMatch: true });
  return verdictOf([
    ...legibleCheck(answer), ...expectedTypeCheck(answer, ctx), ...identity,
    ...asOfDateCheck(answer, ctx), ...amountsCheck(answer),
    ...typeFieldsCheck(answer, ctx, FIELDS),
  ], who);
}
```

**D4. Registry.** `documentTypes/index.ts` exports `DOCUMENT_TYPES: readonly DocumentTypeSpec[]` (the 17 typed modules) and `documentTypeSpec(typeKey: string | null | undefined): DocumentTypeSpec` (falls back to `generic`). `catalog.ts` does not import it (no cycle); the registry test joins the two by key.

**D5. Guard test (`tests/documentTypes.test.ts`).** For every module: schema is a flat object; it has every common key with the common type; every non-common key appears in `fields` and in the prompt as a line starting with `- <key>:`; every `fields` key is in the schema; `fieldsAnyOf` keys exist; no key collides with a common key. Set equality between catalog keys and module keys. Snapshot-style check that `buildExtractionCall` for each type yields a prompt and schema equal to the pre-change output, captured once into `tests/fixtures/extractionCalls/<key>.json` during implementation (task 2.9) and asserted afterwards. This is the mechanical proof of "same request as before".

**D6. Catalog cleanup.** `VerificationChecks`, `ExtractionField`, `FieldKind`, `GENERIC_CHECKS`, `SAVINGS_FIELDS` and the three per-type properties leave `catalog.ts`. `dateDependent` stays (used by the analyzer and names). `TypeField`/`FieldKind` move to `documentTypes/types.ts`.

**D7. Consumers.**
- `extractionCall.ts`: `checksFor`/`fieldsFor` removed; `buildExtractionCall` takes `documentTypeSpec(doc.type_key)`, fills the four placeholders, uses `spec.jsonSchema`. Exports `documentTypeSpec` re-export for the harness.
- `verifyDocument.ts`: `DocumentTypeRules` becomes the spec; `extractDocumentData` parses with `spec.schema`; `checkExtractedData` calls `spec.verify`; `recordVerifyExtractionStep` labels from `spec.fields`.
- `evals/stages.ts` and `scripts/verifyExtractionSample.ts`: same substitution; the judge reads `spec.fields` for kinds and `spec.verify` for the verdict.
- `llmStages.ts`: `LlmStagePrompt` gains optional `schema`; the extraction stage lists one variant per module (`variant: spec.key`, `schema: spec.jsonSchema`), generic last; `stage.schema` stays the generic one. `AdminLlmStages.tsx` renders a variant's own schema table under that variant when present; the stage-level schema block is shown only for variants without one.

**D8. Tests.** `tests/verifyChecks.test.ts` keeps the id/name/helper tests, rewritten against the helpers; the per-type scenarios (vehicle expiry, contents period, bank/study-fund fields, savings any-of) move to `tests/documentTypes.test.ts` and call `spec.verify`. `tests/capitalCatalog.test.ts` drops its field-uniqueness assertions (moved to the registry test).

## Risks / Trade-offs

- [18 copies of the common prompt and schema can drift] → D5 guard test plus the captured per-type fixtures; the stages page makes each visible for review.
- [A subtle wording change slips in while copying] → fixtures captured from the pre-change builder before any module is written (task 1.4), compared after.
- [Longer files, more to read when a common rule changes (e.g. a new party role)] → accepted by the owner; the helper library still centralises the logic, only the text and the schema literals are repeated.
- [Evals re-judge depends on stored outputs] → run `npm run evals:rejudge -- --in evals/results/<last run>.json` (per the run-evals skill) and compare to the last run; no live model calls needed.

## Migration Plan

No data migration. Deploy as a normal push. Rollback = revert the commit; stored records are unaffected either way.
