# document-papers Specification

## Purpose

The closed list of papers a document type accepts (for a property: purchase contract, payments appendix, land registry extract, …), how a checklist item and a received file each carry their paper, and the code checks that stop a file of one paper from being matched to an item of another.

## Requirements

### Requirement: A document type may declare a closed list of papers
A document type in the catalog MAY declare a list of papers: the concrete kinds of document the office accepts under that type. Each paper SHALL have a stable key that is unique across the whole catalog, a short Hebrew name with no date or year, and MAY carry a Hebrew anatomy hint for the file-reading models (where the paper's load-bearing content sits and which lookalike papers must not be accepted as it). A paper MAY be marked as one the client may state in the chat (the `chat-stated-cost` and `vehicle-declaration` capabilities); a paper without the mark SHALL always need a received document. The `real_estate` type SHALL declare these papers: `purchase_contract` (חוזה רכישה), `payments_appendix` (נספח תשלומים), `tabu_extract` (נסח טאבו), `purchase_tax_assessment` (שומת מס רכישה), `cost_declaration` (הצהרת עלות, statable in chat), `inheritance_order` (צו ירושה) and `builder_payments_report` (דוח מצבת תשלומים מהקבלן). The `vehicle` type SHALL declare these papers: `vehicle_license` (רישיון רכב), `vehicle_purchase_document` (מסמך רכישה / קבלה) and `vehicle_declaration` (הצהרת הלקוח על הרכב, statable in chat). The paper `vehicle_cost_declaration` SHALL no longer exist: a stored item that carried it SHALL be carried over to `vehicle_declaration` once, keeping its stated cost. A type that declares no papers SHALL behave exactly as before this change.

#### Scenario: Paper keys are unique
- **WHEN** the catalog is loaded
- **THEN** no two papers of the catalog share a key, and a catalog that breaks this rule fails the project's tests

#### Scenario: Type without papers
- **WHEN** a bank balance item (a type that declares no papers) is seeded, matched, tied and verified
- **THEN** nothing about its handling differs from before this change

#### Scenario: Only the two cost declarations are statable
- **WHEN** the catalog is loaded
- **THEN** exactly the papers `cost_declaration` and `vehicle_declaration` carry the statable mark

#### Scenario: Old vehicle cost declaration rows are carried over
- **WHEN** a client has an item with the paper `vehicle_cost_declaration` that was stated in the chat with the amount 85,000 ILS
- **THEN** after the carry-over the item carries the paper `vehicle_declaration`, is still stated, and its recorded facts hold the purchase cost 85,000 ILS and the original quote

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

#### Scenario: Planner creates a vehicle's papers
- **WHEN** the client says they own a Mazda 3 and have its receipt, and the planner creates the items "העתק רישיון רכב בתוקף — מאזדה 3" and "מסמך רכישה / קבלה — מאזדה 3"
- **THEN** the first item carries the paper `vehicle_license` and the second `vehicle_purchase_document`

### Requirement: The file check names the paper of a file
For every file it classifies, the file classifier SHALL name, beside the file's document type, the paper the file is, from the closed list of all papers in the catalog, or no paper when the file is of a type without papers or is none of that type's papers. A paper that does not belong to the file's document type SHALL count as no paper. The planner's file line and the step detail of `validate_classification` SHALL show the paper.

#### Scenario: Registry extract
- **WHEN** the client sends a land registry extract
- **THEN** the file's analysis names the type `real_estate` and the paper `tabu_extract`

#### Scenario: Paper of the wrong type
- **WHEN** the classifier names the type `vehicle` and the paper `purchase_contract`
- **THEN** the file's analysis carries no paper

### Requirement: A file is matched or tied only to an item of its paper
When the file classifier matches a file to an item that carries a paper, `validate_classification` SHALL keep the match only when the file's paper equals the item's paper, and SHALL drop it otherwise — also when the file carries no paper. The gate SHALL report this as the check `matched_paper_agrees`, with the file's paper (or "not identified") as the observed value and the item's paper as the expected value; the check SHALL be absent when no item was matched, when the match was already dropped by an earlier check, or when the matched item carries no paper. The same comparison SHALL guard every tie the planner proposes between a file and an item that carries a paper (a file paired with an existing item, and a file named for a new item): a tie whose papers differ, or whose file carries no paper, SHALL be refused and reported in the `apply_collections` step like the type refusal. A dropped or refused file SHALL stay unattached and be treated as a file that matches no item.

#### Scenario: Registry extract offered to the contract item
- **WHEN** a PDF is cut into a purchase contract (pages 1-4) and a registry extract (page 5), and the classifier matches both children to the item "חוזה רכישה — …" (paper `purchase_contract`)
- **THEN** the first match is kept; the second is dropped, `matched_paper_agrees` is reported failed with observed `tabu_extract` and expected `purchase_contract`, and page 5 ends as a file that matches no item

#### Scenario: Payments appendix
- **WHEN** the classifier matches a payments appendix to the item "נספח תשלומים — …" (paper `payments_appendix`)
- **THEN** the match is kept and `matched_paper_agrees` is reported passed

#### Scenario: Planner pairs a file of another paper
- **WHEN** the planner pairs the registry extract with the contract item in `apply_collections`
- **THEN** the pair is refused, the file stays unattached, and the item is not marked received because of it

#### Scenario: Old item without a paper
- **WHEN** the classifier matches a registry extract to a `real_estate` item created before this change, which carries no paper
- **THEN** `matched_paper_agrees` is absent and the match is handled as before this change

### Requirement: The papers of a property serve one goal
For every `real_estate` property, the papers the office collects SHALL serve one stated goal: proof that the client (or the spouse on file) owns the property, and proof of the purchase cost. A property that came by inheritance or as a gift needs proof of ownership only, because it is reported at a nominal cost. The catalog description and the planner prompt SHALL state this goal before the list of accepted proofs, and SHALL present the accepted proofs per route (second hand, from a builder, not delivered on 31.12, inheritance, gift, already in a prior declaration by our office, the second option, the cost declaration) as the ways to reach the goal, not as steps to follow in order. The planner SHALL ask the client how the property was received only when no approved paper settles it and the answer still decides which paper to ask for.

#### Scenario: Route question still needed
- **WHEN** a property has a pending contract item, no file was approved for it, and the questionnaire said only "bought"
- **THEN** the planner may ask whether it was second hand or from a builder, because the answer decides whether a payments appendix is needed

#### Scenario: Route question not needed
- **WHEN** the contract of a property is approved and its proven facts say the seller was a private person
- **THEN** the planner does not ask whether the property was second hand or from a builder, and does not ask for a payments appendix

#### Scenario: Prior-declaration question not needed
- **WHEN** the contract of a property is approved and proves ownership and the purchase cost
- **THEN** the planner does not ask whether the property was included in a prior declaration by our office, because the goal is met for that property

### Requirement: An approved paper's proven facts close the questions it answers
For an approved `real_estate` item, the system SHALL derive from the stored extraction the facts the paper proved: ownership (the names of the owners the document names, present when the document's ownership check passed), the purchase cost (price and currency, when read), the kind of seller (a private person or a builder, when read), the property address and the purchase year (when read). The planner's document list line of such an item SHALL show these facts in Hebrew after the item's status. The planner SHALL treat a proven fact as settled: it SHALL NOT ask the client about it, a private seller SHALL count as a second-hand purchase, and a builder seller SHALL count as a purchase from a builder. A file that is not approved (received, matched, rejected, or only analysed) SHALL settle nothing, as today. An item approved before this change whose extraction holds no typed fields SHALL show at most the ownership fact, and the planner SHALL behave for it as before this change.

#### Scenario: Approved contract shows its facts
- **WHEN** a purchase contract between private sellers and the client and the spouse, stating 320,000 USD, is approved for the item "חוזה רכישה — דינוביץ 47"
- **THEN** the item's list line carries the proven facts: ownership on the names of the two buyers, purchase cost 320,000 USD, seller a private person, and the address as printed

#### Scenario: Approved tabu extract shows ownership only
- **WHEN** a tabu extract is approved for the item "נסח טאבו — דינוביץ 47"
- **THEN** the item's list line carries ownership on the registered owners' names, and no purchase cost and no seller kind

#### Scenario: Matched but not yet verified
- **WHEN** a contract is matched to its item and the verification has not run
- **THEN** the item's list line carries no proven facts and the planner may still ask about the route

#### Scenario: Old approved item
- **WHEN** an item approved before this change, whose extraction holds parties but no typed fields, is shown to the planner
- **THEN** its line carries the ownership fact only, and the planner asks about the route as before when the route still matters

### Requirement: A proven seller kind drives the appendix item without a client quote
When an approved contract proves the seller kind, the planner SHALL make the one list change it implies, citing the approved file instead of a client quote: a private seller — retire the property's payments appendix item (and builder report item) when one exists; a builder seller — add the property's payments appendix item when none exists. The planner SHALL make no other list change on the strength of a file. The acceptance rules of these citations are in the `code-gates` capability.

#### Scenario: Private seller retires the appendix
- **WHEN** the property has a contract item and a payments appendix item from the questionnaire, and the contract is approved with a private seller
- **THEN** the planner retires the appendix item citing the approved file, and the reply does not ask for the appendix

#### Scenario: Builder seller adds the appendix
- **WHEN** the property has the contract item only and the contract is approved with a builder as the seller
- **THEN** the planner adds the item "נספח תשלומים — …" with paper `payments_appendix` citing the approved file, and the reply asks for the appendix

#### Scenario: Seller kind not read
- **WHEN** the contract is approved but the seller kind could not be read
- **THEN** the planner changes no item on its strength and asks the client about the route only if a pending item still depends on it

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
