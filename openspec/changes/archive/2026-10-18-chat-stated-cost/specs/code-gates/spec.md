## ADDED Requirements

### Requirement: Checks reported for a stated cost
In addition to the checks listed for each existing gate, `validate_message` SHALL report these checks when the planner's answer states a cost (the `chat-stated-cost` capability), once per stated cost, in this order:

- `stated_cost_item_allows`: passes when the target item (or the new instance the cost is stated on) carries a paper marked statable in the catalog and, for an existing item, the item is pending; fails otherwise (`observed` = the item's paper or "no paper" and its status, `expected` = "a pending cost-declaration item").
- `business_rules`: fails, with the rejection message as `note`, when the evidence message is not a stored inbound message of this client or the quote is not verbatim in it (the existing evidence rule).
- `stated_cost_amount_in_quote`: passes when the stated amount appears in the quote as digits with or without thousand separators, or as "N אלף" / "N מיליון"; fails otherwise (`observed` = the quote, `expected` = the amount).

A failed check SHALL make the gate's `result` false and SHALL reject the whole answer, as a failed `business_rules` does today. The new step `apply_stated_costs` SHALL write one audit row per answer that states at least one cost, listing for each the document id and name, the amount, the currency and the evidence quote.

#### Scenario: Statement accepted
- **WHEN** the answer states 85000 ILS on the pending item "הצהרת עלות — מאזדה 3" with the quote "אין לי את הקבלה, שילמתי 85,000 ש"ח"
- **THEN** the `validate_message` row has `stated_cost_item_allows`, `business_rules` and `stated_cost_amount_in_quote` passed, and the `apply_stated_costs` row lists that item with 85000, ILS and the quote

#### Scenario: Amount not in the quote
- **WHEN** the answer states 85000 with the quote "אין לי את הקבלה"
- **THEN** `stated_cost_amount_in_quote` fails with the quote as `observed` and 85000 as `expected`, the gate's `result` is false, and no item changes

#### Scenario: Not a statable item
- **WHEN** the answer states a cost on the pending item "אישור יתרות בנק לאומי"
- **THEN** `stated_cost_item_allows` fails with a note that only a cost declaration may be stated, and the gate's `result` is false
