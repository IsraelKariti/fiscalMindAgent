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
- `validate_classification`: `matched_id_known` when the model matched a document id (fails if that id was not in the list it was shown; `observed` = the matched id); `matched_type_agrees` when a known id was matched and the answer carries a document type (fails if the row's type disagrees; `observed` = the answer's document type, `expected` = the matched row's type); `not_injection_suspected` (fails when the model flagged a suspected injection; `observed` = the flag); `legible` (fails when the model judged the file illegible; `observed` = the model's verdict). The last two are reported even though they do not change `result` (quarantine is reported alongside, never flipped).
- `validate_message`: `json_schema` (the answer parses and matches the response schema) and `business_rules` (the parsed answer passes normalization: evidence quotes, instance caps, channel rules, attestation gate). On failure the `note` is the rejection message, capped; `business_rules` is absent when `json_schema` failed. `observed` for `json_schema` is the answer's length in characters; for `business_rules` it is the decision kind and channel the answer proposed.
- `verify_extraction`: the per-document checks, each with the value read from the document as `observed`, the reference as `expected`, and, on failure, a `note` that names the exact problem:
  - `legible`: observed = the model's legibility verdict.
  - `expected_type`: observed = what the model saw the document as (`actual_kind`); expected = the required document's name.
  - `subject`: observed = the printed subject name (or, when an id match vouched for it, the masked id); expected = the client's name.
  - `id_checksum`: observed = the masked id printed on the document.
  - `id_matches_client`: observed = the masked id printed on the document; expected = the masked id on file.
  - `as_of_date`: observed = the as-of date read (or "not stated"); expected = 31.12 of the declaration year.
  - `not_expired`: observed = the valid-until date read; expected = the verification date.
  - `amounts`: observed = the amounts found, each as label, value and currency (capped to a short list); the failure note says which condition failed: no amounts found, a negative value, a value above the sane cap, or a value that is not a number, naming the offending amount.

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
