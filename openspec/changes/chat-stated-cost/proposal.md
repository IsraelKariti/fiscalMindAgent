## Why

When a client cannot find the purchase paper of a car or a property, the office accepts a cost declaration: the client writes the price on a page, signs it and sends a photo. The agent already asks for this page (`prompt.md`, the vehicle branch and the real-estate second option; catalog `cost_declaration`). But the client usually just types the price in the chat ("הרכב עלה 85,000 ש"ח"), and today that message closes nothing: the item stays pending, the agent still asks for a signed page, and the client has to write the same number again on paper. The client's own WhatsApp message, from the client's own number, is as good a statement as the page — the system already treats such messages as evidence for every list decision (the `{message_id, quote}` rule of `unlisted-files`). What is missing is a way for a message to close a cost item, and a way for the accountant to see which message did it.

## What Changes

- **A cost declaration may be stated in chat.** The two cost-declaration papers (`real_estate` → `cost_declaration`, and the vehicle cost declaration) are marked in the catalog as papers the client may state in chat. For an item of such a paper, the planner's answer may carry the price the client stated, with the client's message and verbatim quote as evidence, instead of waiting for a file. No other item can be closed this way: bank balances, pension reports, pay slips and every other paper still need the real document.
- **The order stays paper first.** The agent asks for the receipt / purchase paper as today. Only when the client says it is missing does the agent accept the price from the chat (or still accept a signed page if the client prefers). If the client names a price before being asked about the paper, the agent asks once whether the receipt exists and accepts the price only after the client says it does not.
- **Code checks the statement.** `validate_message` accepts a stated cost only when: the target item (or the new instance) is a paper flagged as statable, the item is awaiting a document, the quote is verbatim in a stored inbound message of this client (the existing evidence rule), and the amount appears in that quote (as digits, with or without separators, or as "N אלף" / "N מיליון"). Otherwise the answer is rejected through `business_rules` with a note naming the reason, and the agent is told to ask the client to write the number in digits.
- **A new settled status: stated.** A new `apply_stated_costs` step sets the item to `stated` and stores the evidence on the row: the message id, the quote, the amount and the currency. `stated` counts as settled everywhere `approved` does (goal completion, the progress badge, the planner's intake status). The planner's document line shows "הוצהר בצ'אט: 85,000 ILS". A stated item never enters file verification and the answer that states it is a normal reply, not a collecting answer.
- **The accountant sees the message.** The documents card shows a stated row with its own badge ("הוצהר בצ'אט") among the settled rows, and under it the note "הלקוח מסר בצ'אט: "…"" with the quote. Clicking the note switches to the Conversation tab, scrolls to that message and highlights it briefly. The row's actions are those of an approved row (return to required, remove).
- **Vehicle items carry papers.** So that code can tell the vehicle cost declaration apart from the licence and the receipt without reading item names, `vehicle` declares papers: `vehicle_license`, `vehicle_purchase_document`, `vehicle_cost_declaration`. The existing paper machinery (instance `paper_key`, classifier paper, `matched_paper_agrees`, tie refusal) applies to vehicle items as it does to property items. Existing vehicle rows are backfilled by name prefix, as migration 060 did for properties.
- **Evals.** Planner cases: the client says the receipt is lost and names the price in the same message (cost-declaration instance added with the stated cost, receipt item retired, reply confirms the recorded amount); the client names a price while the receipt is still open and never said it is lost (no stated cost, the reply asks about the receipt); an existing pending cost-declaration item and a message with the price (stated); a price written in words only (rejected by the gate, the reply asks for digits).

## Capabilities

### New Capabilities

- `chat-stated-cost`: which items a client statement may close, the order rule (paper first), the planner's stated-cost answer, the `stated` status, its evidence, and its presentation in the planner prompt and in the workspace.

### Modified Capabilities

- `document-papers`: adds the statable flag on a paper, and `vehicle` as a second type with papers (three papers, backfill by name prefix).
- `code-gates`: `validate_message` gains the stated-cost checks (`stated_cost_item_allows`, `stated_cost_amount_in_quote`; the quote rule is the existing one); the new `apply_stated_costs` step row.
- `workspace-documents`: the status badge list and the actions menu gain `stated`; a stated row's note links to the message in the Conversation tab.
- `conversation-trace`: the `apply_stated_costs` step records the document name, the amount and the evidence like the other apply steps; the timeline gives every message a stable anchor the documents card can scroll to.

## Impact

- `src/agents/declarationOfCapital/catalog.ts` — `CatalogPaper.clientMayStateInChat`, `VEHICLE_PAPERS`, the two `descriptionHe` texts (chat statement accepted in place of the signed page).
- `src/agents/declarationOfCapital/decisionSchema.ts` — `stated_costs` (existing items) and `instances[].stated_cost` (new instances); `validateStatedCosts`; `DecisionContext.intake` carries the statable pending items.
- `src/agents/declarationOfCapital/plan.ts` — `applyStatedCosts` (step `apply_stated_costs`), `allSettled` counts `stated`; `prompt.ts` — the "הוצהר בצ'אט" line; `applyStepDetails.ts` — the step detail.
- `src/agents/declarationOfCapital/prompt.md` — the vehicle branch and the real-estate second option (chat statement accepted after the paper is declared missing; the "ask once about the receipt" rule); action 1ב gains the stated-cost field.
- `src/db/queries/clientDocuments.ts` — `markStated`; `src/db/types.ts` — `DocumentStatus` gains `stated`, `ResolutionEvidence` gains `{source:'chat', message_id, quote, amount, currency}`.
- `migrations/062_client_documents_stated.sql` — status check constraint gains `stated`; vehicle `paper_key` backfill by name prefix.
- `web/src/components/DocumentsCard.tsx`, `Timeline.tsx`, `ClientView.tsx`, `i18n.tsx` — badge, group, actions, the clickable note, `focusMessage` on the tab context, message anchors + highlight.
- `evals/cases/generate_message.json`, `evals/stages.ts` (the `stated_costs` check), `tests/intakeDecision.test.ts`, `tests/capitalCatalog.test.ts`, `tests/applyStepDetails.test.ts`.
- `docs/agents.md`, `docs/pipeline.md` (new named functions), Notion Accounting → Real estate and the vehicle page (one sentence each: the cost may be stated in chat).
- Production and the local DB need migration 062. Rows stated before a rollback would violate the old constraint only on write; a rollback must first return them to pending.
