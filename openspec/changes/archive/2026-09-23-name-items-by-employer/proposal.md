## Why

A study fund or a pension fund is opened per employer, so one client often holds several funds at the same company, and the company issues one report per fund. Today the three Meitav study-fund reports of the test client (pages 32-33, 34-35 and 36-37 of one WhatsApp PDF) all end under one item, "אישור יתרת קרן השתלמות ליום 31.12.2025 — ניב — מיטב", with one and the same display name and download name, although each report names a different employer on its first page (פרייסמנס בע"מ, גילת רשתות לווין בע"מ, ראנדקום בע"מ). The tax certificate on the second page of each report lists all three account numbers, so the accounts list the file check reports is the same for all three files and tells them apart no better. The accountant cannot see which report is which without opening the files, and the item is "approved" on one file while the other two are never verified on their own.

## What Changes

- The file check reports the **employer** printed on a study-fund or pension report (the "שם המעסיק" line), or that none is printed, or that the file shows accounts of several employers. The planner sees it on the file's analysis line, cleaned like every other file text.
- The names built for a child file and for a list item gain the employer after the company: "אישור יתרת קרן השתלמות ליום 31.12.2025 — ניב — מיטב — פרייסמנס בע"מ". This applies to the two employer-bound document types only (study fund, pension or provident fund). The employer word is the one printed on the file, cleaned and length-capped by code — the first time a name is allowed to carry a word from the file rather than from the platform's own lists. The company word still comes from the institutions table only.
- The per-company split of a list item is extended to a **per-employer split**: when files of one company but different employers are tied to one item of an employer-bound type, the item is renamed after the first employer and every further employer gets its own sibling item, each collected and verified on its own file. A file that names no employer stays on the item it was tied to. An item that already names a company (such as the existing "… — מיטב" item) is split by employer too.
- The split detail in the trace and the audit row say when a rename or a created item came from the employer, with the employer text as evidence next to the file id and the issuer.
- The download name of a child follows its display name as today, so the three Meitav children download as three different files.
- Rows and labels created before this change are not rewritten; the test client above is re-run by hand after the change lands (see design).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `unlisted-files`: "The file check reports the accounts and policies a file shows" also reports the employer of the fund; "An item that names no company is split per company when files are tied to it" becomes a split per company and then per employer, and covers items that already name a company; "A list item is created only on the client's quoted words" names the employer split as part of the one code-made exception.
- `file-splitting`: "A child file that matches a list document is named after that document" adds the employer suffix to a matched and to an unmatched child of an employer-bound type, and relaxes the "no file text in a name" rule for that one cleaned word.

## Impact

- `src/agents/declarationOfCapital/analyzeFileRules.ts` and `analyzeFile.ts`: new `employer_name` field in the analysis schema and prompt; gate keeps it only for employer-bound types.
- `src/agents/declarationOfCapital/catalog.ts`: `employerBound` flag on `study_fund` and `pension_provident`, `isEmployerBound` helper.
- `src/agents/declarationOfCapital/splitChildNames.ts`: employer cleaning and `employerSuffixedName`; `childLabel` and `companySuffixedName` callers pass the employer.
- `src/agents/declarationOfCapital/companySplit.ts` and `plan.ts`: the split groups by company and then by employer; audit reason `employer_split`; step detail unchanged in shape (renamed/created lines) plus an `employer` on created entries.
- `src/db/types.ts`, `web/src/api.ts`: file evidence gains an optional `employer`.
- `src/agents/declarationOfCapital/prompt.ts` (analysis line shows `employer: …`) and `prompt.md` (one sentence: items are divided per employer by code, no question to the client).
- `web/src/components/stepSummary.ts`: created-item line shows the employer when present.
- Tests: `splitChildNames`, `companySplit`, `analyzeFileRules`, `fileHoldings` (analysis line), `stepSummary`; evals: a `file_classification` case with a Meitav report and an `employer` expectation.
- No migration: `analysis` is JSON, `resolution_evidence` is JSON, names are text.
