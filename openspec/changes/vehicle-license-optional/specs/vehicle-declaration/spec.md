## Purpose

The client's own statement about a vehicle as a checklist item: the agent's goal per vehicle, when the item is created, which facts it carries, how the planner states and extends it from the chat, the checks a statement passes, how it settles the declaration goal, and how the accountant sees it.

## ADDED Requirements

### Requirement: The goal per vehicle is the vehicle's facts, from the client
For every vehicle the client owns, the agent's goal SHALL be the facts the declaration lists — make, model, production year, licence plate and purchase cost — from the client. The vehicle licence (make, model, year, plate) and the purchase document (cost) SHALL be the preferred sources: the agent SHALL ask for both together, presenting them as helpful, and SHALL NOT call either of them mandatory, press for one the client cannot send, or ask why. A vehicle for which no licence or no purchase document ever arrives SHALL still reach a settled state. The agent SHALL still accept and tie a licence or a purchase document the client sends later, as any file.

#### Scenario: Both papers arrive
- **WHEN** the client sends the licence and the receipt of a vehicle and both are approved
- **THEN** the vehicle has no declaration item and the agent asks nothing more about it

#### Scenario: Agent asks for the papers
- **WHEN** the agent asks the client about a vehicle
- **THEN** the message asks for the licence and the receipt together as helpful papers, and does not say either is required

### Requirement: One client vehicle declaration per vehicle replaces the papers the client cannot send
When the client says they cannot send the licence or the purchase document of a vehicle — cannot find it, never had it, or any other reason — the agent SHALL add, once per vehicle, an item of the paper `vehicle_declaration` named "הצהרת הלקוח על הרכב — [the vehicle]" (reusing it when the vehicle already has one), SHALL retire the missing paper's item on the client's quoted words, and SHALL record on the declaration item the facts the client already wrote. When the client has not yet given the facts the missing paper would have carried, the agent SHALL ask once, in everyday words, for what the client knows (make, model, year and plate for a missing licence; the price, an estimate is fine, for a missing receipt). Whatever the client answers SHALL close the item, including "I don't know" for some or all facts; the agent SHALL NOT ask again. A retired paper item SHALL NOT appear in the closing summary and SHALL NOT be presented to the client as something they do not have. The questionnaire intake SHALL create the declaration item in place of a paper the form says the client lacks.

#### Scenario: Client cannot find the licence and names the car
- **WHEN** the list holds "העתק רישיון רכב — מאזדה 3" and "מסמך רכישה/קבלה — מאזדה 3", and the client writes "לא מוצא את הרישיון. זו מאזדה 3 משנת 2019, מספר 1234567"
- **THEN** the planner adds "הצהרת הלקוח על הרכב — מאזדה 3" with make מאזדה, model 3, production year 2019 and plate 1234567 stated from those words, retires the licence item citing them, and the reply does not ask for the licence again

#### Scenario: Client cannot find the licence and gave no facts
- **WHEN** the licence item of a vehicle is pending and the client writes "אין לי מושג איפה הרישיון"
- **THEN** the planner retires the licence item, adds the vehicle declaration item, and the reply asks once what the client knows about the car (make, model, year, plate), saying it is fine not to know all of it

#### Scenario: Client knows nothing more
- **WHEN** after that question the client writes "לא זוכר שום דבר חוץ מזה שזו מאזדה"
- **THEN** the planner states make מאזדה on the declaration item, the item is closed with the other facts empty, and the agent does not ask about them again

#### Scenario: No receipt and no idea of the price
- **WHEN** the receipt item of a vehicle is pending and the client writes "אין לי קבלה ואין לי מושג כמה עלה"
- **THEN** the planner retires the receipt item, adds (or reuses) the vehicle declaration item with no cost, the item is closed, and the agent does not press for a price

#### Scenario: Both papers missing
- **WHEN** the client earlier stated the car's facts after losing the licence, and now writes "גם קבלה אין לי, שילמתי בערך 85 אלף"
- **THEN** the planner adds the cost 85,000 to the same declaration item, retires the receipt item, and the vehicle has one declaration item carrying all facts

#### Scenario: Questionnaire says no receipt
- **WHEN** the questionnaire answer for a vehicle says there is no receipt
- **THEN** the intake creates "העתק רישיון רכב — [the vehicle]" and "הצהרת הלקוח על הרכב — [the vehicle]" (pending) instead of the receipt item

#### Scenario: Retired licence stays out of the closing summary
- **WHEN** the licence item of a vehicle was retired on the client's words and every other item is settled
- **THEN** the closing summary does not list the licence, neither as missing nor as something the client does not have

### Requirement: A vehicle statement names the item, the facts and the client's words
The planner's answer SHALL be able to state vehicle facts on an existing `vehicle_declaration` item (by its id) that is pending or already stated, and on a `vehicle_declaration` instance it creates in the same answer. Each statement SHALL carry at least one of: make, model, production year, licence plate, purchase cost (with a currency code, ILS by default), and evidence: the id of a stored inbound message of this client and a verbatim quote from it. Every number stated (year, plate, cost) SHALL be written in the quote as digits — a cost also as "N אלף" / "N מיליון" — and every text stated (make, model) SHALL appear in the quote; otherwise the statement SHALL be rejected with a note naming the fact, and the agent SHALL ask the client to write it plainly. A statement on an item of another paper, on an item that is approved, not required or retired, or with no fact at all SHALL be rejected. A statement on an already stated item SHALL add its facts: a fact not yet recorded is filled in, a fact already recorded is replaced by the newer statement, and the item keeps every statement's message id and quote. The property cost statement (`state_cost`) SHALL accept only the property cost declaration. Every rejection SHALL reject the whole answer the way a missing quote does, with a note naming the reason.

#### Scenario: Facts in the quote
- **WHEN** the quote is "זו מאזדה 3 משנת 2019, מספר 1234567" and the statement gives make מאזדה, model 3, year 2019, plate 1234567
- **THEN** the statement is accepted

#### Scenario: Year not in the quote
- **WHEN** the quote is "זו מאזדה 3" and the statement gives year 2019
- **THEN** the statement is rejected with a note naming the production year, and the reply asks the client for the year in digits

#### Scenario: Cost in thousands
- **WHEN** the quote is "שילמתי בערך 85 אלף" and the statement gives cost 85000
- **THEN** the statement is accepted

#### Scenario: Second statement adds the cost
- **WHEN** a declaration item is stated with make, model, year and plate, and a later answer states the cost 85,000 from a new quote
- **THEN** the item holds all five facts and both quotes

#### Scenario: Property cost tool on a vehicle item
- **WHEN** the planner calls `state_cost` on a `vehicle_declaration` item
- **THEN** the statement is rejected with a note that a vehicle is stated with the vehicle statement

### Requirement: A stated vehicle declaration is settled
A `vehicle_declaration` item closed by a statement SHALL have the status `stated` and SHALL count as settled everywhere an approved item does: the declaration goal, the attestation summary, the progress badge, the planner's intake status. The row SHALL keep its recorded facts and every statement's message id and quote. The planner's documents list SHALL show the item as stated with its recorded facts, and the agent SHALL NOT ask about a recorded fact again. A stated item SHALL never enter file verification. The accountant SHALL be able to return it to pending as for a stated cost.

#### Scenario: Goal completes with a vehicle declaration
- **WHEN** every item of the client is approved, not required or retired except one vehicle declaration that is stated with only the make
- **THEN** the declaration goal is complete and the attestation summary is sent

#### Scenario: Stated item in the planner prompt
- **WHEN** the planner is given the documents list after a vehicle declaration was stated
- **THEN** the item's line says it was stated in the chat and lists the recorded facts by name, with "לא ידוע" for each empty one

### Requirement: The accountant sees the vehicle declaration
The documents card SHALL show a stated vehicle declaration row with the existing "stated in chat" badge among the settled rows, and under it the recorded facts by name (empty facts shown as unknown) and one clickable note per client statement quoting the client's words; activating a note SHALL open the Conversation tab on that message as for a stated cost. The trace SHALL record the apply step that stated the vehicle facts, naming the item and the facts recorded.

#### Scenario: Card shows facts and quotes
- **WHEN** a vehicle declaration was stated in two messages (facts, then the cost)
- **THEN** its row lists make, model, year, plate and cost, and shows two clickable notes, each opening its own message in the conversation

#### Scenario: Trace step
- **WHEN** an answer states vehicle facts
- **THEN** the trace shows an apply step for the vehicle declaration naming the item and the facts recorded
