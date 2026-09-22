## 1. Shared naming rule

- [x] 1.1 In `src/agents/declarationOfCapital/splitChildNames.ts`, add `companySuffixedName(itemName, issuerName, typeKey, institutions?)`: for an institution-bound type, when `identifyInstitution(itemName)` is null and `identifyInstitution(issuerName)` is one key, return `${itemName} — ${institutionLabelHe(key)}`; otherwise return `itemName` unchanged. Extend `ChildLabelInput` with `matchedDocumentTypeKey` and make `childLabel` pass a matched child through it (then `childDisplayName`). Verify: `tests/splitChildNames.test.ts` — matched item without company + Harel issuer → "<item> — הראל"; matched item without company + unknown issuer → item name; matched item that names a company → item name; non-institution type → item name; unmatched cases unchanged.
- [x] 1.2 In `src/agents/declarationOfCapital/analyzeInboundFile.ts`, pass `matched?.type_key` into `childLabel`. Verify: `npm run typecheck` passes.

## 2. Evidence for an item that is not evidence for another

- [x] 2.1 In `src/agents/shared/fileEvidence.ts`, make `fileMatchesDocument` also require `file.client_document_id === null || file.client_document_id === documentId`, and update its comment. Verify: `tests/fileEvidence.test.ts` — a file filed under another document is not a strong match for the one its stored analysis names; an unfiled file still is.

## 3. Split rule (pure)

- [x] 3.1 Add `src/agents/declarationOfCapital/companySplit.ts` with `planCompanySplit(pairs, fileById, documents, institutions?)` as in design decision 2: groups the allowed pairs by item; for an institution-bound item whose name identifies no company, groups its files by `identifyInstitution(file.analysis?.issuer_name)`; the first recognised company (by pair order) renames the head, each further one creates a sibling; unrecognised files stay on the head; returns `renames`, `created` (with `fileIds`, `companyKey`, `name` from `companySuffixedName`, `evidence: { source: 'file', file_id, issuer }`) and the redirected `pairs` (created entries reference their index until rows exist). Items that name a company, non-institution-bound items and pairs to rows created in this cycle are passed through untouched. Verify: new `tests/companySplit.test.ts` — three companies → one rename + two created, pairs redirected; three Meitav + one Mor → rename Meitav, one created for Mor holding one file, three files on the head; one company → rename only; unrecognised only → no change; item naming a company → no change; non-institution type → no change.

## 4. Database

- [x] 4.1 In `src/db/types.ts`, add the `{ source: 'file'; file_id: string; issuer: string }` variant to `ResolutionEvidence`; mirror it in `web/src/api.ts`. Verify: `npm run typecheck` and `cd web && npx tsc --noEmit` pass.
- [x] 4.2 In `src/db/queries/clientDocuments.ts`, add `splitByCompany(clientId, plan)`: one transaction that renames each head row (`name` only, `WHERE status IN ('pending','claimed','collected')`) and inserts its siblings with the head's `type_key` and `description`, status `pending`, and the file evidence; skips an item whose head did not match (returns it under `skipped`); returns the created rows in plan order. Verify: `npm run typecheck`; a manual run against the local DB with a throw-away client creates the rows and leaves nothing half-applied when the head is `approved`.

## 5. Planner

- [x] 5.1 In `src/agents/declarationOfCapital/plan.ts`, after `companyChecked` and before `proposedCollected`: call `planCompanySplit` on `companyChecked.allowed`, then `clientDocuments.splitByCompany`, then rewrite `proposedPairs` (redirected pairs with real row ids), reload or patch `documents` (renamed names, created rows), and add each created id to `proposedCollected` when its source id is there. Skipped items keep their original pairs. Verify: `npm run typecheck`; `tests` green.
- [x] 5.2 In the same block, compute `verificationTargets` so that an item renamed or created by the split takes its first redirected pair as the file (other items unchanged). Verify: a unit test in `tests/verifyBatchRules.test.ts` or `tests/companySplit.test.ts` for the target-picking helper if extracted; otherwise the live check in 8.1.
- [x] 5.3 Audit the created rows with `document.instances_added` (target: the source item; detail: instances names, evidence, `reason: 'company_split'`) and log the split. Verify: the audit page shows the row for the live check in 8.1.

## 6. Step detail and summary

- [x] 6.1 In `src/agents/declarationOfCapital/applyStepDetails.ts`, add the optional `split` argument to `collectionsStepDetail` and emit `split.renamed` (`documentId`, `oldName`, `newName`) and `split.created` (`documentId`, `name`, `fromDocumentId`, `fromName`, `fileId`, `fileName`). Verify: `tests/applyStepDetails.test.ts` — a split with one rename and one created item is rendered with names.
- [x] 6.2 In `web/src/components/stepSummary.ts`, render `split.renamed` as "old → new" and `split.created` as "name ← file" lines under labels `renamed_by_company` / `created_by_company`, and mark the keys consumed. Verify: `tests/stepSummary.test.ts` — the two lines appear and no leftover keys are shown.

## 7. Docs and specs

- [x] 7.1 In `docs/agents.md`, update the file-splitting naming paragraph (matched child of an item without company carries the company) and the unlisted-files section (the per-company split at tie time, the file evidence variant, the `fileMatchesDocument` filing rule, the "later file of another company is asked" consequence). Verify: the text agrees with the three delta specs.

## 8. Live check

- [ ] 8.1 SKIPPED (owner decision 2026-09-22: the inbound path needs a real Twilio file; verify on the next real client) — With the local stack running, create a test client whose questionnaire says "ביטוח מנהלים ניב" and send the same multi-document PDF (Harel, Clal, Migdal executive insurance) through the mock inbound path; confirm in the workspace that the list shows three executive-insurance items named with the companies, each with one file and its own verification result, that the children's names carry the companies, and that the `apply_collections` step modal lists the rename and the two created items. Verify: workspace documents tab and the step trace; record the client id in the change for cleanup.
