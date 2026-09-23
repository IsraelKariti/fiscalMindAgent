## MODIFIED Requirements

### Requirement: Checks reported by each existing gate
The gates SHALL report the following checks (keys are stable identifiers; the human labels live in the UI):

- `injection_detection_regex`: one entry per named injection pattern (`system_impersonation`, `ignore_instructions`, `ignore_instructions_he`, `system_prompt`, `system_prompt_he`, `role_tags`, `ai_address`, `ai_address_he`, `state_command`, `state_command_he`, `fence_forgery`); `passed` is `true` when the pattern did not match; a failed entry's `observed` and `note` quote the matched text (capped); a passed entry's `observed` is `null` (nothing matched).
- `validate_injection_scan`: `clean_without_evidence` when the model said "clean" (fails if it still quoted evidence); `hit_has_evidence` when the model said "suspected" (fails if it quoted nothing); `evidence_verbatim` when the model said "suspected", quoted something, and the reviewed text was readable (fails if the quote is not found verbatim in the text). When the text was not readable, `evidence_verbatim` is absent. `observed` is the model's quoted evidence (capped) or `null` when it quoted nothing.
- `validate_form_resolutions`: one entry per proposed verdict, keyed by the catalog type key; `passed` is `true` when the resolution was accepted or left for the interview as unclear, `false` when it was dropped, with the drop reason as `note`; `observed` is the proposed verdict plus, for a `not_required`, the question and quote the model cited (capped).
- `validate_classification`: `matched_id_known` when the model matched a document id (fails if that id was not in the list it was shown; `observed` = the matched id); `matched_type_agrees` when a known id was matched and the answer carries a document type (fails if the row's type disagrees; `observed` = the answer's document type, `expected` = the matched row's type); `issuer_matches_item` when the match survived the two checks before it and the matched row's document type is institution-bound, as the `unlisted-files` capability defines (fails when the company printed on the file and the company the row names differ, or when either cannot be identified; `observed` = the file's company, or the printed issuer text when it was not identified; `expected` = the row's company, or "not identified"; the note says which of the three it was); `not_injection_suspected` (fails when the model flagged a suspected injection; `observed` = the flag); `legible` (fails when the model judged the file illegible; `observed` = the model's verdict). The last two are reported even though they do not change `result` (quarantine is reported alongside, never flipped).
- `validate_message`: `json_schema` (the answer parses and matches the response schema) and `business_rules` (the parsed answer passes normalization: evidence quotes, instance caps, channel rules, attestation gate). On failure the `note` is the rejection message, capped; `business_rules` is absent when `json_schema` failed. `observed` for `json_schema` is the answer's length in characters; for `business_rules` it is the decision kind and channel the answer proposed.
- `verify_extraction`: the per-document checks, each with the value read from the document as `observed`, the reference as `expected`, and, on failure, a `note` that names the exact problem:
  - `legible`: observed = the model's legibility verdict.
  - `expected_type`: observed = what the model saw the document as (`actual_kind`); expected = the required document's name.
  - `subject`: observed = the printed subject name (or, when an id match vouched for it, the masked id); expected = the person the document was accepted for — the client's name, or the spouse's name (or "בן/בת זוג" when the spouse's name is unknown) when the id or the name matched the spouse on file; on failure, the client's name and the spouse's name when one is on file. Fails when the printed name loosely matches neither person, and also when the printed id belongs to a third person (a name cannot vouch against a contradicting id).
  - `id_checksum`: observed = the masked id printed on the document.
  - `id_matches_client`: when the document prints an id and an id is on file for the client or the spouse; observed = the masked id printed on the document; expected = on a pass, the person matched — "client" or "spouse" — with that person's masked id and its source in parentheses (the tax-portal credentials, the monday CRM card, the questionnaire, or a document); on a failure, the client's masked id with its source and, when one is on file, the spouse's masked id with its source. Passes when the printed id equals the client's id or the spouse's id, and also when the `spouse-identity` capability adopts the printed id as the spouse's. Fails, with the note naming the reason, when the printed id equals neither and inference is not allowed: a spouse is already on file (third person), the client is registered as not married, or the printed name does not match the spouse name on file.
  - `spouse_adopted`: when the `spouse-identity` capability adopted the printed id as the spouse's in this verification; always `passed: true`; observed = the masked printed id; expected = the printed subject name (or "name unknown"). Absent otherwise.
  - `client_id_on_file`: when the document prints an id, no id is on file for the client (after the CRM-card fetch of the `declaration-kickoff` capability), and the printed id is not the spouse's id on file; `passed: false`, observed = "none", note = the client has no id on the tax-portal credentials or the monday CRM card, so the printed id could not be compared. This check is reported alongside and does not change `result`.
  - `as_of_date`: observed = the as-of date read (or "not stated"); expected = 31.12 of the declaration year.
  - `not_expired`: observed = the valid-until date read; expected = the verification date.
  - `amounts`: observed = the amounts found, each as label, value and currency (capped to a short list); the failure note says which condition failed: no amounts found, a negative value, a value above the sane cap, or a value that is not a number, naming the offending amount.
  - `type_fields`: when the document's type declares extra extraction fields (the `document-extraction` capability); observed = every declared field as its Hebrew label and the value read, "לא נמצא" for a null (capped to a short list); the failure note names, by label, the required field that is missing, the "at least one" group that is empty, or the field whose value is malformed and why (wrong date form, implausible year, not a number, pattern mismatch).
  - `period_covers_valuation_date`: when the document's type states that a period must cover the valuation date and both period dates were read well formed; observed = the period as "from – to"; expected = 31.12 of the declaration year; fails when that date is outside the period.

#### Scenario: Amounts check fails on a specific amount
- **WHEN** the extractor returns amounts "יתרת עו"ש 12,340 ILS" and "פיקדון -5 ILS"
- **THEN** the `verify_extraction` row's `amounts` entry has `passed: false`, `observed` listing both amounts, and a `note` saying the deposit amount is negative

#### Scenario: Passed check still shows what it inspected
- **WHEN** the as-of date read from the document is 2025-12-31 for declaration year 2025
- **THEN** the `as_of_date` entry has `passed: true`, `observed: "2025-12-31"`, `expected: "2025-12-31"` and `note: null`

#### Scenario: Regex gate hit
- **WHEN** an inbound message contains "ignore all previous instructions"
- **THEN** the `injection_detection_regex` row lists eleven checks, `ignore_instructions` with `passed: false` and a note quoting the matched text, the others with `passed: true`, and `result: false`

#### Scenario: Classification drops an unknown id but stays legible
- **WHEN** the classifier answers with a matched id that was not among the ids it was shown, `legible: true` and no suspected injection
- **THEN** the `validate_classification` row has `result: false`, `matched_id_known` failed with a note naming the rejected id, and `not_injection_suspected` and `legible` passed

#### Scenario: Decision rejected by business rules
- **WHEN** the planner's answer parses against the schema but normalization rejects it (for example, an evidence quote not found in the transcript)
- **THEN** the `validate_message` row for that attempt has `result: false`, `json_schema` passed and `business_rules` failed with the rejection message as note

#### Scenario: Printed id compared with the CRM card's id
- **WHEN** the client's id on file came from the monday CRM card and the document prints the same id
- **THEN** the `verify_extraction` row has `id_matches_client` passed, observed the masked printed id, expected "client" with the masked id on file and "(monday CRM)" as its source

#### Scenario: Printed id is the spouse's
- **WHEN** the spouse's id ••••••782 is on file from the questionnaire and the document prints 123456782
- **THEN** the row has `id_matches_client` passed with observed `••••••782` and expected "spouse ••••••782 (questionnaire)", `subject` passed with expected the spouse's name, and no `spouse_adopted` entry

#### Scenario: Printed id adopted as the spouse's
- **WHEN** the client's id is on file, no spouse id is on file, the client is not registered as not married, and the document prints a checksum-valid id that is not the client's
- **THEN** the row has `id_matches_client` passed with expected "spouse" and the masked printed id "(document)", followed by `spouse_adopted` passed with the masked id and the printed name

#### Scenario: Printed id belongs to a third person
- **WHEN** the client's id ••••••448 and the spouse's id ••••••821 are on file and the document prints a checksum-valid id ending 555
- **THEN** the row has `result: false`, `id_matches_client` failed with observed `••••••555`, expected listing "client ••••••448 (monday CRM)" and "spouse ••••••821 (document)", and a note that the document belongs to neither, and `subject` failed as well

#### Scenario: Printed id but nothing on file
- **WHEN** the document prints an id, the client has no tax-portal credentials, the CRM card (if any) yields no id, and no spouse id on file equals the printed id
- **THEN** the row carries `client_id_on_file` with `passed: false` and a note that no id is on file, `id_matches_client` is absent, and `result` is not affected by this check

#### Scenario: Classification drops a match to another company
- **WHEN** the classifier matches a study fund certificate issued by Harel to the row "study fund — Altshuler Shaham"
- **THEN** the `validate_classification` row has `result: false`, `matched_id_known` and `matched_type_agrees` passed, and `issuer_matches_item` failed with `observed: "Harel"`, `expected: "Altshuler Shaham"` and a note that the companies differ

#### Scenario: Required typed field missing
- **WHEN** a contents-insurance policy is verified and the extractor returns `contents_sum: null` with both period dates read
- **THEN** the `verify_extraction` row has `type_fields` with `passed: false`, `observed` listing the policy number, "לא נמצא" for the contents sum and the two dates, and a note naming the contents sum as missing; `result` is `false`

#### Scenario: Policy period does not cover the valuation date
- **WHEN** a contents-insurance policy for 2025-01-01 to 2025-11-30 is verified for declaration year 2025
- **THEN** the row has `period_covers_valuation_date` with `passed: false`, `observed: "2025-01-01 – 2025-11-30"`, `expected: "2025-12-31"` and a note that the policy period does not include the valuation date

#### Scenario: Type without extra fields
- **WHEN** a prior declaration (a type with no extra fields) is verified
- **THEN** the row carries neither `type_fields` nor `period_covers_valuation_date`
