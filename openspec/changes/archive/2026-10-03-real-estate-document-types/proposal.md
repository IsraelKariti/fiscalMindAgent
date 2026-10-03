## Why

A property on the checklist needs several different papers (purchase contract, payments appendix, land registry extract, …), but the closed list of document types has one key for all of them: `real_estate`. The file classifier therefore cannot be stopped from matching a land registry extract to the "purchase contract" item — `validate_classification` only checks that the type keys agree, and they do. On 2026-10-03 this let a registry extract be matched to the contract item, the wrong file reached `verify_extraction`, the contract item was reopened, and a stranger from the registry extract was adopted as the client's spouse.

## What Changes

- The catalog gains a second closed list under a type: the **papers** of that type. A paper is one concrete kind of document the office accepts for the type (for `real_estate`: purchase contract, payments appendix, land registry extract, purchase tax assessment, cost declaration, inheritance order, builder's payments report). The `real_estate` type declares its papers in this change; the mechanism is generic so other types (vehicle) can follow later.
- A checklist item of a type that declares papers carries the paper it stands for (`client_documents.paper_key`). The questionnaire mapping and the planner set it when they create items; the gates reject an unknown paper or a paper of another type.
- The file classifier names the paper of the file from the closed list, next to its type. `validate_classification` adds the check `matched_paper_agrees`: a match to an item whose paper differs from the file's paper is dropped.
- The planner's ties (`apply_collections`, `file_ids` on new items) are refused when the file's paper differs from the item's paper, as the type check already does.
- The extraction call tells the model which paper is expected, so `expected_type` judges the paper and not only the type; the paper's own anatomy hint is fed to the file-reading models.
- A split child that matches no item is named after its paper ("נסח טאבו") instead of the type's short name ("נכס נדל"ן").
- The planner's file line and the step detail show the paper.
- **Non-goal:** the `verify_extraction` file choice (the planner's tie before the newest matching file) is a separate bug fix, not part of this change.

## Capabilities

### New Capabilities

- `document-papers`: the closed list of papers a document type accepts, how a checklist item and a file carry their paper, and the checks that compare them.

### Modified Capabilities

- `code-gates`: `validate_classification` reports the new check `matched_paper_agrees`; `validate_form_resolutions` and `validate_message` reject an instance whose paper is unknown or of another type.
- `unlisted-files`: the file check names the paper of the file; a tie between a file and an item of different papers is refused.
- `file-splitting`: an unmatched child of a type with papers is named after its paper.
- `document-extraction`: the extraction prompt names the expected paper and carries the paper's anatomy hint.

## Impact

- `src/agents/declarationOfCapital/catalog.ts` (paper declarations, helpers), `analyzeFile.ts` / `analyzeFileRules.ts` (schema field, prompt block, gate check), `formIntakeCall.ts` / `formIntakeRules.ts` (instance `paper_key`), `decisionSchema.ts` / `plan.ts` (instance `paper_key`, `apply_collections` refusal), `fileTies.ts`, `extractionCall.ts`, `splitChildNames.ts`, `prompt.ts`.
- `src/db/queries/clientDocuments.ts` and migration `060_client_documents_paper.sql` (nullable `paper_key`); `src/db/types.ts`.
- Web: `DocumentsCard.tsx` and the trace labels in `i18n.tsx` (`matched_paper_agrees`).
- Evals: `file_classification`, `questionnaire_schema_mapping`, `generate_message` cases gain paper expectations; stage descriptions in `src/gemini/llmStages.ts`.
- Existing rows keep `paper_key = NULL` and behave as today (no paper check). The Notion page "How classification works" is updated after the change ships.
