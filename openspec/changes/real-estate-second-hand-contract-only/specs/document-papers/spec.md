## ADDED Requirements

### Requirement: The papers of a property follow the way the client got it
For every `real_estate` property, the items the questionnaire mapping and the planner create SHALL follow the way the client got the property. Bought second hand: one item, the purchase contract (`purchase_contract`). Bought from a builder: two items, the purchase contract and the payments appendix (`payments_appendix`); when the flat was not delivered or not fully paid on 31.12 of the tax year, a third item, the builder's payments report (`builder_payments_report`). Inherited: the inheritance order (`inheritance_order`) and the tabu extract (`tabu_extract`). Gift: the tabu extract only. Already in a prior declaration made by our office: no documents. When the client said only that the property was bought, without saying second hand or from a builder, the mapping SHALL create the contract item only, and the planner SHALL ask the client which of the two it was and SHALL add the appendix item, quoting the client, when the answer is "from a builder". The planner SHALL NOT ask a second-hand buyer for a payments appendix.

The second option SHALL be offered only after the client says they cannot provide a purchase item (the contract for a second-hand purchase; the contract or the appendix for a purchase from a builder): the planner SHALL retire the purchase items of that property and SHALL add the purchase tax assessment (`purchase_tax_assessment`) and the tabu extract (`tabu_extract`), telling the client that the assessment is in the personal area of the Tax Authority website and where the tabu extract is issued. When the client reports that the assessment shows no purchase cost, the planner SHALL retire the assessment item and SHALL add a cost declaration item (`cost_declaration`): a paper on which the client writes the estimated purchase price and signs; the tabu extract SHALL stay required. Existing items are not changed by this requirement by itself: a client who already has both purchase items keeps them until the planner learns from the client that the purchase was second hand, and then retires the appendix item.

#### Scenario: Second hand needs the contract only
- **WHEN** the questionnaire says "דירה ברחוב הרצל 5, קניתי יד שנייה ב-2018"
- **THEN** the mapping creates one `real_estate` item, "חוזה רכישה — …" with paper `purchase_contract`, and no payments appendix item

#### Scenario: From a builder needs the contract and the appendix
- **WHEN** the questionnaire says "דירה חדשה מקבלן ברחוב הרצל 5, נמסרה ב-2023"
- **THEN** the mapping creates two items, "חוזה רכישה — …" (`purchase_contract`) and "נספח תשלומים — …" (`payments_appendix`), and no builder's payments report item

#### Scenario: Not yet delivered adds the builder's report
- **WHEN** the client writes that the flat was bought from a builder and will be delivered next year
- **THEN** the property has the contract item, the appendix item and a "דוח מצבת תשלומים מהקבלן — …" item with paper `builder_payments_report`

#### Scenario: Bought, source unknown
- **WHEN** the questionnaire says only "דירה ברחוב הרצל 5, נרכשה ב-2018"
- **THEN** the mapping creates the contract item only, and the planner's next message asks whether the flat was bought second hand or from a builder

#### Scenario: Planner learns it was from a builder
- **WHEN** the property has the contract item only and the client answers "קניתי מקבלן"
- **THEN** the planner adds the item "נספח תשלומים — …" with paper `payments_appendix`, quoting that message, and asks for both papers

#### Scenario: Planner learns it was second hand
- **WHEN** the property has the contract item and the appendix item (created before this change or by default) and the client answers "קניתי יד שנייה"
- **THEN** the planner retires the appendix item and keeps the contract item, and the reply asks for the contract only

#### Scenario: Contract lost, second option
- **WHEN** a second-hand buyer writes "קניתי את הדירה ב-1995 ואין לי את החוזה"
- **THEN** the planner retires the contract item, adds "שומת מס רכישה — …" (`purchase_tax_assessment`) and "נסח טאבו — …" (`tabu_extract`), and the reply offers them as the second option and says the assessment is in the personal area of the Tax Authority website

#### Scenario: Assessment shows no cost
- **WHEN** the client writes that the purchase tax assessment shows no purchase cost
- **THEN** the planner retires the assessment item, adds "הצהרת עלות — …" (`cost_declaration`), keeps the tabu extract item, and the reply asks the client to write the estimated price on a paper and sign it

#### Scenario: Second-hand buyer is not asked for an appendix
- **WHEN** the property has only the contract item and the client sends the contract
- **THEN** the planner ties the file to the contract item and the reply does not mention a payments appendix

## MODIFIED Requirements

### Requirement: A checklist item of a type with papers carries its paper
Every checklist item created for a type that declares papers SHALL carry the key of the paper it stands for. The questionnaire mapping and the planner SHALL name the paper of each instance they create for such a type, from that type's list only. Their gates (`validate_form_resolutions`, `validate_message`) SHALL reject an instance of such a type that names no paper or names a paper of another type, and SHALL reject a paper on an instance of a type that declares no papers. An item made by code from another item (the per-company and per-employer split) SHALL keep the paper of the item it was made from. Items created before this change, and items the accountant adds by hand, carry no paper and SHALL be handled as today; a one-time backfill MAY set the paper of an existing `real_estate` item whose name begins with a paper's Hebrew name.

#### Scenario: Questionnaire creates the property's papers
- **WHEN** the questionnaire says the client bought a house on Dinovitz 47 from a builder and the mapping creates the items "חוזה רכישה — …" and "נספח תשלומים — …" for it
- **THEN** the first item carries the paper `purchase_contract` and the second `payments_appendix`

#### Scenario: Questionnaire creates a second-hand purchase
- **WHEN** the questionnaire says the client bought a flat second hand and the mapping creates the item "חוזה רכישה — …" for it
- **THEN** the item carries the paper `purchase_contract` and no other `real_estate` item is created for that property

#### Scenario: Planner adds an inheritance item
- **WHEN** the client writes that a second flat came by inheritance and the planner adds the items "צו ירושה — …" with paper `inheritance_order` and "נסח טאבו — …" with paper `tabu_extract`, quoting the client
- **THEN** both items are created with those papers

#### Scenario: Instance without a paper
- **WHEN** the planner adds a `real_estate` instance and names no paper for it
- **THEN** `validate_message` rejects the answer through `business_rules`, and no item is created

#### Scenario: Paper of another type
- **WHEN** the questionnaire mapping names the paper `tabu_extract` on a `vehicle` instance
- **THEN** `validate_form_resolutions` drops that resolution with a note naming the wrong paper
