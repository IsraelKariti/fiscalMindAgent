## ADDED Requirements

### Requirement: The approved line of a property paper carries its proven facts
In the follow-up cycle after a verification batch, the APPROVED line of a `real_estate` document in the verification results SHALL carry the facts the approved file proved (ownership, purchase cost, seller kind, address, purchase year — whichever were read), in the same Hebrew form as the document list line. The reply SHALL confirm the document and SHALL NOT ask the client about a fact that line proves. A line of any other outcome, and a line of a document of another type, SHALL stay as today.

#### Scenario: Contract approved this turn, tabu unmatched
- **WHEN** the client sends one PDF that is split into a purchase contract and a tabu extract, the contract is approved with a private seller and a price, and the tabu extract matches no item
- **THEN** the single reply confirms the contract, asks only whether the tabu extract belongs to the same property and to the declaration, and asks nothing about second hand, builder, or a prior declaration

#### Scenario: Rejected contract carries no facts
- **WHEN** a purchase contract is rejected because the buyer's id is not the client's
- **THEN** its line carries the rejection reason and no proven facts, and the reply asks for a corrected document as today
