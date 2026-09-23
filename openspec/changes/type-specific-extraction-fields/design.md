## Context

See proposal.md for why. Today:

- `verifyChecks.ts` holds the base zod `ExtractionSchema` (ten fields), the JSON schema derived from it, the Hebrew `EXTRACTION_PROMPT`, the `ExtractedFields` type and `runChecks`.
- `extractionCall.ts` builds the `extract_document` request: it fills `{{type_context}}`, `{{date_context}}`, `{{validity_context}}` from the catalog type's `descriptionHe`, `analysisHintHe` and `checks` flags, and always attaches the base JSON schema.
- `catalog.ts` declares each type with `checks: VerificationChecks` (four booleans) and an optional `analysisHintHe`.
- `verifyDocument.ts` parses the answer with the base schema, runs `runChecks`, writes the `verify_extraction` audit row (checks list, issuer) and stores the whole answer in the row's verification record.
- The evals harness (`evals/stages.ts`) and `scripts/verifyExtractionSample.ts` reuse the same builders, so they must keep working without a database.
- The step modal renders detail keys generically and the `checks` list with labels from `web/src/i18n.tsx`.

## Goals / Non-Goals

**Goals:**

- One declaration per type drives the schema, the prompt lines, the `type_fields` check, the step detail labels and the Notion page, so nothing can drift.
- No change for types that declare nothing: same schema bytes, same prompt text, same checks.
- The harness and the sample script keep building the exact production request.

**Non-Goals:**

- Feeding the typed values to the planner prompt or the documents card. The values are stored; a later change can use them.
- Changing the `amounts` check or the `checks` booleans of any type.
- A per-type zod schema file. Fields are data in the catalog, not code per type.

## Decisions

### 1. Fields are declarative data on the catalog type

```ts
export type FieldKind = 'text' | 'number' | 'date' | 'year';
export interface ExtractionField {
  key: string;            // stable; must not collide with a base key
  kind: FieldKind;
  labelHe: string;        // shown in the trace and the Notion page
  promptHe: string;       // what to read and where it sits on the document
  required: boolean;
  pattern?: RegExp;       // text only (e.g. /^\d{7,8}$/ for a plate)
  patternHintHe?: string; // the note text when the pattern fails
}
export interface CapitalDocumentType {
  …
  fields?: readonly ExtractionField[];
  /** At least one of these keys must be read (a type whose items are different papers). */
  fieldsAnyOf?: readonly string[];
}
export interface VerificationChecks {
  …
  /** The period read into these two date fields must cover 31.12 of the tax year. */
  periodCoversValuationDate?: { from: string; to: string };
}
```

The savings family shares one `SAVINGS_FIELDS` constant, as it shares `SAVINGS_CERTIFICATE_HINT_HE` today.

Why data, not zod per type: one list yields the zod shape, the JSON schema, the prompt lines, the runtime kind checks, the trace labels and the documentation. A zod object per type would need a parallel prompt text and a parallel label map, which is the drift the change exists to remove. `tests/capitalCatalog.test.ts` asserts key uniqueness against the base keys, non-empty labels and instructions, `fieldsAnyOf` keys that exist, and `periodCoversValuationDate` keys that are declared date fields.

### 2. One flat answer object: base schema extended per type

`verifyChecks.ts` gains:

```ts
export function extractionSchemaFor(type?: CapitalDocumentType) // zod: ExtractionSchema.extend(shapeOf(type.fields))
export function extractionJsonSchemaFor(type?)                    // zodToJsonSchema of the above, $schema removed
export type ExtractedAnswer = ExtractedFields & Record<string, unknown>;
export function typeFieldValue(answer, field): string | number | null // reads and normalises one field by kind
```

Kinds map to zod as `text → z.string().nullable()`, `number → z.number().nullable()`, `date → z.string().nullable()`, `year → z.number().int().nullable()`. `ExtractionSchema`, `extractionJsonSchema` and `ExtractedFields` stay exported unchanged for the base case and existing tests. When `type.fields` is empty or undefined, `extractionSchemaFor` returns the base schema object itself, so the JSON schema is byte-identical to today.

Why flat rather than a nested `fields` object: the answer the user reads in the trace and the stored record stay one level deep, as agreed with the owner; base keys stay typed on `ExtractedFields`, and the typed keys are read through `typeFieldValue`, which validates the kind at runtime (the model sometimes returns `""` for null, as the harness already tolerates for dates).

### 3. Prompt lines are generated into `{{type_context}}`

`buildExtractionCall` appends, after the hint, a block:

```
שדות ייעודיים לסוג מסמך זה — חלץ כל אחד מהם לשדה הנקוב, או null אם אינו מופיע במסמך:
- license_plate: מספר הרישוי, ספרות בלבד ללא מקפים …
- …
```

One line per field, in declaration order, and a closing line for `fieldsAnyOf` when present ("לפחות אחד מהשדות … חייב להימצא"). The base `EXTRACTION_PROMPT` text is untouched, so `#/llm-stages` still shows the template and the evals' stored prompts for untyped cases do not change.

### 4. Two new checks in `runChecks`, after `amounts`

`CheckContext` gains `fields?: readonly ExtractionField[]`, `fieldsAnyOf?: readonly string[]` (both taken from the catalog type by `checksFor`, which now returns `{ checks, fields, fieldsAnyOf }` or a sibling helper `fieldsFor(doc)` is added; the harness and `verifyDocument` pass the same). `runChecks(fields: ExtractedAnswer, ctx)`:

- `type_fields` runs when `ctx.fields` is non-empty. It walks the fields in order, normalises each value by kind (`typeFieldValue`), and collects the first problem: required and null → "השדה X לא נמצא במסמך"; `fieldsAnyOf` all null → "אף אחד מהשדות X / Y לא נמצא"; date not `^\d{4}-\d{2}-\d{2}$` → wrong form; year outside `1950..taxYear+1` → implausible; number not finite → not a number; pattern mismatch → `patternHintHe`. `observed` = `label: value` pairs joined by " · ", capped at six like `amounts`. Passed entries carry the same observed text.
- `period_covers_valuation_date` runs when `ctx.checks.periodCoversValuationDate` is set and both fields normalise to well-formed dates; string comparison of `YYYY-MM-DD` as the existing `not_expired` does. `observed` = "from – to", `expected` = `${taxYear}-12-31`.

Both are enforced (they count toward `passed`), unlike `client_id_on_file`.

### 5. Step detail carries labelled values

`verifyDocument.ts` adds `fields: [{ key, label, value }]` to the `verify_extraction` audit detail (value as the normalised string/number or null), only when the type declares fields. `web/src/components/stepSummary.ts` renders each entry as "label: value" under a "שדות שנקראו" line and marks `fields` consumed, so the generic fallback does not repeat it. The verification record on the row is unchanged in shape: it already stores the whole answer, which now carries the extra keys.

### 6. Evals judge the typed keys

`VerifyDocumentCase.expected` gains `fields?: Record<string, string | number | null>`. The judge compares each listed key: numbers within 0.005, text and year exactly, dates via the existing `dateOrNull` normalisation, null must be null. `verdict.failed_keys` may name `type_fields` and `period_covers_valuation_date`. New cases: `vehicle_licence_2025.pdf` (vehicle: plate, maker, model, year, `valid_until`), `altshuler_study_fund_2025.pdf` and `harel_study_fund_2025.pdf` (savings fields), `leumi_balance_2025.pdf` (bank fields), and a synthetic contents-insurance PDF built with the `add-eval-case` skill (one passing policy, one whose period ends before 31.12 to exercise `period_covers_valuation_date`). Existing cases get `fields` only where the sample's values are known; unlisted keys stay unjudged, as today.

### 7. Notion pages follow STYLE.md

The page "4. Extraction for verification" gets a "Type fields" section: cards two per row, one per catalog type, each a `<mention-page>` link to the type's child page with two gray lines (checks that apply, number of extra fields or "none"). Each child page (17): "What the declaration needs" (one or two sentences from `descriptionHe`, in simple English), "Accepted forms" (short bullets from the hint), "Common checks that apply" (bullets from the `checks` flags), "Extra fields" (one card per field: big title = label, small lines = key, kind, required, what to read; or the sentence "This type has no extra fields" ), "Checks that run" (bullets including `type_fields` and `period_covers_valuation_date` where relevant). The `verify_extraction` gate page adds the two checks under "Only when the document type needs it". The pages are written by hand from the catalog during apply; there is no generator.

## Risks / Trade-offs

- [The model fills a required field with a wrong value (the building sum as `contents_sum`)] → the instruction line names the trap for each field, the eval cases pin the expected value, and a wrong-but-present value still passes `type_fields`; catching a wrong value stays the accountant's job as today.
- [A longer schema and prompt raise the extraction cost for typed types] → at most five extra nullable keys and five short lines; the extraction runs once per document.
- [`vehicle` covers two different papers, so its fields are all optional and only the `fieldsAnyOf` pair is enforced] → a licence with an unreadable plate and a receipt with no cost both fail; a licence whose plate reads but whose maker does not still passes, which matches today's leniency.
- [Old verification records lack the keys] → nothing reads them back except the step modal and the documents card, both of which tolerate absent keys; no backfill.
- [The `amounts` check and `type_fields` can both fail on one document and produce two reasons for the client] → accepted for now; the owner can drop `checks.amounts` on typed types later once the typed values prove reliable.

## Migration Plan

No database migration. Deploy code; new verifications write the extra keys. Rollback is a code revert; records written with extra keys are still valid for the base reader.
