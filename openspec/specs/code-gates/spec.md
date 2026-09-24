# code-gates Specification

## Purpose

The audit record every code gate leaves behind: the overall verdict of the gate and the ordered list of individual code checks it ran, so a reviewer can see exactly which check passed and which failed without reading raw JSON.

## Requirements

### Requirement: Every code gate records the list of checks it ran
Each run of a code gate (`injection_detection_regex`, `validate_injection_scan`, `validate_form_resolutions`, `validate_classification`, `validate_message`, `verify_extraction`, and any gate added later) SHALL write one audit row whose detail carries, in addition to the overall `result` (`true`/`false`), a `checks` list. Each entry SHALL have a stable `key` naming the check, `passed` (`true`/`false`), `note`: a short human-readable reason when the check failed, `null` when it passed, `observed`: the value the check inspected, as short human-readable text (`null` only when the check had no value to show), and `expected`: what the observed value was compared with, when the check compares against a reference (`null` otherwise). `observed` and `expected` are recorded on passed checks too. Text values are capped; a national-id number SHALL never appear in full: it is masked to its last three digits (for example `••••••782`). The list SHALL contain only checks that actually ran in that execution, in the order they ran. A gate whose result is `false` SHALL have at least one entry with `passed: false`. A gate never flips a security verdict: a check that reports quarantine or a suspected injection is listed as a failed check, and the row's `suspectedInjection` and severity keep their existing meaning.

#### Scenario: Gate passes
- **WHEN** a gate runs and every check it performed passes
- **THEN** the audit row has `result: true` and a `checks` list where every entry has `passed: true`, `note: null`, and its `observed` value (and `expected`, where the check compares against a reference)

#### Scenario: Id number in a check value
- **WHEN** a check inspects a national-id number printed on a document or stored for the client
- **THEN** the entry's `observed` / `expected` show only the last three digits of that number, never the full number

#### Scenario: Gate fails on one check
- **WHEN** a gate runs and one of its checks fails
- **THEN** the audit row has `result: false`, and the `checks` list contains that check with `passed: false` and a non-empty `note` explaining why, alongside the other checks with their own outcomes

#### Scenario: Conditional check did not run
- **WHEN** a gate skips a check because it does not apply (for example, no id number was printed on the document, so the id checksum check has nothing to test)
- **THEN** that check is absent from the `checks` list rather than listed as passed

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

### Requirement: Checks reported by validate_file_split
The `validate_file_split` gate SHALL write its audit row on the inbound file it checked (the parent), with `result`, `reason`, the file's page count, the number of documents proposed, the proposed page ranges, and the `checks` list. It SHALL report these checks, in this order, listing only the checks that ran:

- `document_count_within_cap`: `observed` = the number of documents the model proposed; `expected` = the cap (20). Fails when the number is zero or above the cap. When it fails, the checks below are absent.
- `ranges_inside_file`: `observed` = the proposed ranges as short text (for example "1-3, 4-5"); `expected` = the file's page count. Fails when a range starts before page 1, ends after the last page, or has its first page after its last page; the `note` names the offending range.
- `ranges_ordered_no_overlap`: `observed` = the proposed ranges. Fails when the ranges are not in ascending order or two ranges share a page; the `note` names the two ranges. Absent when `ranges_inside_file` failed.
- `all_pages_covered`: `observed` = the pages that belong to no range, or "none"; `expected` = "none". Fails when at least one page belongs to no range. Absent when an earlier range check failed.

A `result: true` row with one proposed document means the file was not cut. The row's severity SHALL be `info` when the result is true and `warning` when it is false.

#### Scenario: Accepted split
- **WHEN** the model proposes pages 1-3 and 4-5 for a five-page file
- **THEN** the row has `result: true` and four checks, all passed, with `ranges_inside_file` observed "1-3, 4-5" and expected "5"

#### Scenario: Range past the last page
- **WHEN** the model proposes pages 1-3 and 4-7 for a five-page file
- **THEN** the row has `result: false`, `ranges_inside_file` failed with a note naming the range 4-7, and `ranges_ordered_no_overlap` and `all_pages_covered` are absent

#### Scenario: Page left out
- **WHEN** the model proposes pages 1-2 and 4-5 for a five-page file
- **THEN** the row has `result: false` and `all_pages_covered` failed with `observed` "3"

#### Scenario: Too many documents
- **WHEN** the model proposes 25 documents
- **THEN** the row has `result: false`, `document_count_within_cap` failed with `observed` "25" and `expected` "20", and no other check is listed
