## MODIFIED Requirements

### Requirement: Content-analysis line per file
Each file sub-row SHALL show the result of the content analysis. When analysis is done, the line SHALL state the identified document kind and, when known, the tax year and subject name. When analysis is not done, the line SHALL show a status badge: pending, failed, or unsupported. A file the platform fetched itself (analysis status "not needed") SHALL show a neutral "fetched automatically from the site" badge with a tooltip explaining that content analysis does not apply, and SHALL NOT be shown as pending. A file that was split into several documents (analysis status "split") SHALL show a neutral "split into N documents" badge, where N is the number of its child files, with a tooltip explaining that each document inside it is listed as its own file; it SHALL NOT show a verdict line and SHALL NOT be shown as pending. A file blocked by the injection filter SHALL show a "blocked" badge instead of a verdict. A done analysis that suspects prompt injection SHALL add a "suspicious content" badge, and one that found the file not legible SHALL add a "not legible" badge.

#### Scenario: Analysis done
- **WHEN** a file's analysis finished and identified a bank balance for tax year 2025 for "Israel Kariti"
- **THEN** its sub-row shows a line naming the document kind, the tax year, and the subject name

#### Scenario: Analysis pending
- **WHEN** a file was received but its analysis has not finished
- **THEN** its sub-row shows a "not yet analyzed" badge and no verdict line

#### Scenario: Fetched file
- **WHEN** a file was fetched by the platform from an external site (status "not needed")
- **THEN** its sub-row shows a "fetched automatically from the site" badge with a tooltip, and not the "not yet analyzed" badge

#### Scenario: Split file
- **WHEN** a file was split into three child files (status "split")
- **THEN** its entry shows a "split into 3 documents" badge with a tooltip, no verdict line, and not the "not yet analyzed" badge

#### Scenario: Blocked file
- **WHEN** the injection filter blocked a file
- **THEN** its sub-row shows a "blocked" badge with an explanatory tooltip and no verdict line

#### Scenario: Suspicious content
- **WHEN** a file's analysis finished and flagged suspected prompt injection
- **THEN** its sub-row shows the verdict line together with a "suspicious content" badge

## ADDED Requirements

### Requirement: The original of a split file stays visible
The parent of a split file SHALL appear in the "files not matched to a required document" group with the same view and download controls as any file, so the accountant can open the original file as the client sent it. It SHALL be counted in that group's title. It SHALL never appear as a sub-row under a checklist item.

#### Scenario: Parent in the unmatched group
- **WHEN** a client sent "scan.pdf" and it was split into two child files that both matched checklist items
- **THEN** the two children appear under their checklist items, and "scan.pdf" appears in the unmatched group with its "split into 2 documents" badge and view/download controls

#### Scenario: Progress not affected
- **WHEN** a client has five of six items approved and the only unmatched file is the parent of a split
- **THEN** the header badge still reads five of six

### Requirement: A child file shows where it came from
Each child file of a split SHALL show, wherever the file is listed (under a checklist item or in the unmatched group), a small note with its page range and the display name of its parent file, for example "pages 3-5 of scan.pdf". The rest of the entry (name, size, date, content-analysis line, view and download controls) SHALL be the same as for any file. View and download on a child SHALL open the child file, which holds only its own pages.

#### Scenario: Child under a checklist item
- **WHEN** a child file holding pages 3-5 of "scan.pdf" is linked to the bank balance item
- **THEN** its sub-row under that item shows the note "pages 3-5 of scan.pdf" next to its usual details

#### Scenario: Child that matched nothing
- **WHEN** a child file holding page 6 of "scan.pdf" matched no checklist item
- **THEN** it appears in the unmatched group with its content-analysis line and the note "page 6 of scan.pdf"

#### Scenario: Viewing a child
- **WHEN** the accountant clicks view on a child holding pages 3-5
- **THEN** a three-page PDF opens, not the whole original file
