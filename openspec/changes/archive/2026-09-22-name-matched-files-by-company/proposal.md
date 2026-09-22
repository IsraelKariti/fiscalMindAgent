## Why

When the client's questionnaire names a document type and a person but no company ("ביטוח מנהלים ניב"), the list gets one item with no company. Every file of that type from any company then matches that one item (since `accept-match-without-item-company`), and a child cut out of a multi-document PDF is shown under the item's name. So three executive-insurance children from Harel, Clal and Migdal all appear as "אישור להצהרת הון — ביטוח מנהלים / פוליסת חיסכון ליום 31.12.2025 — ניב", and the list still shows one item for what are three policies at three companies. The accountant cannot tell the files apart, and one list item is verified against one file while two more files hang off it unverified.

## What Changes

- **Child file names carry the company when the item does not.** A split child that matches a list item which names no company, and whose own company is recognised in the institutions table, is shown as the item's name followed by " — " and the company's Hebrew name from the table (for example "… — ניב — הראל"). The words still come only from our own lists; the model's free text is never used.
- **An item that names no company is split per company when files are tied to it.** When the planner ties one or more files with recognised companies to such an item, code renames the item after the first company and creates one sibling item per further company, each named the same way; every file goes to the item of its company. Each resulting item is collected and verified on its own file. This is a code rule at tie time, not a planner proposal, and it never adds a document type or a person the client did not name: it refines an item the client already agreed to.
- **The step trace and audit record the split** (which item was renamed, which items were created, from which files).
- Files of an unrecognised company, items that already name a company, and items of types that are not institution-bound are not affected.

Consequence to note: after the split, every resulting item names a company. A later file of a fourth company no longer matches any of them and is handled as today: it ends unmatched, the agent asks the client, and an item is created only on the client's words.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `file-splitting`: the requirement "A child file that matches a list document is named after that document" gains the company suffix for a matched item that names no company.
- `unlisted-files`: a new requirement that code splits an item naming no company into one item per recognised company when files are tied to it; the requirement "A list item is created only on the client's quoted words" states this code split as the one exception (it creates no new type or person).
- `conversation-trace`: the `apply_collections` step detail also records the company split (renamed and created items with their files).

## Impact

- `src/agents/declarationOfCapital/splitChildNames.ts` (child label rule), `fileTies.ts` or a new pure module for the split rule, `plan.ts` (apply the split before collecting and linking), `applyStepDetails.ts` (step detail), `src/db/queries/clientDocuments.ts` (transactional rename + sibling insert), `src/db/types.ts` (a file-based evidence variant for the created rows).
- `web/src/components/stepSummary.ts` (show the split in the step summary), `web/src/api.ts` (evidence type).
- `tests/splitChildNames.test.ts`, `tests/fileTies.test.ts` or a new test file, `tests/applyStepDetails.test.ts`.
- `docs/agents.md` (unlisted-files and file-splitting sections).
- No migration: the new evidence variant is JSON in the existing `resolution_evidence` column. Existing rows are not rewritten.
