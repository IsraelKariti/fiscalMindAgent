## Context

See proposal.md — Why. Today's pieces that the change touches:

- `splitChildNames.ts` (`childLabel`): a matched child takes the matched item's name; only an unmatched child gets "short type — company". `identifyInstitution` / `institutionLabelHe` (`institutions.ts`) already give the company key and Hebrew name from the issuer the classifier reported.
- `plan.ts`, the `apply_collections` block: the planner's pairs pass `filterPairsByCompany` (a pair to an item that names no company is allowed on type agreement), then the cycle decides `newlyCollected` (a pending item with a strong classifier match or a paired verified file), links the files (`documentFiles.linkToDocument`, child label refreshed with `childDisplayName(docName(...))`), records the step detail (`collectionsStepDetail`) and picks one verification file per collected item (tier A = `fileMatchesDocument`, else the pair).
- `clientDocuments.resolveRequired` / `addInstances` already show the "rename the head row, insert siblings sharing `type_key`" transaction pattern, with `resolution_evidence` stored on every row.
- The classifier's stored `analysis.matched_document_id` on a file keeps pointing at the item the classifier was shown, even after the planner files the file elsewhere.

## Goals / Non-Goals

**Goals:**
- One place decides the company suffix for both a child's label and an item's name, so a child's label and the name of the item it ends under are the same string.
- The split is pure code over the pairs of one cycle (model proposes nothing new), transactional, and audited like other item creations.
- Verification runs once per resulting item against the file that put it there.

**Non-Goals:**
- Rewriting items or labels created before this change (the local test client stays as is).
- Merging a company-named item back, or splitting items of types that are not institution-bound.
- Letting a later file of a new company create an item without the client's words.

## Decisions

1. **Company suffix rule lives in `splitChildNames.ts` and is reused for item names.**
   Add `companySuffixedName(itemName, issuerName, institutions)`: returns `${itemName} — ${nameHe}` when `identifyInstitution(itemName) === null` and `identifyInstitution(issuerName)` is one key, otherwise `itemName`. `childLabel` calls it for a matched child (the matched item's `name` and `type_key` are passed in; the suffix applies only to institution-bound types). The split uses the same function for the renamed and created item names, so labels and item names agree without a second rule. Alternative: suffix only labels and keep item names — rejected by the user (option 2 chosen).

2. **The split is a pure function over this cycle's allowed pairs, applied in `plan.ts` before the collect decision.**
   New module `companySplit.ts` (pure, no db/llm imports, tests without a database): `planCompanySplit(pairs, fileById, documents, institutions)` groups the allowed pairs (`companyChecked.allowed` only — `newRowFiles.pairs` are excluded: those rows were created this cycle on the client's words and already name what the client said) by item; for an institution-bound item whose name identifies no company, it groups the item's files by the file's company key (unrecognised → stays on the original), orders companies by the first tied file, and returns `{ renames: [{documentId, newName}], created: [{fromDocumentId, name, companyKey, fileIds, evidence}], pairs: redirected pairs }`. `plan.ts` then calls one new DB function and rewrites `proposedPairs`, `documents`, and `proposedCollected` (created ids are added when the original id was proposed collected). Placing it before the collect loop means each created row is collected on its own paired verified file (tier B path) and verified separately. Alternative: split inside `classifyAndStore` at classification time — rejected: at that point the file is not yet tied (the planner may still redirect it), and the classifier has no cycle-wide view of the other files.

3. **One transactional DB function `clientDocuments.splitByCompany(clientId, plan)`.**
   Renames each head row (`name` only; status, description, evidence untouched — the item stays the client's agreed item) and inserts siblings with the head's `type_key`, `description`, status `pending` and `resolution_evidence = { source: 'file', file_id, issuer }`. Runs in one transaction like `resolveRequired`. Returns the created rows in plan order so `plan.ts` can map `created[i]` → row id and redirect the pairs. If the head row is no longer pending/claimed/collected (raced), the whole split is skipped for that item (files stay on the original) — logged, never half-applied.

4. **A new evidence variant `{ source: 'file'; file_id: string; issuer: string }`.**
   Added to `ResolutionEvidence` (`src/db/types.ts`) and mirrored in `web/src/api.ts`. `issuer` is the issuer as printed (sanitised, ≤200 chars) — stored for the audit trail only, never used as a name. `DocumentsCard` shows evidence only for not_required/retired rows, so no UI change; `stepSummary`'s `evidenceText` returns null for it (no quote), which is already handled.

5. **Evidence for another item is not evidence for this one.**
   `fileMatchesDocument` (`fileEvidence.ts`) additionally requires `file.client_document_id === null || file.client_document_id === documentId`. Without it, the Clal file (whose stored `matched_document_id` is the original item) would keep counting as a strong match for the renamed Harel item in later cycles, and could be picked as that item's verification file. With it, tier A stays correct after the split, and the verification target for a split item is its own tied file. Alternative: rewrite `analysis.matched_document_id` on the file — rejected: the classifier's isolated analysis is audit evidence and is never edited.

6. **Verification targets prefer this cycle's pair for an item touched by the split.**
   In the `verificationTargets` computation, for an item that the split renamed or created, the file is the (first) redirected pair for that item; other items keep tier A → pair as today. This is belt-and-braces with decision 5 (the links are written before targets are computed, but `files` is the cycle's snapshot loaded before linking).

7. **Step detail and audit.**
   `collectionsStepDetail` gains `split: { renamed: [{documentId, oldName, newName}], created: [{documentId, name, fromDocumentId, fromName, fileId, fileName}] }`; `stepSummary.ts` renders `renamed` as "old → new" and `created` as "name ← file" lines. The created rows are audited with the existing `document.instances_added` action (target: the original item, `detail.instances` = names, `detail.evidence` = the file evidence, `detail.reason: 'company_split'`), so the audit page needs no new action.

8. **Labels of tied children.** The existing `setLabel(childDisplayName(docName(match.document_id)))` in the link loop already refreshes each child to the name of the item it ends under; with `documents` updated after the split, the Clal child becomes "… — כלל" without extra code. Children that the classifier labelled with the suffix at classification time and that the planner ties to the same item get the same string.

## Risks / Trade-offs

- [Order of companies decides which company keeps the original row id] → The original id stays the client's agreed item either way; the name tells the accountant which company it is. Verification and audit rows carry ids and names.
- [A later file of a fourth company no longer matches] → Intended and stated in the spec: the agent asks, the client's words add the item. The `item names no company` gate rule stays for items never split.
- [Renaming an item changes what the classifier is shown next time] → Desired: a company-named item makes the classifier's and the gate's company check two-sided.
- [The head row raced into `approved` before the split] → `splitByCompany` only renames rows in pending/claimed/collected; otherwise the item is skipped and files stay on it as today.
- [`fileMatchesDocument` tightening changes tier A for files already filed elsewhere] → Only affects a file whose stored match differs from where it was filed; that is exactly the case where counting it as evidence was wrong.

## Migration Plan

No schema change. Deploy as usual (push to master → sandbox; manual promotion). Existing items and labels are not rewritten. Rollback: revert the commit; rows created by the split are ordinary pending/collected items and stay valid.
