## Context

See proposal.md — Why. Today the catalog (`catalog.ts`) is a flat list of 17 types; each client starts with one `unresolved` row per type, the questionnaire mapping / planner turn a type into concrete instance rows that share the type's `type_key`, and every code gate compares types only (`matched_type_agrees`, the `type_differs` tie refusal). The classifier's closed `document_type` enum is built from the catalog keys. The `real_estate` type's description already lists its accepted papers in prose, and the intake prompt already tells the model to create one instance per paper with a fixed name prefix ("חוזה רכישה — …", "נספח תשלומים — …"), so the paper of an item is today encoded only in its name.

## Goals / Non-Goals

**Goals:**
- A second closed list, scoped under a type, that code can compare: item paper vs file paper.
- Zero change for types without papers and for rows created before the change.
- The paper flows through every place a `real_estate` item is created (questionnaire mapping, planner resolution, planner addition, company split copy).

**Non-Goals:**
- Declaring papers for `vehicle` (licence vs receipt) — same mechanism, separate change once this one is verified live.
- Changing which file `verify_extraction` picks for a collected item (separate bug fix).
- Per-paper extraction fields (the `fields` mechanism stays per type).

## Decisions

**D1 — Papers are a sub-list of a type, not new top-level catalog types.**
Alternative considered: new catalog keys `real_estate_contract`, `real_estate_tabu`, … Rejected because every catalog type is also an interview question and a questionnaire verdict: six new types would mean six seeded `unresolved` rows per client, six verdicts the mapping must give, and six "not required" rows in the Documents tab for a client with no property. The questionnaire asks about property once; which papers that property needs is decided per property. So the type stays the subject (`real_estate`) and the paper is a property of the instance.

**D2 — Storage: nullable `client_documents.paper_key` (migration 060).**
Alternative: encode the paper in `type_key` as `real_estate.purchase_contract`. Rejected: every `type_key` consumer (`getCatalogType`, `isInstitutionBound`, evals, the form intake enum) would need to split the key. A separate nullable column keeps old rows and ad-hoc rows valid with no backfill required. The migration also backfills `paper_key` for existing `real_estate` rows whose `name` starts with a paper's `shortNameHe` — cheap, idempotent, and it makes the local test client usable at once.

**D3 — Catalog shape.**
`CapitalDocumentType.papers?: readonly CatalogPaper[]` with `CatalogPaper = { key, shortNameHe, analysisHintHe? }`. Helpers: `getCatalogPaper(key)` (global, keys are unique across the catalog — enforced by a test like the field-key test), `papersOf(typeKey)`, `paperBelongsToType(paperKey, typeKey)`, `CAPITAL_DOCUMENT_PAPER_VALUES` (all keys, for the enums). The `real_estate` papers get the prose now in `descriptionHe` split per paper into `analysisHintHe` (what the paper looks like, what it is not — e.g. a registry extract is not a contract; a mortgage payments schedule is not a payments appendix).

**D4 — Classifier answer: `document_paper: enum(ALL_PAPER_KEYS) | null`.**
The prompt block lists, under each type that has papers, its papers with their Hebrew names. The gate normalises first: a paper that does not belong to the answered `document_type` becomes `null` (reported inside `matched_paper_agrees`'s note when it matters; no separate check, to keep the check list stable). Then `matched_paper_agrees` runs only after `matched_id_known` and `matched_type_agrees` passed and only when `row.paper_key !== null`. Order in the list: `matched_id_known`, `matched_type_agrees`, `matched_paper_agrees`, `issuer_matches_item`, `not_injection_suspected`, `legible`.

**D5 — Instances carry `paper_key` in both LLM schemas.**
`formIntakeRules` instance: `{ type_key, name, description, paper_key: string | null }`; the enum is all paper keys (one shared enum keeps the schema small). The gate drops the resolution (as it drops other instance faults) when the type has papers and `paper_key` is null or of another type, or when the type has no papers and `paper_key` is set. `decisionSchema` instances (`resolved_documents[].instances[]`, `added_instances[].instances[]`) get the same field; `normalizeInstances` receives the type key (resolution: from the row; addition: from the anchor) and throws the same way, surfacing through `business_rules`. `clientDocuments.resolveRequired` / `addInstances` / `splitByCompany` write the column (`splitByCompany` copies `head.paper_key`).

**D6 — Tie refusal reuses the type path.**
`fileTies.ts`: after the `type_differs` check, `else if (row.paper_key !== null && file.analysis?.document_paper !== row.paper_key) refuse('paper_differs')`. New `TieRefusal` value `paper_differs`, rendered in the `apply_collections` detail like the others. `companyRefusal` is untouched (`real_estate` is not institution-bound).

**D7 — Extraction prompt.**
`buildExtractionCall` adds, when `doc.paper_key` resolves to a paper: a line `הנייר המצופה: <shortNameHe>` after the expected name, and the paper's `analysisHintHe` in the type context block. `ExtractableDocument` gains `paper_key: string | null`. No schema change; `expected_type` unchanged.

**D8 — Child naming.**
`splitChildNames.ts` unmatched branch: `getCatalogPaper(analysis.document_paper)?.shortNameHe ?? getCatalogType(type)?.shortNameHe`, only when the paper belongs to the type (the gate already guarantees it). No change to the matched branch.

**D9 — Planner visibility.**
`prompt.ts` file line adds `document paper: <key>` after `document type`. `buildDocumentsSection` adds `נייר: <shortNameHe>` to items that carry a paper so the planner names the right paper when it creates siblings.

## Risks / Trade-offs

- [The classifier names the wrong paper for a genuine contract] → the contract is dropped to "matches no item" instead of being tied; the planner then asks the client about the file (existing unlisted-files flow), no data is corrupted. Eval case per paper guards the prompt.
- [Old `real_estate` rows not covered by the backfill (name does not start with a paper name)] → they keep `paper_key = NULL` and behave exactly as today; the admin can recreate them.
- [The shared paper enum grows as more types declare papers] → each type's prompt block lists only its own papers; the enum is only a validity net.
- [Prompt tokens grow slightly for classification and intake] → a handful of lines; within the existing size budget.

## Migration Plan

1. Migration `060_client_documents_paper.sql`: `ALTER TABLE client_documents ADD COLUMN paper_key TEXT NULL;` plus the name-prefix backfill for `type_key = 'real_estate'`. Run `npm run db:migrate` locally; production runs it on deploy.
2. Deploy code. Rows with `paper_key = NULL` are handled as before, so there is no ordering risk between schema and code beyond the column existing first.
3. Rollback: the column is nullable and unused by old code; reverting the code alone is safe.

## Open Questions

None that change the specs or tasks.
