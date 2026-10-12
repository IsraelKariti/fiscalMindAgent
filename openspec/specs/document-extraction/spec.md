# document-extraction Specification

## Purpose

What the extraction call reads from a received document: the common fields every document type shares, the extra fields a document type may declare for itself, and how those values are checked, stored and shown.

## Requirements

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

### Requirement: Schema and prompt come from the same declaration
For every document type, the answer schema sent to the model SHALL be one flat object holding the common fields plus one entry per extra field, typed by its kind and nullable, and the system prompt SHALL list every extra field once with its key and a Hebrew instruction that tells the model what to read and where it sits on the document. Both SHALL be written out in the type's own definition. A test SHALL fail when a type's prompt does not name every extra key of its schema, when its schema holds a key its prompt does not name, or when its schema lacks a common field. The item-level values (the checklist row's name and description, the expected paper, the tax year, the file name) SHALL stay placeholders filled at call time, because they vary per checklist row, not per type.

#### Scenario: Vehicle licence prompt and schema agree
- **WHEN** a file is verified against a vehicle checklist item
- **THEN** the answer schema contains `license_plate`, `manufacturer`, `model`, `production_year` and `purchase_cost` beside the common fields, and the system prompt carries one instruction line for each of these five keys

#### Scenario: Study fund prompt and schema agree
- **WHEN** a file is verified against a study-fund checklist item
- **THEN** the answer schema contains `fund_name`, `account_number`, `closing_balance` and `total_deposits`, and the prompt carries one instruction line for each of the four keys

#### Scenario: A prompt that forgets a key
- **WHEN** a type's schema gains a key and its prompt is not updated
- **THEN** the project's tests fail and name the type and the key

#### Scenario: Same request as before this change
- **WHEN** a bank balance certificate is verified for tax year 2025 against the item "אישור יתרות בנק ליום 31.12.2025"
- **THEN** the system prompt carries the same instructions as before this change (the expected document, the accepted forms, the three bank fields, the valuation-date line), and the answer schema holds the same keys with the same types

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

### Requirement: Typed values are stored and shown by name
The whole extraction answer, including the extra fields, SHALL be stored with the document's verification record as today. The `verify_extraction` step detail SHALL carry the extra fields as a list of label and value, so the step modal shows each value under its Hebrew label without opening the raw JSON. Verification records written before this change SHALL NOT be rewritten.

#### Scenario: Step modal shows the typed values
- **WHEN** an admin opens the `verify_extraction` step of a verified bank balance
- **THEN** the modal lists the account number, the current-account balance and the deposits balance by their Hebrew labels, beside the checks list

### Requirement: The extraction prompt names the expected paper
When a file is verified against a checklist item that carries a paper (the `document-papers` capability), the extraction prompt SHALL name the expected paper by its Hebrew name beside the item's name and description, and SHALL carry the paper's anatomy hint when the paper declares one, so that the model's "is this the expected document" answer judges the paper and not only the type. The `expected_type` check of `verify_extraction` SHALL keep its observed and expected values as today. An item without a paper SHALL be verified with the prompt as before this change.

#### Scenario: Registry extract verified against the contract item
- **WHEN** a land registry extract is verified against the item "חוזה רכישה — דינוביץ 47" (paper `purchase_contract`)
- **THEN** the prompt names the expected paper "חוזה רכישה", the model answers that the file is not the expected document, and `expected_type` fails with observed "נסח טאבו"

#### Scenario: Contract verified against the contract item
- **WHEN** a purchase contract is verified against that item
- **THEN** `expected_type` passes

#### Scenario: Item without a paper
- **WHEN** a bank balance letter is verified against a bank balance item
- **THEN** the prompt the model receives is the same as before this change

### Requirement: The extraction lists every party of the document with its role
The extraction answer SHALL carry `parties`: a list of up to ten people the document names, one entry per person. Each entry SHALL carry the person's name exactly as printed beside that person, the person's national id as printed beside that person (digits only) or none when no id is printed for that person, and one role from a closed list: `owner` — the person who holds the asset or owes the liability the document proves (the buyer in a purchase contract, the account holder, the fund member, the insured, the borrower, the heir, the registered owner); `counterparty` — the other side of the document (the seller, the lending bank, the builder, the giver of a gift); `other` — anyone else named (witness, lawyer, guarantor, agent). The prompt SHALL instruct the model to keep each id next to the one name it is printed beside, never to join several names into one entry, never to put a counterparty's id on an owner, and to leave the id empty when the pairing is not readable. A business named as a party SHALL be listed with its name, no id and the role the document gives it. The list SHALL be empty when the document names nobody.

#### Scenario: Four-party purchase contract
- **WHEN** a purchase contract naming the sellers "מקמל קתי פנינה" and "מקמל חזי" with their ids and the buyers "תמיר מיכל" and "תמיר ניב" with their ids is verified
- **THEN** `parties` holds four entries, the two buyers with role `owner` and the two sellers with role `counterparty`, each with the id printed beside their own name

#### Scenario: Joint bank account
- **WHEN** a bank balance certificate for an account held by "תמיר ניב" and "תמיר מיכל", printing both ids, is verified
- **THEN** `parties` holds two entries, both with role `owner`, each with their own id

#### Scenario: One member, one id
- **WHEN** a pension report printing one member "תמיר מיכל" and her id is verified
- **THEN** `parties` holds one entry with role `owner`, her name and her id

#### Scenario: Names printed, ids not paired
- **WHEN** a contract prints the buyers' names on page one and a list of ids on the signature page that cannot be matched to a name
- **THEN** each owner entry carries the name and no id

### Requirement: The stages page lists every type's extraction prompt and schema
The admin LLM-stages page SHALL show the extraction stage with one prompt variant per document type, named by the type key, each with its own answer schema, plus the generic variant for ad-hoc rows. The schema shown under a variant SHALL be the one the model receives for a file of that type.

#### Scenario: Bank balance variant
- **WHEN** an admin opens the extraction stage on the LLM-stages page and expands the `bank_balance` variant
- **THEN** the page shows that type's full prompt text and a schema that lists `account_number`, `current_account_balance` and `deposits_balance` beside the common fields

#### Scenario: Type without extra fields
- **WHEN** the admin expands the `prior_declaration` variant
- **THEN** the schema shows only the common fields

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
