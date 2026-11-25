## Why

A checklist item becomes "not required" (לא נדרש) in three different ways, and both screens hide which one it was: the client answered the intake questionnaire (wrote "no" or left the question empty), the client said so in the WhatsApp conversation, or the accountant marked the row by hand. The client's documents tab shows all of them under one "לא נדרשים" tab, and the admin documents tab counts the first two together as "נסגרו בשיחה" (closed in the conversation) — today a client with 11 "not required" rows reads 13 "closed in the conversation" although most of those 11 came from the form, not from the chat. The admin uses that column to judge what the agent's conversation actually achieved, so the two sources must be told apart.

## What Changes

- Every settled-without-file item gets a **source**: `form` (the questionnaire answered or left empty), `chat` (the client's words in the conversation — a "do not have" quote, a stated cost or vehicle, or a claimed paper) or `accountant` (marked by hand, no client words).
- The client's documents tab shows **three "not required" tabs** instead of one: "לא נדרשים — לפי השאלון", "לא נדרשים — לפי השיחה", "לא נדרשים — סומנו ידנית". Each appears only when it has rows and shows its count, like the other status tabs. Badge, note and row actions are unchanged.
- When the accountant marks a row "not required" by hand, the row keeps **no client quote** (today a quote that created the row as "required" stays on it and reads as if it were the reason).
- The admin documents tab replaces the one "נסגרו בשיחה" column and tile with **three**: closed from the questionnaire, closed in the conversation, marked by hand. Settled items (file + the three) and every cost-per-item figure are unchanged in total; the sort control offers the questionnaire and conversation counts instead of the old combined one.
- No change to the planner, the intake check, the catalog, the progress count or the retired tabs.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `workspace-documents`: the "not required" rows of the capital-declaration documents card are split into three tabs by source; a manual "not required" mark clears the row's client quote.
- `document-cost-analytics`: "items resolved from the conversation" becomes three counts (questionnaire, conversation, by hand) in the client list, the footer, the tiles and the sort control; settled items stay the sum.

## Impact

- Backend: `src/db/queries/documentCost.ts` (three item counts instead of `items_conversation`), `src/analytics/documentCost.ts` (figures, tiles, footer), `src/api/documentCostAdmin.ts` (reply shape follows), `src/agents/declarationOfCapital/router.ts` (manual "not required" clears `resolution_evidence`), `docs/agents.md` (the three sources).
- Web: `web/src/api.ts` (reply fields), a new pure helper for the source of a row, `web/src/components/DocumentsCard.tsx` (three tabs), `web/src/components/DocumentCostTab.tsx` + `documentCost.ts` (columns, tiles, sorts), `web/src/i18n.tsx` (labels), `web/src/styles.css` (tab dot colour).
- Tests: `tests/documentCost.test.ts` extended; a new unit test for the row-source helper.
- No migration: the source is derived from the stored `resolution_evidence` (its `source` field, or its absence). Rows already in the database split correctly without a backfill.
