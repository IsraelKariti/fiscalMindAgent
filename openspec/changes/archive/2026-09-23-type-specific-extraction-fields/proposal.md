## Why

The extraction call (`extract_document`) asks the model for the same ten fields for every document type. The type's hint in the catalog tells the model which value matters (the contents sum, not the building sum; the NAV column of 31.12, not the comparison column; the licence's "valid until", not the registration date), but the answer has no named place for that value: it lands in the loose `amounts` list under a free-text label, and the code only checks that the list is not empty and the numbers look sane. For a vehicle licence the answer has no place at all for the plate number, maker, model or year, which are exactly what the declaration states. So the office's load-bearing value is never read into a known field, never checked by code, and never shown by name in the trace.

## What Changes

- **A catalog type may declare its own extraction fields.** Each field has a stable key, a kind (text, number, date, year), a short Hebrew label, a Hebrew reading instruction for the model, whether it is required, and an optional format pattern. The ten common fields stay the same for every type.
- **The schema and the prompt are built from that one declaration.** The call builder merges the type's fields into the base answer schema (one flat object) and appends one instruction line per field to the system prompt. A type with no fields keeps today's schema and prompt unchanged.
- **First set of typed fields** (the types whose hint already names a load-bearing value): bank balance, securities portfolio, the savings family (pension/provident, study fund, life-insurance savings), mortgage balance, vehicle and contents insurance. The other nine types stay on the base schema in this change.
- **New code checks in `verify_extraction`.** `type_fields`: every required field of the type was read and is well formed (pattern, date format, plausible year); its observed value lists the values read by label, its note names the missing or malformed field. `period_covers_valuation_date`: for a type that declares a period (contents insurance), 31.12 of the tax year lies inside the policy period read from the document. Existing checks (including `amounts`) are unchanged.
- **The typed values are visible.** They are stored with the verification record as today (the whole answer is stored), and the `verify_extraction` step detail lists them with their Hebrew labels so the step modal shows them by name, not only inside the raw JSON.
- **Evals** judge the typed fields (exact value or numeric tolerance) and the two new check keys; new cases cover a vehicle licence, a study fund, a bank balance and a contents-insurance policy.
- **Notion documentation**: the "4. Extraction for verification" page gains a section on type fields with one card per document type; each of the 17 catalog types gets its own child page under it (accepted forms, base checks that apply, its typed fields with kind/required/instruction, and the checks that run). The `verify_extraction` gate page lists the two new checks.

Not in this change: fields for the other nine types, using the typed values in the documents card summary or in the planner prompt, and any change to the `amounts` check.

## Capabilities

### New Capabilities

- `document-extraction`: what the extraction call reads from a document: the common fields every type shares, the per-type fields a catalog type may declare, how schema and prompt derive from that declaration, the first set of typed fields, and how the values are stored and shown.

### Modified Capabilities

- `code-gates`: the requirement "Checks reported by each existing gate" gains two `verify_extraction` checks, `type_fields` and `period_covers_valuation_date`, with their observed/expected/note contract.

## Impact

- `src/agents/declarationOfCapital/catalog.ts` (field declarations, `fields` on `CapitalDocumentType`, `periodCoversValuationDate` on `VerificationChecks`), `verifyChecks.ts` (schema merge, prompt lines, `ExtractedFields` typing, the two new checks), `extractionCall.ts` (use the merged schema and the type's prompt lines), `verifyDocument.ts` (parse with the type's schema, add labelled fields to the step detail).
- `evals/stages.ts` (judge typed fields), `evals/cases/extract_document.json` (new cases), `evals/files/` (a synthetic contents-insurance PDF; the vehicle, study fund and bank samples already exist), `scripts/verifyExtractionSample.ts` (use the type's schema).
- `web/src/i18n.tsx` (labels for the two new check keys). No other UI change: the step modal already renders detail keys and checks generically.
- `tests/verifyChecks.test.ts`, `tests/capitalCatalog.test.ts` (field keys never collide with base keys; every field has a label and instruction).
- `docs/agents.md` (verification section). Notion: page "4. Extraction for verification", its 17 new child pages, and the `verify_extraction` gate page.
- No migration. The stored `verification.extracted` JSON simply carries more keys for new verifications; old records are not rewritten.
