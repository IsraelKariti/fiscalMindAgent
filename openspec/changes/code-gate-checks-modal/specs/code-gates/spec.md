## Purpose

The audit record every code gate leaves behind: the overall verdict of the gate and the ordered list of individual code checks it ran, so a reviewer can see exactly which check passed and which failed without reading raw JSON.

## ADDED Requirements

### Requirement: Every code gate records the list of checks it ran
Each run of a code gate (`injection_detection_regex`, `validate_injection_scan`, `validate_form_resolutions`, `validate_classification`, `validate_message`, `verify_extraction`, and any gate added later) SHALL write one audit row whose detail carries, in addition to the overall `result` (`true`/`false`), a `checks` list. Each entry SHALL have a stable `key` naming the check, `passed` (`true`/`false`), and `note`: a short human-readable reason when the check failed, `null` when it passed. The list SHALL contain only checks that actually ran in that execution, in the order they ran. A gate whose result is `false` SHALL have at least one entry with `passed: false`. A gate never flips a security verdict: a check that reports quarantine or a suspected injection is listed as a failed check, and the row's `suspectedInjection` and severity keep their existing meaning.

#### Scenario: Gate passes
- **WHEN** a gate runs and every check it performed passes
- **THEN** the audit row has `result: true` and a `checks` list where every entry has `passed: true` and `note: null`

#### Scenario: Gate fails on one check
- **WHEN** a gate runs and one of its checks fails
- **THEN** the audit row has `result: false`, and the `checks` list contains that check with `passed: false` and a non-empty `note` explaining why, alongside the other checks with their own outcomes

#### Scenario: Conditional check did not run
- **WHEN** a gate skips a check because it does not apply (for example, no id number was printed on the document, so the id checksum check has nothing to test)
- **THEN** that check is absent from the `checks` list rather than listed as passed

### Requirement: Checks reported by each existing gate
The gates SHALL report the following checks (keys are stable identifiers; the human labels live in the UI):

- `injection_detection_regex`: one entry per named injection pattern (`system_impersonation`, `ignore_instructions`, `ignore_instructions_he`, `system_prompt`, `system_prompt_he`, `role_tags`, `ai_address`, `ai_address_he`, `state_command`, `state_command_he`, `fence_forgery`); `passed` is `true` when the pattern did not match; a failed entry's `note` quotes the matched text (capped).
- `validate_injection_scan`: `clean_without_evidence` when the model said "clean" (fails if it still quoted evidence); `hit_has_evidence` when the model said "suspected" (fails if it quoted nothing); `evidence_verbatim` when the model said "suspected", quoted something, and the reviewed text was readable (fails if the quote is not found verbatim in the text). When the text was not readable, `evidence_verbatim` is absent.
- `validate_form_resolutions`: one entry per proposed verdict, keyed by the catalog type key; `passed` is `true` when the resolution was accepted or left for the interview as unclear, `false` when it was dropped, with the drop reason as `note`.
- `validate_classification`: `matched_id_known` when the model matched a document id (fails if that id was not in the list it was shown); `matched_type_agrees` when a known id was matched and the answer carries a document type (fails if the row's type disagrees); `not_injection_suspected` (fails when the model flagged a suspected injection); `legible` (fails when the model judged the file illegible). The last two are reported even though they do not change `result` (quarantine is reported alongside, never flipped).
- `validate_message`: `json_schema` (the answer parses and matches the response schema) and `business_rules` (the parsed answer passes normalization: evidence quotes, instance caps, channel rules, attestation gate). On failure the `note` is the rejection message, capped; `business_rules` is absent when `json_schema` failed.
- `verify_extraction`: the existing per-document checks (`legible`, `expected_type`, `subject`, `id_checksum`, `id_matches_client`, `as_of_date`, `not_expired`, …) with `note` set to the check's existing failure reason.

#### Scenario: Regex gate hit
- **WHEN** an inbound message contains "ignore all previous instructions"
- **THEN** the `injection_detection_regex` row lists eleven checks, `ignore_instructions` with `passed: false` and a note quoting the matched text, the others with `passed: true`, and `result: false`

#### Scenario: Classification drops an unknown id but stays legible
- **WHEN** the classifier answers with a matched id that was not among the ids it was shown, `legible: true` and no suspected injection
- **THEN** the `validate_classification` row has `result: false`, `matched_id_known` failed with a note naming the rejected id, and `not_injection_suspected` and `legible` passed

#### Scenario: Decision rejected by business rules
- **WHEN** the planner's answer parses against the schema but normalization rejects it (for example, an evidence quote not found in the transcript)
- **THEN** the `validate_message` row for that attempt has `result: false`, `json_schema` passed and `business_rules` failed with the rejection message as note
