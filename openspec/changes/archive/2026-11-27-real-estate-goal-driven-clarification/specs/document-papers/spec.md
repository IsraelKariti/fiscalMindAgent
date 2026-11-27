## ADDED Requirements

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
