## MODIFIED Requirements

### Requirement: First set of typed fields
The catalog SHALL declare these extra fields (key, kind, required):

- Bank balance: `account_number` (text, required), `current_account_balance` (number, required; zero or negative is a valid value), `deposits_balance` (number, optional).
- Securities portfolio: `account_number` (text, required), `portfolio_value` (number, required; the value at 31.12 of the tax year, not a comparison column), `base_currency` (text, required).
- Pension/provident, study fund and life-insurance savings (the same list for the three): `fund_name` (text, required), `account_number` (text, optional; the member, account or policy number when the document prints one — an employer's withholding-file number ("מספר תיק ניכויים") is not an account number), `closing_balance` (number, optional), `total_deposits` (number, optional; zero is a valid value); at least one of `closing_balance` and `total_deposits` must be read.
- Mortgage balance: `loan_number` (text, optional), `principal_balance` (number, required; the 31.12 row of the tax year).
- Vehicle: `license_plate` (text, optional, digits only, 7 or 8 digits), `manufacturer` (text, optional), `model` (text, optional), `production_year` (year, optional), `purchase_cost` (number, optional); at least one of `license_plate` and `purchase_cost` must be read, because a vehicle item may be the licence or the purchase document.
- Contents insurance: `policy_number` (text, optional), `contents_sum` (number, required; the contents chapter's sum, not the building sum, a liability limit or the premium), `period_from` (date, required), `period_to` (date, required); the type also states that the period must cover the valuation date.

The other catalog types (real estate, loan taken, loan given, business ownership, crypto, private investment, power-of-attorney account, prior declaration, other assets) SHALL declare no extra fields in this change.

#### Scenario: Contents policy is read into named fields
- **WHEN** a combined home policy whose contents chapter states 180,000 ILS and whose period is 2025-03-01 to 2026-02-28 is verified against the contents-insurance item
- **THEN** the answer has `contents_sum: 180000`, `period_from: "2025-03-01"`, `period_to: "2026-02-28"`, and the building sum is not in `contents_sum`

#### Scenario: Vehicle licence is read into named fields
- **WHEN** a valid vehicle licence for plate 12-345-67, maker Toyota, model Corolla, first on the road in 2019, is verified against a vehicle item
- **THEN** the answer has `license_plate: "1234567"`, `manufacturer` and `model` as printed, `production_year: 2019`, `purchase_cost: null`, and `valid_until` as the licence's "valid until" date

#### Scenario: Pension report that prints no member number
- **WHEN** a pension fund annual report with its capital-declaration certificate, which prints the member's name and id, the fund name, the year-end balance, the cumulative deposits and the employer's withholding-file number but no member or account number, is verified against a pension item
- **THEN** the answer has `account_number: null`, `type_fields` passes, its observed value lists "מספר חשבון: לא נמצא" beside the fund name and the two amounts, and the document is approved when every other check passes

#### Scenario: Bank certificate without an account number still fails
- **WHEN** a bank balance certificate is verified and the model returns `account_number: null`
- **THEN** `type_fields` fails with a note naming "מספר חשבון", and the document is not approved
