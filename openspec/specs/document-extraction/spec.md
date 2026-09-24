# document-extraction Specification

## Purpose

What the extraction call reads from a received document: the common fields every document type shares, the extra fields a document type may declare for itself, and how those values are checked, stored and shown.

## Requirements

### Requirement: Every document is read into the same common fields
For every checklist document that is verified automatically, the extraction call SHALL return the same common fields regardless of the document's type: whether the file is the expected document, what the document actually is, the issuer, the subject's printed name, the subject's printed id number, the as-of date of the balances, the document's own valid-until date, the list of main amounts (label, value, currency), whether the file is legible, and whether the file carries text that tries to instruct an AI. A document type SHALL NOT remove or rename a common field.

#### Scenario: A type with no extra fields
- **WHEN** a prior-declaration document (a type that declares no extra fields) is verified
- **THEN** the extraction answer holds exactly the common fields, and the prompt the model receives is the same as before this change

### Requirement: A document type may declare extra fields
A document type in the catalog MAY declare a list of extra extraction fields. Each field SHALL have a stable key that differs from every common field key and from every other field key of the same type, a kind (text, number, date in the form YYYY-MM-DD, or a four-digit year), a short Hebrew label, a Hebrew instruction that tells the model what to read and where it sits on the document, and whether the field is required. A text field MAY carry a format pattern. A type MAY additionally state that at least one field of a named group must be read. Every extra field SHALL be nullable in the answer: the model returns null when the document does not carry the value.

#### Scenario: Field keys are unique
- **WHEN** the catalog is loaded
- **THEN** no extra field key equals a common field key, and no two fields of one type share a key; a catalog that breaks this rule fails the project's tests

### Requirement: Schema and prompt come from the same declaration
For a document of a type with extra fields, the answer schema sent to the model SHALL be one flat object holding the common fields plus one entry per declared field, typed by its kind and nullable. The system prompt SHALL list every declared field once, with its key and its Hebrew instruction, in the type context block. The two SHALL be derived from the same declaration so that a field cannot be present in one and absent from the other.

#### Scenario: Vehicle licence prompt and schema agree
- **WHEN** a file is verified against a vehicle checklist item
- **THEN** the answer schema contains `license_plate`, `manufacturer`, `model`, `production_year` and `purchase_cost` beside the common fields, and the system prompt carries one instruction line for each of these five keys

#### Scenario: Study fund prompt and schema agree
- **WHEN** a file is verified against a study-fund checklist item
- **THEN** the answer schema contains `fund_name`, `account_number`, `closing_balance` and `total_deposits`, and the prompt carries one instruction line for each of the four keys

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

### Requirement: Required fields are checked by code
For a type with extra fields, the code checks SHALL include a `type_fields` check. It SHALL fail when a required field is null, when a field of a named "at least one" group is null for every member, or when a read value is malformed: a date not in the form YYYY-MM-DD, a year outside 1950 to the tax year plus one, a number that is not finite, or a text that does not match its pattern. The check's observed value SHALL list every declared field by its Hebrew label with the value read (or "לא נמצא" when null). Its note SHALL name the missing or malformed field by label. For a type that states a period must cover the valuation date, the checks SHALL include `period_covers_valuation_date`, which runs when both period dates are well formed and fails unless 31.12 of the tax year lies inside the period, inclusive. A field that is not required and is null SHALL NOT fail any check.

#### Scenario: Licence without a readable plate
- **WHEN** a vehicle licence is verified and the model returns `license_plate: null` and `purchase_cost: null`
- **THEN** `type_fields` fails with a note naming the plate number, and the document is not approved

#### Scenario: Policy that ended before the valuation date
- **WHEN** a contents policy for 2025-01-01 to 2025-11-30 is verified for tax year 2025
- **THEN** `period_covers_valuation_date` fails with observed "2025-01-01 – 2025-11-30" and expected "2025-12-31", and the document is not approved

#### Scenario: Study fund certificate with deposits only
- **WHEN** a study fund tax certificate that states total deposits of 0 ILS and no closing balance is verified
- **THEN** `type_fields` passes (`total_deposits: 0` satisfies the group), and the observed value lists the fund name, the account number, "לא נמצא" for the closing balance and 0 for the deposits

### Requirement: Typed values are stored and shown by name
The whole extraction answer, including the extra fields, SHALL be stored with the document's verification record as today. The `verify_extraction` step detail SHALL carry the extra fields as a list of label and value, so the step modal shows each value under its Hebrew label without opening the raw JSON. Verification records written before this change SHALL NOT be rewritten.

#### Scenario: Step modal shows the typed values
- **WHEN** an admin opens the `verify_extraction` step of a verified bank balance
- **THEN** the modal lists the account number, the current-account balance and the deposits balance by their Hebrew labels, beside the checks list
