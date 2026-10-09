## MODIFIED Requirements

### Requirement: Checks reported by each existing gate
The gates SHALL report the following checks (keys are stable identifiers; the human labels live in the UI):

- `injection_detection_regex`: one entry per named injection pattern (`system_impersonation`, `ignore_instructions`, `ignore_instructions_he`, `system_prompt`, `system_prompt_he`, `role_tags`, `ai_address`, `ai_address_he`, `state_command`, `state_command_he`, `fence_forgery`); `passed` is `true` when the pattern did not match; a failed entry's `observed` and `note` quote the matched text (capped); a passed entry's `observed` is `null` (nothing matched).
- `validate_injection_scan`: `clean_without_evidence` when the model said "clean" (fails if it still quoted evidence); `hit_has_evidence` when the model said "suspected" (fails if it quoted nothing); `evidence_verbatim` when the model said "suspected", quoted something, and the reviewed text was readable (fails if the quote is not found verbatim in the text). When the text was not readable, `evidence_verbatim` is absent. `observed` is the model's quoted evidence (capped) or `null` when it quoted nothing.
- `validate_form_resolutions`: one entry per proposed verdict, keyed by the catalog type key; `passed` is `true` when the resolution was accepted or left for the interview as unclear, `false` when it was dropped, with the drop reason as `note`; `observed` is the proposed verdict plus, for a `not_required`, the question and quote the model cited (capped).
- `validate_classification`: `matched_id_known` when the model matched a document id (fails if that id was not in the list it was shown; `observed` = the matched id); `matched_type_agrees` when a known id was matched and the answer carries a document type (fails if the row's type disagrees; `observed` = the answer's document type, `expected` = the matched row's type); `issuer_matches_item` when the match survived the two checks before it and the matched row's document type is institution-bound, as the `unlisted-files` capability defines (fails when the company printed on the file and the company the row names differ, or when either cannot be identified; `observed` = the file's company, or the printed issuer text when it was not identified; `expected` = the row's company, or "not identified"; the note says which of the three it was); `not_injection_suspected` (fails when the model flagged a suspected injection; `observed` = the flag); `legible` (fails when the model judged the file illegible; `observed` = the model's verdict). The last two are reported even though they do not change `result` (quarantine is reported alongside, never flipped).
- `validate_message`: `json_schema` (the answer parses and matches the response schema) and `business_rules` (the parsed answer passes normalization: evidence quotes, instance caps, channel rules, attestation gate). On failure the `note` is the rejection message, capped; `business_rules` is absent when `json_schema` failed. `observed` for `json_schema` is the answer's length in characters; for `business_rules` it is the decision kind and channel the answer proposed.
- `verify_extraction`: the per-document checks, each with the value read from the document as `observed`, the reference as `expected`, and, on failure, a `note` that names the exact problem. The identity entries are judged over the document's owner parties (the `document-extraction` capability: the people listed with role `owner`); the other parties never take part in them:
  - `legible`: observed = the model's legibility verdict.
  - `expected_type`: observed = what the model saw the document as (`actual_kind`); expected = the required document's name.
  - `subject`: observed = the owner parties, each as the printed name and, when printed, the masked id (capped to a short list), or "לא מצוין" when the document lists no owner; expected = the person or persons the document was accepted for — the client's name, the spouse's name (or "בן/בת זוג" when the spouse's name is unknown), or both joined; on failure, the client's name and the spouse's name when one is on file. Passes when at least one owner party is the client or the spouse, by id or by name, or is adopted as the spouse in this verification. Fails when no owner party is any of these, and also when the only owner parties that could have matched by name print an id that belongs to someone else (a name cannot vouch against that party's own contradicting id).
  - `id_checksum`: when at least one owner party prints an id; observed = the masked ids of the owner parties that print one; fails when any of them fails the Israeli checksum, with the note naming that masked id. A counterparty's or other party's id is never checked.
  - `id_matches_client`: when at least one owner party prints an id and an id is on file for the client or the spouse; observed = the masked ids of the owner parties that print one; expected = on a pass, the person or persons matched — "client" and/or "spouse" — each with that person's masked id and its source in parentheses (the tax-portal credentials, the monday CRM card, the questionnaire, or a document); on a failure, the client's masked id with its source and, when one is on file, the spouse's masked id with its source. Passes when the document was accepted for the client or the spouse: an owner party's id equals the client's id or the spouse's id, the `spouse-identity` capability adopts an owner party's id as the spouse's, or an owner party without an id matched by name while the printed ids belong to co-owners. Fails, with the note naming the reason, when no owner party is the client or the spouse and none is adopted: a spouse is already on file (third person), the client is registered as not married, the printed name does not match the spouse name on file, or the document has several owners and no spouse name is on file to tell the spouse from a co-owner.
  - `spouse_adopted`: when the `spouse-identity` capability adopted an owner party's id as the spouse's in this verification; always `passed: true`; observed = that party's masked id; expected = that party's printed name (or "name unknown"). Absent otherwise.
  - `co_owners`: when the document was accepted for the client or the spouse and at least one other owner party is neither of them; always `passed: true`; observed = those parties, each as the printed name and the masked id when printed (capped to a short list). Reported alongside; it never changes `result`. Absent otherwise.
  - `client_id_on_file`: when at least one owner party prints an id, no id is on file for the client (after the CRM-card fetch of the `declaration-kickoff` capability), and no owner party's id is the spouse's id on file; `passed: false`, observed = "none", note = the client has no id on the tax-portal credentials or the monday CRM card, so the printed ids could not be compared. This check is reported alongside and does not change `result`.
  - `as_of_date`: observed = the as-of date read (or "not stated"); expected = 31.12 of the declaration year.
  - `not_expired`: observed = the valid-until date read; expected = the verification date.
  - `amounts`: observed = the amounts found, each as label, value and currency (capped to a short list); the failure note says which condition failed: no amounts found, a negative value, a value above the sane cap, or a value that is not a number, naming the offending amount.
  - `type_fields`: when the document's type declares extra extraction fields (the `document-extraction` capability); observed = every declared field as its Hebrew label and the value read, "לא נמצא" for a null (capped to a short list); the failure note names, by label, the required field that is missing, the "at least one" group that is empty, or the field whose value is malformed and why (wrong date form, implausible year, not a number, pattern mismatch).
  - `period_covers_valuation_date`: when the document's type states that a period must cover the valuation date and both period dates were read well formed; observed = the period as "from – to"; expected = 31.12 of the declaration year; fails when that date is outside the period.

The `verify_extraction` row's detail SHALL also carry the parties the extraction listed, each with the printed name, the role, the masked id when printed, and whom the party was resolved as (client, spouse, adopted spouse, co-owner, or none), and `subject_matched` SHALL be `client`, `spouse`, `both` or `null`.

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
- **WHEN** the client's id on file came from the monday CRM card and the document lists one owner with the same id
- **THEN** the `verify_extraction` row has `id_matches_client` passed, observed the masked printed id, expected "client" with the masked id on file and "(monday CRM)" as its source

#### Scenario: Printed id is the spouse's
- **WHEN** the spouse's id ••••••782 is on file from the questionnaire and the document lists one owner with id 123456782
- **THEN** the row has `id_matches_client` passed with observed `••••••782` and expected "spouse ••••••782 (questionnaire)", `subject` passed with expected the spouse's name, and no `spouse_adopted` entry

#### Scenario: Printed id adopted as the spouse's
- **WHEN** the client's id is on file, no spouse id is on file, the client is not registered as not married, and the document lists one owner with a checksum-valid id that is not the client's
- **THEN** the row has `id_matches_client` passed with expected "spouse" and the masked printed id "(document)", followed by `spouse_adopted` passed with the masked id and that party's printed name

#### Scenario: Four-party contract accepted for the client with a co-owner
- **WHEN** the client's id ••••••448 is on file, no spouse is on file, and a purchase contract is verified whose owners are "תמיר ניב" with id ••••••448 and "תמיר מיכל" with a checksum-valid id ••••••973, and whose counterparties are two sellers with ids
- **THEN** the row has `subject` passed with observed the two owners and expected the client's name, `id_checksum` passed with observed `••••••448 · ••••••973`, `id_matches_client` passed with expected "client ••••••448 (monday CRM)", `co_owners` passed with observed "תמיר מיכל (••••••973)", no `spouse_adopted` entry, `subject_matched: "client"`, and the sellers appear only in the detail's parties list with role `counterparty`

#### Scenario: Four-party contract adopts the spouse by the name on file
- **WHEN** the questionnaire named the spouse "מיכל תמיר" with no id, and the same contract is verified
- **THEN** the row has `id_matches_client` passed with expected naming both "client ••••••448 (monday CRM)" and "spouse ••••••973 (document)", `spouse_adopted` passed with observed `••••••973` and expected "תמיר מיכל", no `co_owners` entry, and `subject_matched: "both"`

#### Scenario: Printed id belongs to a third person
- **WHEN** the client's id ••••••448 and the spouse's id ••••••821 are on file and the document lists one owner with a checksum-valid id ending 555
- **THEN** the row has `result: false`, `id_matches_client` failed with observed `••••••555`, expected listing "client ••••••448 (monday CRM)" and "spouse ••••••821 (document)", and a note that the document belongs to neither, and `subject` failed as well

#### Scenario: One owner's id fails the checksum
- **WHEN** a joint certificate lists the client with his id on file and a second owner with an id that fails the Israeli checksum
- **THEN** the row has `id_checksum` failed with a note naming the second owner's masked id, `result: false`, and `subject` passed as the client

#### Scenario: Printed id but nothing on file
- **WHEN** the document lists an owner with an id, the client has no tax-portal credentials, the CRM card (if any) yields no id, and no owner's id equals a spouse id on file
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
