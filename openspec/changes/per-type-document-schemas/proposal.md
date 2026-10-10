## Why

Today one generic builder assembles the extraction prompt and answer schema for every document type from a field list in the catalog, and one shared check function runs whichever flags that type turned on. The owner wants each document type to own its complete, prebuilt schema, prompt and check function in its own file, so the contract of one type (what the model reads, what the code checks) can be read, changed and tested in one place without reasoning about the generic machinery.

## What Changes

- A new folder of document-type modules, one per catalog type (17 types) plus one for ad-hoc checklist rows. Each module holds, written out in full: the type's answer schema (common fields included), the type's system prompt text, its field list (key, kind, Hebrew label) for the trace and the evals, and its own `verify` function that lists the checks it runs, in order.
- The shared "run every check from flags" function is replaced by a library of small named check helpers (legible, expected type, owner identity, as-of date, not expired, amounts, required/well-formed field, "at least one of" group, period covers the valuation date). A type's `verify` calls the helpers it needs; nothing is decided from flags.
- **BREAKING** (internal): the catalog no longer carries `checks`, `fields` or `fieldsAnyOf`; it keeps names, descriptions, hints, papers, discovery questions and the classification flags. Code that read those three properties reads the type module instead.
- The extraction call builder, the verification pipeline, the evals harness, the standalone sample script and the LLM-stages description read from one registry keyed by type.
- The admin `#/llm-stages` page shows the extraction stage with one prompt variant per document type, each with its own answer schema, instead of one generic prompt and the base schema.
- A unit test guards the set: every catalog key has exactly one module and vice versa, every module schema carries the common fields, every extra key is named in that module's prompt, and no extra key collides with a common key.
- Nothing changes in the trace, the stored verification records, the check keys, the observed/expected texts, or the client-facing behavior. Existing evals must produce the same verdicts.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `document-extraction`: the requirement that the schema and the prompt are derived from one declaration is replaced by "each document type owns its prebuilt schema, prompt and checks, kept in agreement by a test"; the "a type may declare extra fields" and "required fields are checked by code" requirements are reworded so the type's own module, not a catalog field list, is the source; a new requirement makes the admin stages page list every type's prompt and schema.

## Impact

- `src/agents/declarationOfCapital/documentTypes/` (new, 18 modules + index), `catalog.ts` (types and three properties removed), `verifyChecks.ts` (becomes the helper library; `runChecks` removed), `extractionCall.ts`, `verifyDocument.ts`.
- `evals/stages.ts`, `scripts/verifyExtractionSample.ts`, `src/gemini/llmStages.ts`, `web/src/components/admin/AdminLlmStages.tsx`.
- `tests/verifyChecks.test.ts` (split into helper tests and per-type tests), `tests/capitalCatalog.test.ts`, new registry test.
- `docs/agents.md`, `docs/pipeline.md` section E.
- No migration, no API change, no change to stored data.
