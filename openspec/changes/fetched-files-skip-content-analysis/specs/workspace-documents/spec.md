## MODIFIED Requirements

### Requirement: Content-analysis line per file
Each file sub-row SHALL show the result of the content analysis. When analysis is done, the line SHALL state the identified document kind and, when known, the tax year and subject name. When analysis is not done, the line SHALL show a status badge: pending, failed, or unsupported. A file the platform fetched itself (analysis status "not needed") SHALL show a neutral "fetched automatically from the site" badge with a tooltip explaining that content analysis does not apply, and SHALL NOT be shown as pending. A file blocked by the injection filter SHALL show a "blocked" badge instead of a verdict. A done analysis that suspects prompt injection SHALL add a "suspicious content" badge, and one that found the file not legible SHALL add a "not legible" badge.

#### Scenario: Analysis done
- **WHEN** a file's analysis finished and identified a bank balance for tax year 2025 for "Israel Kariti"
- **THEN** its sub-row shows a line naming the document kind, the tax year, and the subject name

#### Scenario: Analysis pending
- **WHEN** a file was received but its analysis has not finished
- **THEN** its sub-row shows a "not yet analyzed" badge and no verdict line

#### Scenario: Fetched file
- **WHEN** a file was fetched by the platform from an external site (status "not needed")
- **THEN** its sub-row shows a "fetched automatically from the site" badge with a tooltip, and not the "not yet analyzed" badge

#### Scenario: Blocked file
- **WHEN** the injection filter blocked a file
- **THEN** its sub-row shows a "blocked" badge with an explanatory tooltip and no verdict line

#### Scenario: Suspicious content
- **WHEN** a file's analysis finished and flagged suspected prompt injection
- **THEN** its sub-row shows the verdict line together with a "suspicious content" badge
