## ADDED Requirements

### Requirement: A debt balance may be read from an amortization schedule
For the client's two debt types — mortgage balance (`mortgage_balance`) and loan taken (`loan_taken`) — an amortization schedule (לוח סילוקין) or a payment schedule issued by the lender SHALL be an accepted document, beside the year-end balance letter, when the balance owed at 31.12 of the tax year can be deduced from it. A schedule deduces that balance when it lists the payments with their dates and the balance that remains after each payment, and it covers 31.12 of the tax year: the balance at 31.12 SHALL be the balance remaining after the last payment dated on or before 31.12 of the tax year (equivalently, the balance before the first payment dated after it). A schedule printed at the loan's start that projects the future payments SHALL count the same way. When the balance is deduced this way, the extraction SHALL report it in the type's balance field (`principal_balance` for a mortgage, `outstanding_balance` for a loan), SHALL report 31.12 of the tax year as the as-of date, SHALL report the document as the expected type, and SHALL say in the document's actual kind that it is a schedule. A schedule whose last payment on or before 31.12 of the tax year brings the balance to zero SHALL yield a balance of zero.

A schedule that does not cover 31.12 of the tax year — every payment dated after it, or the listing cut off before it with a balance still owed — SHALL NOT yield a balance: the extraction SHALL report no balance and no as-of date, so the existing `as_of_date` and `type_fields` checks reject the document with their existing notes. A monthly payment report or a bank statement that shows payments without the remaining balance SHALL NOT count as a schedule.

The description of both types, as the file classifier, the planner and the client-facing wording see it, SHALL name the schedule as an accepted form, and SHALL NOT say that a schedule is unacceptable. The `loan_given` type (money others owe the client) and every other type SHALL be unchanged by this requirement, and no new field or check SHALL be added for it.

#### Scenario: Mortgage schedule covering the valuation date
- **WHEN** a bank's mortgage amortization schedule for tax year 2025 lists monthly payments on the 10th of each month with the balance after each, the 10.12.2025 row leaving 412,300 ILS and the 10.01.2026 row leaving 410,900 ILS, and it is verified against a mortgage item
- **THEN** the answer has `is_expected_type: true`, `principal_balance: 412300`, `as_of_date: "2025-12-31"`, the actual kind names a schedule, and the document is approved when every other check passes

#### Scenario: Loan schedule covering the valuation date
- **WHEN** a credit company's repayment schedule lists the balance after each monthly payment of a loan, the last payment of 2025 leaving 18,640 ILS, and it is verified against a loan-taken item
- **THEN** the answer has `is_expected_type: true`, `outstanding_balance: 18640`, `lender_name` as printed, `as_of_date: "2025-12-31"`, and `type_fields` passes

#### Scenario: Schedule that does not reach the valuation date
- **WHEN** a schedule whose payments end on 10.06.2025 with 50,000 ILS still owed (the rest of the schedule is not in the file) is verified against a loan-taken item for tax year 2025
- **THEN** the answer has `outstanding_balance: null` and `as_of_date: null`, and the `as_of_date` and `type_fields` checks fail, so the document is not approved

#### Scenario: Schedule of a loan taken after the valuation date
- **WHEN** a schedule whose first payment is dated 15.02.2026 is verified against a loan-taken item for tax year 2025
- **THEN** the answer has `outstanding_balance: null` and `as_of_date: null`, and the document is not approved

#### Scenario: Loan repaid before the year end
- **WHEN** a schedule's last payment, dated 10.09.2025, leaves a balance of 0 and it is verified against a loan-taken item for tax year 2025
- **THEN** the answer has `outstanding_balance: 0` and `as_of_date: "2025-12-31"`, and `type_fields` passes

#### Scenario: The classifier recognises a schedule
- **WHEN** the client sends a mortgage amortization schedule and the list holds a pending mortgage item of the same bank
- **THEN** the file classifier reports the document type `mortgage_balance` and matches the item, and the planner sees the file as a candidate for that item

#### Scenario: Payment report without balances
- **WHEN** the client sends a monthly report that lists the payments charged for a loan but no remaining balance
- **THEN** the extraction reports `is_expected_type: false` and no balance, and the document is not approved
