## Context

See proposal.md — Why. Today `clientDocuments.retire` sets `status = 'retired'` and stores the client's quote (or the proving file) as `resolution_evidence`; nothing says what replaced the row. The planner's `retire_document` tool carries only `document_id` plus evidence. In the same answer the planner adds the replacement: `added_instances` (with `paper_key`, possibly a `statedCost` / `statedVehicle` at creation), `state_cost` / `state_vehicle` on an existing declaration item (`decision.statedCosts` / `decision.statedVehicles`). `applyAdditions` runs before `applyRetirements`, so the rows created this cycle (`changes.createdWithFiles`, with their `paper_key`) are already known when a retirement is applied. The catalog marks the declaration papers with `clientMayStateInChat` (`paperMayBeStatedInChat`): `cost_declaration` of `real_estate`, `vehicle_declaration` of `vehicle`.

The web card builds one tab per status from `CAPITAL_GROUPS` and a `badges` map keyed by status; the row is served as `SELECT *` of `client_documents`, so a new column reaches the web with no route change.

## Goals / Non-Goals

**Goals:**
- One stored fact per retired row: replaced by `documents` or by `client_declaration`.
- Derived in code from the same answer, deterministic, visible in the trace step and the audit event.
- Two retired tabs and two badges in the card; nothing else in the card moves.

**Non-Goals:**
- No new planner tool parameter, prompt text, or gate rule.
- No backfill of rows retired before the change (they stay in the documents tab).
- No change to the questionnaire intake: it creates the declaration item in place of the missing paper and never retires a row.
- No change to the closing summary, the goal count, or row actions.

## Decisions

1. **Derive the replacement in code, do not ask the planner.**
   Alternative: a `replaced_by` parameter on `retire_document` checked by a gate. Rejected: more model surface, more gate rules, and the answer already contains the fact (the declaration item it adds or states). A pure function reads it.

2. **Rule — "replaced by the client's declaration" when the same answer gives the client a declaration-paper item of the retired row's `type_key`.**
   Inputs: the retired row (`type_key`), the rows created this cycle (`changes.createdWithFiles[].row`), the existing rows the answer stated on (`decision.statedCosts` / `decision.statedVehicles` resolved against `run.documents`). True when any of those rows has the same `type_key` and `paperMayBeStatedInChat(paper_key)`. Otherwise `documents`. Same type is enough: an answer that retires a paper of one vehicle and declares another vehicle is not a case the ladder produces. The rule lives in a new pure module `src/agents/declarationOfCapital/retirementReplacement.ts` (`replacementOfRetirement`), unit-tested without a database, and is listed in `docs/pipeline.md` under `apply_retirements`.

3. **Store it as a column, `client_documents.replaced_by text NULL`, CHECK IN ('documents','client_declaration').**
   Alternative: fold it into `resolution_evidence`. Rejected: the evidence union is typed per source (quote / form / approved_file) and already drives the row note; a separate column keeps the note logic untouched and the web type simple. `retire(id, clientId, evidence, replacedBy)` writes it; `reopen` to pending (the existing `updateStatus` path) leaves it in place — harmless, since only `status = 'retired'` rows read it, and the next retirement overwrites it.

4. **Web: a second retired group with a predicate, not a new status.**
   `CAPITAL_GROUPS` entries get an optional `match(doc)` beside `status`: `retired` + `replaced_by !== 'client_declaration'` → `groupRetired`; `retired` + `replaced_by === 'client_declaration'` → `groupRetiredDeclaration` (tab key `retired_declaration`). The badge for `retired` picks its label by the same field. The `.doc-group-retired_declaration` tab dot reuses the retired colour.

5. **Trace and audit.** `retireDocumentDetail` outcome gains `replacedBy`; the audit `document.retired` detail gains `replacedBy`. No modal change: the step modal already prints the detail object.

## Risks / Trade-offs

- [An answer retires a row and adds the declaration in a later turn] → the row is recorded as `documents` and sits in the wrong tab. The ladder prompt and the vehicle spec make both happen in one answer; if a live case shows otherwise, the accountant's "return to required" plus the next retirement corrects it. Accept.
- [Old retired rows show no distinction] → stated in the spec; the owner can reopen a row to let the planner retire it again, or leave it.
- [Prod migration gap] → 075 is additive and nullable; the old code ignores the column, so deploy order does not matter.

## Migration Plan

1. Add `migrations/075_client_documents_replaced_by.sql`; run `npm run db:migrate` locally.
2. Deploy backend + web together (the web only reads the new field; a missing field falls back to the documents tab).
3. Rollback: revert code; the column stays unused.
