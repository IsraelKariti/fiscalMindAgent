## MODIFIED Requirements

### Requirement: Every document is read into the same common fields
For every checklist document that is verified automatically, the extraction call SHALL return the same common fields regardless of the document's type: whether the file is the expected document, what the document actually is, the issuer, the list of parties the document names (see the parties requirement below), the as-of date of the balances, the document's own valid-until date, whether the file is legible, and whether the file carries text that tries to instruct an AI. The answer SHALL NOT carry a generic list of amounts: every monetary value a document type needs is one of that type's own named fields, with its own meaning and its own rule. The answer SHALL NOT carry a single subject name or a single subject id: a document's people are only ever reported as parties. A document type SHALL NOT remove or rename a common field.

#### Scenario: A type with no extra fields
- **WHEN** a prior-declaration document (a type that declares no extra fields) is verified
- **THEN** the extraction answer holds exactly the common fields, with the people of the document under `parties`, and no amounts list

#### Scenario: Old verification records keep their shape
- **WHEN** an admin opens the `verify_extraction` step of a document verified before this change, whose stored answer carries `amounts` (or, older still, `subject_name` and `subject_id_number`)
- **THEN** the step opens and shows the stored checks as recorded, including its `amounts` entry; nothing is rewritten

### Requirement: A document type may declare extra fields
Each document type SHALL be described by its own self-contained definition that holds the type's complete answer schema, the type's complete extraction prompt, the list of the type's extra fields, and the type's own verification. A type's extra fields SHALL each have a stable key that differs from every common field key and from every other field key of the same type, a kind (text, number, date in the form YYYY-MM-DD, or a four-digit year), a short Hebrew label, and whether the field is required. A text field MAY carry a format pattern. A number field MAY carry an inclusive lower bound, stated in the type's definition because its meaning is the type's own: a balance that may be overdrawn has none, a holding or a cost has zero, an insured sum has a positive bound. A type MAY additionally state that at least one field of a named group must be read. Every extra field SHALL be nullable in the answer: the model returns null when the document does not carry the value. A checklist row without a catalog type SHALL be verified with a generic definition that declares no extra fields and runs only the checks that apply to every document.

#### Scenario: Field keys are unique
- **WHEN** the project's tests run
- **THEN** no extra field key of any type equals a common field key, no two fields of one type share a key, every catalog type has exactly one definition and every definition names a catalog type; a set that breaks this rule fails the tests

#### Scenario: Ad-hoc row
- **WHEN** a file is verified against a checklist row the accountant added by hand (no catalog type)
- **THEN** the answer holds exactly the common fields and the checks are legibility, expected type and the owner identity checks

#### Scenario: Bound on a non-number field
- **WHEN** a type's definition gives a lower bound to a text, date or year field
- **THEN** the project's tests fail and name the type and the field

### Requirement: First set of typed fields
The document types SHALL declare these extra fields (key, kind, required, and for a number field its lower bound):

- Bank balance: `account_number` (text, required), `current_account_balance` (number, required; no lower bound — zero or an overdraft is a valid value), `deposits_balance` (number, optional, zero or above).
- Securities portfolio: `account_number` (text, required), `portfolio_value` (number, required, zero or above; the value at 31.12 of the tax year, not a comparison column), `base_currency` (text, required).
- Pension/provident, study fund and life-insurance savings (the same list for the three): `fund_name` (text, required), `account_number` (text, optional; the member, account or policy number when the document prints one — an employer's withholding-file number ("מספר תיק ניכויים") is not an account number), `closing_balance` (number, optional, zero or above), `total_deposits` (number, optional, zero or above; zero is a valid value); at least one of `closing_balance` and `total_deposits` must be read.
- Mortgage balance: `loan_number` (text, optional), `principal_balance` (number, required, zero or above; the 31.12 row of the tax year).
- Loan taken: `lender_name` (text, optional; the bank, credit company or private lender as printed), `outstanding_balance` (number, required, zero or above; the balance owed at 31.12 of the tax year, principal and accrued interest as the certificate states it, not the original loan sum and not a monthly payment).
- Loan given: `borrower_name` (text, optional; the person or company that owes the client, as printed), `debt_balance` (number, required, zero or above; the balance owed to the client at 31.12 of the tax year, not the original loan sum).
- Crypto: `market_value` (number, required, zero or above; the market value of the holdings at 31.12 of the tax year), `value_currency` (text, required, a three-letter currency code; the currency `market_value` is stated in).
- Vehicle: `license_plate` (text, optional, digits only, 7 or 8 digits), `manufacturer` (text, optional), `model` (text, optional), `production_year` (year, optional), `purchase_cost` (number, optional, zero or above); at least one of `license_plate` and `purchase_cost` must be read, because a vehicle item may be the licence or the purchase document.
- Contents insurance: `policy_number` (text, optional), `contents_sum` (number, required, above zero; the contents chapter's sum, not the building sum, a liability limit or the premium), `period_from` (date, required), `period_to` (date, required); the type also states that the period must cover the valuation date.
- Real estate: `property_address` (text, optional), `purchase_price` (number, optional, zero or above), `price_currency` (text, optional, a three-letter currency code), `purchase_year` (year, optional), `seller_kind` (text, optional, `private` or `builder`) — see the `real-estate-goal-driven-clarification` change for their meaning.

The other catalog types (business ownership, private investment, power-of-attorney account, prior declaration, other assets) SHALL declare no extra fields in this change.

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

#### Scenario: Overdrawn bank account is approved
- **WHEN** a Mizrahi balance certificate for the client's account is verified and the model returns `current_account_balance: -13685.83`, the account number and the 31.12 as-of date
- **THEN** `type_fields` passes with the observed value listing the overdraft with its minus sign, no check of the row fails on the sign, and the document is approved when every other check passes

#### Scenario: Loan certificate is read into named fields
- **WHEN** a credit-company certificate stating a balance owed of 24,310 ILS at 31.12 of the tax year is verified against a loan-taken item
- **THEN** the answer has `outstanding_balance: 24310`, `lender_name` as printed, and `type_fields` passes

#### Scenario: Crypto statement is read into named fields
- **WHEN** an exchange statement valuing the holdings at 3,120.55 USD at 31.12 of the tax year is verified against a crypto item
- **THEN** the answer has `market_value: 3120.55` and `value_currency: "USD"`, and `type_fields` passes

### Requirement: Required fields are checked by code
Each document type's definition SHALL carry its own verification: the ordered list of checks the code runs over the model's answer for that type. The checks available to a type SHALL be legibility, expected type, the owner identity checks, as-of date, not expired, `type_fields` and `period_covers_valuation_date`, with the same keys, observed values, expected values and notes as today, so the trace and the stored records keep their shape; there SHALL be no shared check over a generic list of amounts. For a type with extra fields, the verification SHALL include `type_fields`, which fails when a required field is null, when a field of a named "at least one" group is null for every member, or when a read value is malformed: a date not in the form YYYY-MM-DD, a year outside 1950 to the tax year plus one, a number that is not finite, a number below the lower bound its field declares, or a text that does not match its pattern. The check's observed value SHALL list every extra field by its Hebrew label with the value read (or "לא נמצא" when null). Its note SHALL name the missing or malformed field by label, and for a number below its bound SHALL say so with the value read (for example "השדה "יתרת פיקדונות וחסכונות" שלילי (-5)"). For a type whose period must cover the valuation date, the verification SHALL include `period_covers_valuation_date`, which runs when both period dates are well formed and fails unless 31.12 of the tax year lies inside the period, inclusive. A field that is not required and is null SHALL NOT fail any check.

#### Scenario: Licence without a readable plate
- **WHEN** a vehicle licence is verified and the model returns `license_plate: null` and `purchase_cost: null`
- **THEN** `type_fields` fails with a note naming the plate number, and the document is not approved

#### Scenario: Policy that ended before the valuation date
- **WHEN** a contents policy for 2025-01-01 to 2025-11-30 is verified for tax year 2025
- **THEN** `period_covers_valuation_date` fails with observed "2025-01-01 – 2025-11-30" and expected "2025-12-31", and the document is not approved

#### Scenario: Study fund certificate with deposits only
- **WHEN** a study fund tax certificate that states total deposits of 0 ILS and no closing balance is verified
- **THEN** `type_fields` passes (`total_deposits: 0` satisfies the group), and the observed value lists the fund name, the account number, "לא נמצא" for the closing balance and 0 for the deposits

#### Scenario: Negative deposits balance fails the bank certificate
- **WHEN** a bank balance certificate is verified and the model returns `current_account_balance: 12340` and `deposits_balance: -5`
- **THEN** `type_fields` fails with a note naming "יתרת פיקדונות וחסכונות" as negative with the value -5, and the document is not approved

#### Scenario: Zero contents sum fails the policy
- **WHEN** a contents policy is verified and the model returns `contents_sum: 0` with both period dates read
- **THEN** `type_fields` fails with a note naming "סכום ביטוח התכולה" as not above zero, and the document is not approved

#### Scenario: Bank balance runs its own list of checks
- **WHEN** a bank balance certificate is verified
- **THEN** the `verify_extraction` row lists, in this order, `legible`, `expected_type`, the owner identity checks, `as_of_date` and `type_fields`, and no `amounts`, `not_expired` or `period_covers_valuation_date` entry

#### Scenario: Loan taken runs its own list of checks
- **WHEN** a loan certificate is verified against a loan-taken item
- **THEN** the row lists `legible`, `expected_type`, the owner identity checks, `as_of_date` and `type_fields`, and `type_fields` fails when `outstanding_balance` is null

#### Scenario: Stored evals keep their verdicts
- **WHEN** the extraction eval cases are re-judged from their stored model answers after this change
- **THEN** every case reaches the same verdict as the last run before this change, except that no case fails or expects an `amounts` key and the cases that expected a generic amount now expect the type's named money field with the same value
