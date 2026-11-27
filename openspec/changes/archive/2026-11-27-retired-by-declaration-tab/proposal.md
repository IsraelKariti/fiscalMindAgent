## Why

The documents tab puts every retired row under one tab, "הוחלפו במסמכים אחרים" (replaced by other documents). Two different things land there: a row the requirements ladder replaced by **other papers** (contract → purchase-tax assessment + Tabu extract, appendix retired by a proven private seller), and a row replaced by the **client's own declaration** (a missing contract → the property cost declaration; a missing licence or receipt → the client's vehicle declaration). For the accountant these are not the same: the first still rests on documents, the second rests only on the client's word and is the kind of row they want to see at a glance before signing the declaration. Today the contract of "בית בקיבוץ שדה נחום" sits under "replaced by other documents" although what replaced it is a written declaration.

## What Changes

- Every retirement records **what replaced the row**: other documents, or the client's declaration. The planner's answer does not say this; the apply step derives it from the same answer (a declaration-paper item of the same type added, stated or reused in that answer) and stores it on the row.
- The documents tab shows retired rows in **two tabs**: "הוחלפו במסמכים אחרים" (replaced by other documents) and a new "הוחלפו בהצהרת הלקוח" (replaced by the client's declaration). Each row's badge says which of the two it is. Rows retired before this change keep the old tab (nothing recorded for them).
- The retire step in the trace and the audit event name what replaced the row.
- No change to the planner prompt, tools, gates, progress count, or row actions (return to required / remove stay as they are).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `workspace-documents`: retired rows are split into two tabs by what replaced them, with a matching badge per row; the rule that decides which tab a retirement lands in.

## Impact

- Database: migration `075` adds `client_documents.replaced_by` (`'documents' | 'client_declaration' | NULL`).
- Backend: `src/db/queries/clientDocuments.ts` (`retire` takes the replacement), `src/agents/declarationOfCapital/plan.ts` (`applyRetirements` derives it), a new pure module for the rule, `toolStepDetails.ts` (`retireDocumentDetail` shows it), `src/db/types.ts`, `docs/pipeline.md`, `docs/agents.md`.
- Web: `web/src/api.ts` (row field), `web/src/components/DocumentsCard.tsx` (second retired tab + badge), `web/src/i18n.tsx` (labels), `web/src/styles.css` (tab dot colour).
- Tests: a unit test for the rule, the existing `toolStepDetails` test extended.
- Production needs migration 075 (it already waits on 062-074 per the deploy flow).
