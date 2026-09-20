## Why

A file cut out of a multi-document PDF gets a readable name only when it is matched to a document on the client's list. On a real local client a 37-page PDF was cut into 11 files, all read correctly (type, company, year, high confidence), and none was matched: the list items name a person ("קרן השתלמות — מיכל"), not a company, so the strict company check cancels the match (`item company not identified`) or the model proposes none. The accountant sees 11 files called `<original>-p1-9.pdf`, `<original>-p10-11.pdf`, … and must open each one to learn what it is.

## What Changes

- A child file with no accepted match gets a display name built only from our own fixed words: the short name of the document type the file check found, and the company's name from the official institutions table when the company printed on the file is recognised there. Example: "קרן השתלמות — הראל". When the company is not recognised: the type's short name alone.
- The model's free text (its description of the file, its summary, the company name as the model wrote it) is still never used in a name.
- A child whose type is the catch-all "other" type, a quarantined child and a child whose analysis failed still get no display name.
- A match to a list document — by the file check or later by the planner — still names the child after the list document, replacing the type-based name.
- The download name follows the display name as it does today.
- One-time fill for children that were analysed before this change and have no display name.
- No change to matching, to the strict company check, to the documents list, or to files that were never split.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `file-splitting`: the requirement "A child file that matches a list document is named after that document" changes — a child with no accepted match is no longer left without a display name; it gets one from the document type and the recognised company.

## Impact

- `src/agents/declarationOfCapital/catalog.ts` — a short display name per document type.
- `src/agents/declarationOfCapital/institutions.ts` — the Hebrew display name of a recognised company.
- `src/agents/declarationOfCapital/splitChildNames.ts` — the rule that builds the type-based name.
- `src/agents/declarationOfCapital/analyzeInboundFile.ts` — sets the name after the file check.
- `scripts/` — a one-time fill script; `package.json` test list.
- `tests/splitChildNames.test.ts`, `tests/capitalCatalog.test.ts`.
- `docs/agents.md` file-splitting section.
- No migration, no API change, no web change: `document_files.label` already exists and every screen already shows it.
