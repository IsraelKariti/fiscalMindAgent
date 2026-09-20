## Context

See proposal.md — Why. The pieces that exist today:

- `document_files.label` holds a child's display name. It is set in two places: `classifyAndStore` in `analyzeInboundFile.ts` (matched list document's name, else `null`) and the `proposedPairs` loop of `plan.ts` (the linked document's name). Every screen and the download route already read `label`.
- `splitChildNames.ts` is a pure module (`childDisplayName`, `childDownloadName`) with its own test file.
- The stored analysis of every file carries `document_type` — a closed value: a catalog key or `'other'` — and `issuer_name`, the company as the model wrote it.
- `identifyInstitution(text)` in `institutions.ts` turns a text into exactly one institution key, or `null` (none, or two different companies). The institutions table has an English display `name` and a list of `aliases`; the first alias is often a legal-entity name ("הראל פנסיה וגמל"), so it is not a good display name for every file of that brand.
- The catalog's `nameHe` is a long row name with a date ("אישור יתרת קרן השתלמות ליום 31.12.{{tax_year}}"). There is no short type name.

Constraint carried over from `meaningful-split-file-names`: a name never holds model text or file text.

## Goals / Non-Goals

**Goals:**
- An unmatched child shows what it is and from which company, using only words that live in our code.
- One place decides a child's name, so the two call sites cannot drift.

**Non-Goals:**
- No change to matching, to `validate_classification`, to the strict company check, or to what the planner sees.
- No name for files that were never split (unchanged rule of the spec).
- No telling apart two children of the same type and company by account number — the account numbers are model text. The page range next to the name does this.
- No web change.

## Decisions

### 1. The type word is a new short name in the catalog
Add `shortNameHe` to every `CapitalDocumentType` ("קרן השתלמות", "קופת גמל / פנסיה", "חשבון בנק", …). Required field, so a new type cannot be added without one; `tests/capitalCatalog.test.ts` checks it is non-empty, has no digits and no `{{`.

*Instead of* rendering `nameHe` with the client's tax year: that would print "ליום 31.12.2025" on a file whose date no code has checked — the name would claim something the verification step has not confirmed. *Instead of* the model's `document_kind`: model text, forbidden.

### 2. The company word is a new Hebrew brand name in the institutions table
Add optional `nameHe` to `Institution` and a helper `institutionLabelHe(key)` that returns `nameHe`, else the English `name`. `nameHe` is the short brand form ("הראל", "אלטשולר שחם", "בנק לאומי"). Rule, enforced by a test in `tests/institutions.test.ts`: `nameHe` must be one of the entry's own `aliases`. So filling it is picking one existing alias per entry — nothing is written from memory, which keeps the table's "from the registers only" rule. The four foreign banks with no Hebrew alias get no `nameHe` and show their English name.

*Instead of* the first alias: it is often the pension arm's legal name and would mislabel an insurance file of the same brand. *Instead of* the English `name`: every other word on the screen is Hebrew.

The company is found with the existing `identifyInstitution(analysis.issuer_name)`. The model's text is only the input of the lookup; the output is a table key, and the name shows the table's words. An unknown company or two companies → `null` → type word alone. This is the same lookup the strict company check already trusts.

The company word is added for every known type, not only institution-bound ones: if the table recognises the company, showing it is correct for a mortgage or a loan too. `issuer_name` is already stored for every type.

### 3. One pure function decides the name
In `splitChildNames.ts`:

`childLabel({ matchedDocumentName, documentType, issuerName, quarantined })` → `string | null`

1. quarantined → `null`
2. a matched document name → `childDisplayName(name)` (today's behaviour)
3. type is a catalog key → `shortNameHe`, plus ` — <institutionLabelHe>` when the company is identified; cleaned and capped by the existing `childDisplayName`
4. otherwise (`'other'`, missing, unknown key) → `null`

`splitChildNames.ts` starts importing `catalog.ts` and `institutions.ts`; both are pure, so its tests still run without a database. `classifyAndStore` calls `childLabel` instead of `childDisplayName`. `plan.ts` is not touched: a planner link always has a document name, and there is no "unlink" path that would need the type-based name back.

### 4. One-time fill by script, not by migration
`scripts/backfillChildLabels.ts` (`npm run db:backfill-child-labels`): for every child row with `label IS NULL`, `analysis_status = 'done'` and no linked document, compute `childLabel` from the stored analysis and set it. Idempotent; prints how many rows it named. A SQL migration cannot do this because the words live in TypeScript. It is run by hand locally; production has no such rows worth a deploy step (no real clients), so it is not wired into the deploy flow.

## Risks / Trade-offs

- [Two children get the same name, as with pages 34-35 and 36-37 of the observed file] → the page range and the original file name are always shown next to the name (existing spec rule); the download name holds the page range too.
- [A type-based name looks like a match to the accountant] → the name has a different shape from a list name (short, no date), and the documents list still shows the child as not linked to any item. The spec states a name is never a match.
- [The model types a file wrongly, so the name is wrong] → same trust level as today's analysis line, which already shows the type; the name is display only and nothing is decided from it.
- [`nameHe` drifts from the table when the table is refreshed] → the alias-membership test fails the build.

## Migration Plan

1. Ship the code; new children get names at once.
2. Run `npm run db:backfill-child-labels` locally once.
3. Rollback: revert the commit; names already written stay in `label` and are harmless (they are replaced on the next classifier run or planner link).
