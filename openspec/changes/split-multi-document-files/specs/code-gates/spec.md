## ADDED Requirements

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
