# chat-stated-cost Specification

## Purpose

How a client's own chat message, instead of a file, closes a cost-declaration item: which items allow it, the paper-first order the agent keeps, the checks the statement must pass, the `stated` status it produces, and how the accountant sees the message behind it.

## Requirements

### Requirement: Only a cost-declaration item may be closed by a client statement
A client statement in the conversation SHALL be able to close a checklist item only when the item stands for a paper the office accepts as the client's own declaration: the property cost declaration (`cost_declaration` of `real_estate`), closed by the cost statement this capability describes, and the client's vehicle declaration (`vehicle_declaration` of `vehicle`), closed by the vehicle statement of the `vehicle-declaration` capability — never by the cost statement. Every other item — every other paper, every type without papers, every ad-hoc row — SHALL keep needing a received document (or the accountant's hand). The set of statable papers is declared in the catalog, not inferred from item names.

#### Scenario: Property cost declaration stated
- **WHEN** the client writes "אין לי את החוזה, שילמתי על הדירה 1.2 מיליון" and the planner states the cost on the item "הצהרת עלות — דירה ברחוב הרצל 5" (paper `cost_declaration`)
- **THEN** the statement is accepted and the item is closed

#### Scenario: Vehicle cost declaration stated
- **WHEN** the client writes "אין לי קבלה, הרכב עלה 85,000 ש"ח" and the planner states the cost on the item "הצהרת הלקוח על הרכב — מאזדה 3" (paper `vehicle_declaration`) with the vehicle statement
- **THEN** the statement is accepted and the item is closed; the same cost given through the cost statement is rejected with a note that a vehicle is stated with the vehicle statement

#### Scenario: Bank balance stated
- **WHEN** the client writes "היתרה בלאומי היא 12,000 ש"ח" and the planner states that amount on the item "אישור יתרות בנק לאומי"
- **THEN** the statement is rejected, the item stays pending, and the agent keeps asking for the bank's document

### Requirement: The paper comes first, the statement second
The agent SHALL ask for the purchase paper (the contract, then the second option, for a property; the receipt for a vehicle) before accepting a stated cost. The agent SHALL accept a stated cost only after the client has said, in the conversation or in the questionnaire, that the paper is not in their hands. When the client names a price before saying anything about the paper, the agent SHALL ask once whether the paper exists, and SHALL accept the price only after the client answers that it does not. The client MAY still send a signed declaration page instead; a received page closes the item as any paper does today. For a vehicle the same order holds, and the price is then recorded on the client's vehicle declaration (the `vehicle-declaration` capability).

#### Scenario: Lost receipt and price in one message
- **WHEN** the receipt item of a vehicle is pending and the client writes "אין לי את הקבלה, שילמתי 85,000 ש"ח"
- **THEN** the planner adds the client vehicle declaration with the cost 85,000 stated from those words, retires the receipt item, and the reply confirms the recorded amount without asking for a signed page

#### Scenario: Price before the paper question
- **WHEN** the receipt item of a vehicle is pending, the client has not said whether the receipt exists, and writes "הרכב עלה 85,000"
- **THEN** no item is closed and the reply asks once whether the client has the receipt or purchase document

#### Scenario: Client answers the receipt is gone
- **WHEN** after that question the client writes "לא, אין לי"
- **THEN** the planner adds the client vehicle declaration with the cost 85,000 from the client's earlier message, retires the receipt item, and the reply confirms the recorded amount

#### Scenario: Client prefers to send a page
- **WHEN** a property cost-declaration item is pending and the client sends a photo of a signed page naming the price
- **THEN** the page is classified, tied and verified as a document, and the item is closed by the file as today

### Requirement: A stated cost names the item, the amount and the client's words
The planner's answer SHALL be able to state a cost in two places: on an existing pending cost-declaration item (by its id), and on a cost-declaration instance it creates in the same answer (as part of that instance), so the client never has to repeat the price in a later turn. Each stated cost SHALL carry the amount as a number, a currency code, and evidence: the id of a stored inbound message of this client and a verbatim quote from it. A stated cost whose amount cannot be found in the quote — as digits with or without thousand separators, or as "N אלף" / "N מיליון" — SHALL be rejected; the agent SHALL then ask the client to write the number in digits. A statement on an item that is not pending, or on a paper that is not statable, SHALL be rejected. Every rejection SHALL reject the whole answer the way a missing quote does today, with a note naming the reason.

#### Scenario: Amount with separators
- **WHEN** the quote is "שילמתי 1,250,000 שקל על הדירה" and the stated amount is 1250000
- **THEN** the statement is accepted

#### Scenario: Amount in thousands
- **WHEN** the quote is "הרכב עלה 85 אלף" and the stated amount is 85000
- **THEN** the statement is accepted

#### Scenario: Amount in words only
- **WHEN** the quote is "שילמתי שמונים וחמש אלף" and the stated amount is 85000
- **THEN** the statement is rejected with a note that the amount is not written as a number, and the reply asks the client to write the price in digits

#### Scenario: Amount not in the quote
- **WHEN** the quote is "אין לי את הקבלה" and the stated amount is 85000
- **THEN** the statement is rejected with a note that the quote does not contain the amount

#### Scenario: Item already closed
- **WHEN** the planner states a cost on a cost-declaration item that is already approved from a received page
- **THEN** the statement is rejected and the item is unchanged

### Requirement: A stated item is settled
A checklist item closed by a client statement SHALL have the status `stated`. A stated item SHALL count as settled everywhere an approved item does: for the completion of the declaration goal and the attestation summary, for the progress badge of the documents card, and in the planner's intake status. The row SHALL keep the evidence of the statement: for a stated cost the message id, the quote, the amount and the currency; for a vehicle declaration what the `vehicle-declaration` capability keeps. A stated item SHALL never enter file verification, and the answer that states a cost SHALL be an ordinary reply, not a collecting answer. The accountant SHALL be able to return a stated item to pending, which clears nothing from the audit trail and lets the agent ask again.

#### Scenario: Goal completes with a stated item
- **WHEN** every item of the client is approved, not required or retired except one property cost declaration that is stated
- **THEN** the declaration goal is complete and the attestation summary is sent as when every item is approved

#### Scenario: Stated item in the planner prompt
- **WHEN** the planner is given the documents list after a cost was stated
- **THEN** the stated item's line says it was stated in the chat with its amount and currency, and the intake status counts it as settled

#### Scenario: Accountant reopens
- **WHEN** the accountant returns a stated item to required
- **THEN** the item is pending again, the agent may ask for the paper or a new statement, and the earlier statement remains in the audit trail

### Requirement: The accountant sees the message behind a stated item
The documents card SHALL show a stated row with its own badge saying the item was stated in the chat, among the settled rows, and under it a note that quotes the client's words (for a vehicle declaration, the facts and one note per statement, as the `vehicle-declaration` capability describes). The note SHALL be clickable: activating it SHALL switch to the Conversation tab, scroll to the message the statement rests on, and highlight that message briefly. Every message bubble in the conversation SHALL therefore be addressable by its message id. When the message no longer exists, the note SHALL stay readable and do nothing on click.

#### Scenario: Open the message from the card
- **WHEN** the accountant clicks the note "הלקוח מסר בצ'אט: "אין לי את החוזה, שילמתי על הדירה 1.2 מיליון"" under a stated property item
- **THEN** the Conversation tab opens, scrolls so the client's message is in view, and the bubble is highlighted for a moment

#### Scenario: Stated row badge
- **WHEN** a property cost declaration was stated in the chat
- **THEN** its row shows a badge saying stated in chat, sits among the settled rows, and the progress badge counts it as done
