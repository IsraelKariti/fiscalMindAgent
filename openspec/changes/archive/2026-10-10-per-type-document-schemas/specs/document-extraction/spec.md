## MODIFIED Requirements

### Requirement: A document type may declare extra fields
Each document type SHALL be described by its own self-contained definition that holds the type's complete answer schema, the type's complete extraction prompt, the list of the type's extra fields, and the type's own verification. A type's extra fields SHALL each have a stable key that differs from every common field key and from every other field key of the same type, a kind (text, number, date in the form YYYY-MM-DD, or a four-digit year), a short Hebrew label, and whether the field is required. A text field MAY carry a format pattern. A type MAY additionally state that at least one field of a named group must be read. Every extra field SHALL be nullable in the answer: the model returns null when the document does not carry the value. A checklist row without a catalog type SHALL be verified with a generic definition that declares no extra fields and runs only the checks that apply to every document.

#### Scenario: Field keys are unique
- **WHEN** the project's tests run
- **THEN** no extra field key of any type equals a common field key, no two fields of one type share a key, every catalog type has exactly one definition and every definition names a catalog type; a set that breaks this rule fails the tests

#### Scenario: Ad-hoc row
- **WHEN** a file is verified against a checklist row the accountant added by hand (no catalog type)
- **THEN** the answer holds exactly the common fields and the checks are legibility, expected type and the owner identity checks

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

### Requirement: Required fields are checked by code
Each document type's definition SHALL carry its own verification: the ordered list of checks the code runs over the model's answer for that type. The checks available to a type SHALL be legibility, expected type, the owner identity checks, as-of date, not expired, amounts, `type_fields` and `period_covers_valuation_date`, with the same keys, observed values, expected values and notes as today, so the trace and the stored records keep their shape. For a type with extra fields, the verification SHALL include `type_fields`, which fails when a required field is null, when a field of a named "at least one" group is null for every member, or when a read value is malformed: a date not in the form YYYY-MM-DD, a year outside 1950 to the tax year plus one, a number that is not finite, or a text that does not match its pattern. The check's observed value SHALL list every extra field by its Hebrew label with the value read (or "לא נמצא" when null). Its note SHALL name the missing or malformed field by label. For a type whose period must cover the valuation date, the verification SHALL include `period_covers_valuation_date`, which runs when both period dates are well formed and fails unless 31.12 of the tax year lies inside the period, inclusive. A field that is not required and is null SHALL NOT fail any check. A document's verdict SHALL be the same as before this change for the same answer.

#### Scenario: Licence without a readable plate
- **WHEN** a vehicle licence is verified and the model returns `license_plate: null` and `purchase_cost: null`
- **THEN** `type_fields` fails with a note naming the plate number, and the document is not approved

#### Scenario: Policy that ended before the valuation date
- **WHEN** a contents policy for 2025-01-01 to 2025-11-30 is verified for tax year 2025
- **THEN** `period_covers_valuation_date` fails with observed "2025-01-01 – 2025-11-30" and expected "2025-12-31", and the document is not approved

#### Scenario: Study fund certificate with deposits only
- **WHEN** a study fund tax certificate that states total deposits of 0 ILS and no closing balance is verified
- **THEN** `type_fields` passes (`total_deposits: 0` satisfies the group), and the observed value lists the fund name, the account number, "לא נמצא" for the closing balance and 0 for the deposits

#### Scenario: Bank balance runs its own list of checks
- **WHEN** a bank balance certificate is verified
- **THEN** the `verify_extraction` row lists, in this order, `legible`, `expected_type`, the owner identity checks, `as_of_date`, `amounts` and `type_fields`, and no `not_expired` or `period_covers_valuation_date` entry

#### Scenario: Stored evals keep their verdicts
- **WHEN** the extraction eval cases are re-judged from their stored model answers after this change
- **THEN** every case reaches the same verdict and the same failed check keys as the last run before this change

## ADDED Requirements

### Requirement: The stages page lists every type's extraction prompt and schema
The admin LLM-stages page SHALL show the extraction stage with one prompt variant per document type, named by the type key, each with its own answer schema, plus the generic variant for ad-hoc rows. The schema shown under a variant SHALL be the one the model receives for a file of that type.

#### Scenario: Bank balance variant
- **WHEN** an admin opens the extraction stage on the LLM-stages page and expands the `bank_balance` variant
- **THEN** the page shows that type's full prompt text and a schema that lists `account_number`, `current_account_balance` and `deposits_balance` beside the common fields

#### Scenario: Type without extra fields
- **WHEN** the admin expands the `prior_declaration` variant
- **THEN** the schema shows only the common fields
