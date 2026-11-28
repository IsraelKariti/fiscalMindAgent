## MODIFIED Requirements

### Requirement: First set of typed fields
The catalog SHALL declare these extra fields (key, kind, required):

- Bank balance: `account_number` (text, required), `current_account_balance` (number, required; zero or negative is a valid value), `deposits_balance` (number, optional).
- Securities portfolio: `account_number` (text, required), `portfolio_value` (number, required; the value at 31.12 of the tax year, not a comparison column), `base_currency` (text, required).
- Pension/provident, study fund and life-insurance savings carry one more field than the list below: `tax_certificate_title` (text, required; the heading of the tax certificate for the capital declaration as printed in the document — see the requirement "A savings document must carry the tax certificate").
- Pension/provident, study fund and life-insurance savings (the same list for the three): `fund_name` (text, required), `account_number` (text, optional; the member, account or policy number when the document prints one — an employer's withholding-file number ("מספר תיק ניכויים") is not an account number), `closing_balance` (number, optional), `total_deposits` (number, optional; zero is a valid value); at least one of `closing_balance` and `total_deposits` must be read.
- Mortgage balance: `loan_number` (text, optional), `principal_balance` (number, required; the 31.12 row of the tax year).
- Vehicle: `license_plate` (text, optional, digits only, 7 or 8 digits), `manufacturer` (text, optional), `model` (text, optional), `production_year` (year, optional), `purchase_cost` (number, optional); at least one of `license_plate` and `purchase_cost` must be read, because a vehicle item may be the licence or the purchase document.
- Contents insurance: `policy_number` (text, optional), `contents_sum` (number, required; the contents chapter's sum, not the building sum, a liability limit or the premium), `period_from` (date, required), `period_to` (date, required); the type also states that the period must cover the valuation date.
- Real estate: `property_address` (text, optional; the address as printed, or the block and parcel when no address is printed), `purchase_price` (number, optional; the total consideration the buyer pays, not a single instalment, not the tax), `price_currency` (text, optional, a three-letter currency code), `purchase_year` (year, optional; the year the contract was signed), `seller_kind` (text, optional, exactly `private` or `builder`; `private` when the seller is a person, `builder` when the seller is a construction company, a developer or any company). All five are optional because the type's papers differ: a tabu extract prints no price and no seller, an inheritance order prints no price. A purchase tax assessment reads its taxable purchase value into `purchase_price`; a signed cost declaration reads the client's written estimate into it.

The other catalog types (loan taken, loan given, business ownership, crypto, private investment, power-of-attorney account, prior declaration, other assets) SHALL declare no extra fields in this change.

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

#### Scenario: Purchase contract is read into named fields
- **WHEN** the 2001 purchase contract for Dinovitz 47, between two private sellers and the client and the spouse, stating a consideration of 320,000 USD, is verified against the item "חוזה רכישה — דינוביץ 47"
- **THEN** the answer has `purchase_price: 320000`, `price_currency: "USD"`, `purchase_year: 2001`, `seller_kind: "private"`, `property_address` as printed, `type_fields` passes, and the document is approved when every other check passes

#### Scenario: Tabu extract has no price
- **WHEN** a tabu extract for the same parcel is verified against the item "נסח טאבו — דינוביץ 47"
- **THEN** the answer has `purchase_price: null`, `price_currency: null`, `seller_kind: null`, `property_address` as the block and parcel or the printed address, and `type_fields` passes

#### Scenario: Seller kind outside the closed list
- **WHEN** the model returns `seller_kind: "company"` for a contract
- **THEN** `type_fields` fails with a note naming the seller field, and the document is not approved

#### Scenario: Overdrawn bank account is approved
- **WHEN** a Mizrahi balance certificate for the client's account is verified and the model returns `current_account_balance: -13685.83`, the account number and the 31.12 as-of date
- **THEN** `type_fields` passes with the observed value listing the overdraft with its minus sign, no check of the row fails on the sign, and the document is approved when every other check passes

#### Scenario: Loan certificate is read into named fields
- **WHEN** a credit-company certificate stating a balance owed of 24,310 ILS at 31.12 of the tax year is verified against a loan-taken item
- **THEN** the answer has `outstanding_balance: 24310`, `lender_name` as printed, and `type_fields` passes

#### Scenario: Crypto statement is read into named fields
- **WHEN** an exchange statement valuing the holdings at 3,120.55 USD at 31.12 of the tax year is verified against a crypto item
- **THEN** the answer has `market_value: 3120.55` and `value_currency: "USD"`, and `type_fields` passes

## ADDED Requirements

### Requirement: A savings document must carry the tax certificate
A file verified against a pension/provident item (`pension_provident`), a study fund item (`study_fund`) or a life-insurance savings item (`life_insurance_savings`) SHALL be approved only when the document itself prints the tax certificate for the capital declaration: a heading or section title that holds both the words "אישור מס" and the words "הצהרת הון" (the usual wording is "אישור מס להצהרת הון"; a fund that prints "אישור מס והצהרת הון" counts the same). The extraction SHALL quote that heading, exactly as printed, in `tax_certificate_title`, and SHALL return null when the document prints no such heading. The model SHALL NOT fill the field from the file name, from the checklist item's name or from its own description of the document. The code SHALL decide: `type_fields` fails when the field is null or when the quoted text does not hold both word groups, with the note "המסמך אינו כולל את "אישור מס להצהרת הון"". The year-end balance page of an annual report SHALL NOT be an accepted form by itself: an annual report (short or full) is approved only when the certificate is inside the same file, in which case the balance and the deposits are read as before. The "at least one of `closing_balance` and `total_deposits`" rule SHALL stay.

The description of the three types, as the file classifier, the planner and the client-facing wording see it, SHALL ask for the tax certificate for the capital declaration ("אישור מס להצהרת הון") and SHALL NOT present the last page of the short annual report as an equal alternative. When a client sends a report without the certificate, the agent SHALL tell the client that the file lacks the "אישור מס להצהרת הון" and SHALL ask for it; the agent SHALL NOT offer the short annual report as a replacement for any of these three types. Documents approved before this change SHALL NOT be re-judged.

#### Scenario: Annual report without the certificate
- **WHEN** a pension fund's short annual report for 2025 that prints the member, the fund and the balance at 31.12.2025, and no "אישור מס להצהרת הון" heading anywhere, is verified against a pension item
- **THEN** the answer has `tax_certificate_title: null`, `type_fields` fails with the note that the document lacks the "אישור מס להצהרת הון", the document is not approved and the item stays open

#### Scenario: Annual report with the certificate as its last page
- **WHEN** a study fund's short annual report whose last page is headed "אישור מס להצהרת הון" is verified against a study fund item
- **THEN** the answer has `tax_certificate_title: "אישור מס להצהרת הון"`, `type_fields` passes, and the document is approved when every other check passes

#### Scenario: Certificate alone
- **WHEN** a one-page certificate headed "אישור מס להצהרת הון" that states cumulative deposits of 41,250 ILS up to 31.12.2025 is verified against a study fund item
- **THEN** `type_fields` passes with `total_deposits: 41250` and the quoted heading in its observed value

#### Scenario: Heading with a different joining letter
- **WHEN** a fund's document is headed "אישור מס והצהרת הון"
- **THEN** the quoted heading holds both word groups and `type_fields` does not fail on the certificate field

#### Scenario: A tax certificate that is not for the capital declaration
- **WHEN** a document is headed only "אישור מס שנתי" (a yearly tax certificate for deposits) and prints no "הצהרת הון" heading
- **THEN** `type_fields` fails with the same note, and the document is not approved

#### Scenario: The agent's reply after a rejected report
- **WHEN** the client's pension report was rejected because it lacks the certificate
- **THEN** the agent's next message says the report does not include the "אישור מס להצהרת הון" and asks the client to produce that certificate from the fund's site, and does not say the last page of the annual report is enough

#### Scenario: Life-insurance savings policy
- **WHEN** an insurance company's short annual report with a year-end balance and no certificate heading is verified against a life-insurance savings item
- **THEN** the answer has `tax_certificate_title: null`, `type_fields` fails with the note that the document lacks the "אישור מס להצהרת הון", and the document is not approved

#### Scenario: Item approved before this change
- **WHEN** a pension item was approved from a balance-only annual report before this change
- **THEN** it stays approved until someone reopens it by hand; nothing is rewritten
