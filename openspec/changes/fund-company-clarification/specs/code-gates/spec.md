## ADDED Requirements

### Requirement: Checks reported for a set company
In addition to the checks listed for each existing gate, `validate_message` SHALL report these checks when the planner's answer sets a company on a row (the `item-company-clarification` capability), once per `set_company` call, in this order:

- `set_company_row_allows`: passes when the target row exists for this client, is pending, is of an institution-bound type and its name identifies no company of the institutions table; fails otherwise (`observed` = the row's name and status, or "unknown row"; `expected` = "a pending institution-bound row that names no company").
- `business_rules`: fails, with the rejection message as `note`, when the evidence message is not a stored inbound message of this client or the quote is not verbatim in it (the existing evidence rule).
- `set_company_in_quote`: passes when the company text appears in the quote (after the institutions table's text normalisation); fails otherwise (`observed` = the quote, `expected` = the company text).
- `set_company_recognised`: always `passed: true`; `observed` = the table key the company text identified, or "not in table" when none.

A failed check SHALL make the gate's `result` false and SHALL reject the whole answer, as a failed `business_rules` does today.

#### Scenario: Company accepted
- **WHEN** the answer sets "מגדל" on the pending row "אישור יתרת קרן פנסיה ליום 31.12.2025 — קרן פנסיה" with the quote "הפנסיה שלי במגדל"
- **THEN** the `validate_message` row has `set_company_row_allows`, `business_rules` and `set_company_in_quote` passed and `set_company_recognised` observed `migdal`

#### Scenario: Row already names a company
- **WHEN** the answer sets "מגדל" on the row "… — הראל"
- **THEN** `set_company_row_allows` fails with the row's name as `observed`, the gate's `result` is false, and no row changes

#### Scenario: Company missing from the quote
- **WHEN** the answer sets "מגדל" with the quote "כן, אשלח"
- **THEN** `set_company_in_quote` fails with the quote as `observed` and "מגדל" as `expected`, and the gate's `result` is false
