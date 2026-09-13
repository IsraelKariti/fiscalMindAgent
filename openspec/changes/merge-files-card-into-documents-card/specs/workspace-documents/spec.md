## Purpose

What the workspace documents tab shows an accountant about one client: the required-documents checklist, the files received for each item, and the files that matched no item.

## ADDED Requirements

### Requirement: One card lists documents and their files
The documents tab SHALL show a single required-documents card. It SHALL NOT show a separate card that lists all received files.

#### Scenario: Documents tab layout
- **WHEN** an accountant opens a client's documents tab
- **THEN** the tab shows the required-documents card and no separate "files received" card

### Requirement: Linked files appear under their checklist item
Every received file that is linked to a checklist item SHALL appear as its own sub-row under that item. Each sub-row SHALL show the file's display name (label when present, otherwise filename), its size and received date, its content-analysis line, and view and download controls.

#### Scenario: Single linked file
- **WHEN** a checklist item has exactly one linked file
- **THEN** the item shows one sub-row with that file's name, size, date, analysis line, and view/download controls

#### Scenario: Several linked files
- **WHEN** a checklist item has more than one linked file (for example two uploads of the same document, or several employers' 106 forms)
- **THEN** the item shows one sub-row per file, oldest first, and every file has its own view/download controls

### Requirement: Content-analysis line per file
Each file sub-row SHALL show the result of the content analysis. When analysis is done, the line SHALL state the identified document kind and, when known, the tax year and subject name. When analysis is not done, the line SHALL show a status badge: pending, failed, or unsupported. A file blocked by the injection filter SHALL show a "blocked" badge instead of a verdict. A done analysis that suspects prompt injection SHALL add a "suspicious content" badge, and one that found the file not legible SHALL add a "not legible" badge.

#### Scenario: Analysis done
- **WHEN** a file's analysis finished and identified a bank balance for tax year 2025 for "Israel Kariti"
- **THEN** its sub-row shows a line naming the document kind, the tax year, and the subject name

#### Scenario: Analysis pending
- **WHEN** a file was received but its analysis has not finished
- **THEN** its sub-row shows a "not yet analyzed" badge and no verdict line

#### Scenario: Blocked file
- **WHEN** the injection filter blocked a file
- **THEN** its sub-row shows a "blocked" badge with an explanatory tooltip and no verdict line

#### Scenario: Suspicious content
- **WHEN** a file's analysis finished and flagged suspected prompt injection
- **THEN** its sub-row shows the verdict line together with a "suspicious content" badge

### Requirement: Unmatched files group
Files linked to no checklist item SHALL appear in a "files not matched to a required document" group at the bottom of the required-documents card. Each entry SHALL show the same file detail and controls as a linked-file sub-row. The group SHALL be shown only when at least one such file exists, and its title SHALL include the count.

#### Scenario: A file matched nothing
- **WHEN** a client sent a file whose analysis matched no required document
- **THEN** the card shows the unmatched group with that file, its analysis line, and view/download controls

#### Scenario: All files matched
- **WHEN** every received file is linked to a checklist item
- **THEN** the unmatched group is not shown

#### Scenario: File later linked
- **WHEN** an unmatched file becomes linked to a checklist item and the tab is refreshed
- **THEN** the file moves from the unmatched group to a sub-row under that item

### Requirement: Progress count unchanged
The card's header progress badge SHALL keep counting checklist items (approved out of in-goal items), not files. Unmatched files SHALL NOT change the count.

#### Scenario: Unmatched file does not affect progress
- **WHEN** a client has five of six items approved and one unmatched file
- **THEN** the header badge still reads five of six
