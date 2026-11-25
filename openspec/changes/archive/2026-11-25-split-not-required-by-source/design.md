## Context

See proposal.md — Why. The source of a "not required" row is already stored, only never read as such: `client_documents.resolution_evidence` (JSONB) holds `{ source: 'form' | 'form_empty', question, quote? }` when the intake questionnaire check settled the row (`formIntakeRules.ts` → `formIntake.ts`), `{ message_id, quote }` (no `source` field) when the planner's `resolve_document` settled it from the chat (`plan.ts` → `clientDocuments.resolveNotRequired`), and nothing when the accountant used the actions menu (`router.ts` PATCH, `updateForClient` leaves the column as it was). `stated` rows carry `{ source: 'chat' | 'chat_vehicle', message_id, … }` and `claimed` rows the planner's `{ message_id, quote }`; the questionnaire never creates a `claimed` row.

Two display surfaces read these rows: the capital-declaration documents card (`DocumentsCard.tsx`, one tab per `CAPITAL_GROUPS` entry, retired already split by a `match` predicate) and the admin documents tab (`documentCostAdmin.ts` → `db/queries/documentCost.ts` → `analytics/documentCost.ts` → `DocumentCostTab.tsx`), whose per-client counts are computed in SQL.

The unarchived change `retired-by-declaration-tab` adds the two retired tabs after "לא נדרשים"; this change inserts its three tabs where that single tab sits, so the retired tabs still follow.

## Goals / Non-Goals

**Goals:**
- One rule, applied identically in SQL and in the browser, that assigns every settled-without-file row to `form`, `chat` or `accountant`.
- A manual "not required" mark leaves a row that the rule classifies as `accountant` (no stale quote).
- Counts on the admin tab that match the client's tabs row for row.

**Non-Goals:**
- No change to how a row *becomes* not required (planner, intake check, catalog, manual transitions).
- No backfill migration; no new column.
- No link from a questionnaire quote to the questionnaire tab (a separate wish).
- No change to the `claimed` group's placement (it stays "closed in the conversation", as the spec defines today).

## Decisions

**D1 — Derive the source from the stored evidence; no new column.**
Rule, in priority order: `source ∈ {form, form_empty}` → `form`; evidence present (any other shape — a chat quote with or without a `message_id`, a vehicle statement) → `chat`; evidence absent (NULL) → `accountant`. `stated` and `claimed` rows are `chat` by status. Alternative: a `settled_by` column written at settle time, like `replaced_by` for retired rows. Rejected: every path that writes `not_required` already writes (or deliberately omits) the evidence, so a column would duplicate that fact and need a backfill; the retired case needed a column only because its derivation depended on *other* rows of the same answer.

**D2 — The SQL counts split into three (`items_form`, `items_chat`, `items_accountant`) and `items_conversation` is removed, not kept beside them.** Keeping the old sum as a fourth field would invite a later reader to double count. `itemsSettled` stays as the sum of file + the three, so every cost-per-item figure is unchanged in value. SQL: `d.resolution_evidence->>'source' IN ('form','form_empty')` for form; `d.status IN ('stated','claimed') OR (d.status = 'not_required' AND d.resolution_evidence IS NOT NULL AND COALESCE(d.resolution_evidence->>'source','') NOT IN ('form','form_empty'))` for chat; `d.status = 'not_required' AND d.resolution_evidence IS NULL` for accountant.

**D3 — The browser gets the same rule as one pure function, `notRequiredSource(doc)`, in a small module next to `DocumentsCard.tsx`, unit-tested from `tests/`.** `CAPITAL_GROUPS` gains three `not_required` entries with `match` predicates built on it (the mechanism `retired` already uses), keys `not_required_form`, `not_required_chat`, `not_required_accountant`. Alternative: have the server tag each row with its source. Rejected: the card already has the evidence object, and a second copy of the rule in the API would be one more place to drift; the SQL/TS pair is covered by the "column split matches the client's tabs" scenario.

**D4 — The manual PATCH to `not_required` clears `resolution_evidence`.** Today `clearEvidence` fires only for stated → pending. Extending it to `requested === 'not_required'` makes D1's `accountant` branch exact: a planner-created pending row keeps its creating quote until then, and that quote must not read as the reason for "not required". The audit event of the manual change already records the transition; the dropped quote stays in the earlier `document.resolved` audit row.

**D5 — Tiles: three tiles replace one; the "still open" note moves to the marked-by-hand tile.** Keeps the tile row self-explanatory (each tile = one group). The sort control offers `itemsForm` and `itemsChat`; `itemsAccountant` is not a sort key (rarely non-zero). The stored sort `itemsConversation` in an admin's localStorage falls back to `cost` through the existing whitelist check in `readStoredFilters`.

## Risks / Trade-offs

- [A `not_required` row written by some older path with evidence of an unexpected shape] → it lands in `chat` (D1's middle branch), never silently in `accountant`; the per-row note on the card shows the quote, so a wrong placement is visible.
- [SQL and TS rule drift] → the unit test for `notRequiredSource` fixes the three branches with the same evidence shapes the SQL names, and the apply step's live check compares one client's tabs to its admin row (spec scenario "Column split matches the client's tabs").
- [Wider admin table: 12 columns] → the table already scrolls horizontally in `admin-table-wrap`; headers are short Hebrew labels.
- [The admin's remembered sort was "items closed in the conversation"] → silently becomes "total cost"; acceptable, one-time.

## Migration Plan

No database migration. Deploy backend and web together (one image); the reply shape changes (`itemsConversation` → `itemsForm`/`itemsChat`/`itemsAccountant`) and the admin tab is the only reader. Rollback = revert the commit.
