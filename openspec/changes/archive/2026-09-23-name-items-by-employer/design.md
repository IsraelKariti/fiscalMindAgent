## Context

See proposal.md — Why. The pieces this change builds on (all landed 2026-09-19..22):

- `analyzeFileRules.ts` / `analyzeFile.ts`: the classifier's schema and prompt; `issuer_name` and `holdings` are file-derived fields the gate keeps only for institution-bound types. `prompt.ts` (`formatHoldings`, the analysis line) shows them to the planner through `sanitizeInline`.
- `splitChildNames.ts`: `companySuffixedName` (item name + " — " + the table's Hebrew company name when the item names none), `childLabel` (matched → suffixed item name; unmatched → `shortNameHe — company`), `childDownloadName`.
- `companySplit.ts` (`planCompanySplit`, pure) and the `apply_collections` block of `plan.ts`: one cycle's allowed pairs are grouped by item; an institution-bound item that names no company is renamed after the first company and gets one sibling per further company through `clientDocuments.splitByCompany` (one transaction; head renamed only while pending/claimed/collected). Created rows carry `resolution_evidence = { source: 'file', file_id, issuer }`; the step detail is `CompanySplitDetail`; the audit row is `document.instances_added` with `reason: 'company_split'`.
- `fileMatchesDocument` already requires that a file's stored match and its filing agree, so a sibling's file never counts as the head's evidence after a split.
- The three Meitav reports of the test client: page 1 of each carries "שם המעסיק: …" and one account number; page 2 (the tax certificate) lists all three account numbers, so `holdings` is identical across the three files. The employer, not the holdings, tells them apart.

## Goals / Non-Goals

**Goals:**
- One employer word, extracted once by the classifier and cleaned once by code, drives the child label, the item name, the split and the download name, so all four agree.
- The split stays pure code over one cycle's pairs, transactional, audited, and needs no client question.
- The relaxation of the "no file text in a name" rule is as narrow as possible: one field, two document types, cleaned and capped.

**Non-Goals:**
- Rewriting items, labels or analyses stored before this change. The test client is re-run by hand (see Migration Plan).
- A table of employers, or matching employer spellings across files beyond a normalised string compare.
- Employer on any type other than study fund and pension/provident.
- Changing the verification checks (`expected_type` compares the item name as today; the employer in the name is text the extractor does not check).

## Decisions

1. **`employer_name` is a new classifier field, kept only for employer-bound types.**
   `FileAnalysisSchema` gains `employer_name: z.string().nullable()` (typed optional on `FileAnalysis` like `issuer_name`, for older rows). The prompt line says: the employer of the fund as printed on the report ("שם המעסיק"), null when none is printed or when the file shows accounts of two or more employers; copy only what is printed. `catalog.ts` gains `employerBound: true` on `study_fund` and `pension_provident` and `isEmployerBound(typeKey)`; `validateClassification` nulls the field for other types (mirrors the holdings rule), and reports no new check — the field decides nothing in the gate. Alternative: an `employer` per holding entry — rejected: the certificate page lists all accounts without employers, so a per-holding field would be null for the very files that need it, and one report is one fund anyway.

2. **Cleaning lives in `splitChildNames.ts` as `cleanEmployer(text): string | null`.**
   Same `UNPRINTABLE` strip and whitespace collapse as `clean`, then `—` → `-`, trim, null when longer than 60 characters or without a letter (Hebrew or Latin). Everything that uses the employer (labels, item names, the split, the planner line, the evidence) calls this one function, so a value that fails cleaning is absent everywhere. Cap at 60 rather than truncating: a cut employer name is worse than none, and 60 covers real company names ("גילת רשתות לווין בע"מ" is 21). Alternative: strip legal suffixes (בע"מ, Ltd.) — rejected: they are part of the printed name and harmless; the accountant sees what the report says.

3. **`employerSuffixedName(name, employer, typeKey)` is applied after `companySuffixedName`.**
   Returns `${name} — ${employer}` when the type is employer-bound, `cleanEmployer` gives a value, and `name` does not already contain it (`containsEmployer`: both sides lower-cased and whitespace-collapsed). `childLabel` applies company then employer for a matched child, and builds `shortNameHe — company — employer` for an unmatched one (each part optional). `companySplit.ts` uses the same two functions for item names, so a child's label and the name of the item it ends under are the same string, as today. Alternative: add the employer only when two files of one company collide — rejected: the name would then depend on what else arrived in the cycle, and a single fund's item would be named differently from the same fund arriving with a sibling.

4. **The split becomes two stages inside `planCompanySplit`, same plan shape.**
   Stage 1 (company) is unchanged. Stage 2 (employer) runs for every employer-bound item that has pairs after stage 1 — the original head (renamed or not, including an item that already named a company) and every sibling stage 1 created. Within one item's files, group by `cleanEmployer(analysis.employer_name)`; files with null stay; the first employer whose text the item's name does not already contain renames the item (or, for a stage-1 sibling, extends its planned name), each further employer becomes one more `CompanySplitCreated` with `employerKey` (the normalised text) and `evidence: { source: 'file', file_id, issuer, employer }`. Files whose employer the item's name already contains stay on it. `CompanySplitCreated` gains `employer: string | null`; `CompanySplitRename` is reused. `splitByCompany` is unchanged (it takes names and evidence). `plan.ts` sets the audit `reason` to `'employer_split'` for a created row with an employer, `'company_split'` otherwise. Alternative: a separate `planEmployerSplit` pass run after the DB write of the company split — rejected: two transactions and two audit rounds for what is one division of one item; and the stage-1 sibling's row does not exist yet when stage 2 must plan on it.

5. **The evidence variant grows by an optional `employer`.**
   `{ source: 'file'; file_id; issuer; employer?: string }` in `src/db/types.ts` and `web/src/api.ts`. Stored cleaned. Not shown in `DocumentsCard` (file evidence is shown for no status today); `stepSummary` prints `created_by_company` lines as `name ← file (employer)` when present, with no new row key, so older step rows render as before.

6. **The planner sees the employer; the planner prompt gets one sentence.**
   The analysis line adds `employer: <cleaned>` after the holdings part for employer-bound types. `prompt.md`, in the company-check paragraph: when several reports of one company arrive for one fund item, the platform divides the item per employer in code — do not ask the client which report is which, and do not create instances for them. Without it the planner may try to add instances or ask.

7. **No change to `filterPairsByCompany`, the gate's company check or `fileMatchesDocument`.**
   A Meitav file still matches any Meitav item of the type (same company); the employer step then moves it. `fileMatchesDocument` already keeps a moved file from counting for the item it was moved away from. `verificationTargets` already prefers the cycle's pair for items the split touched.

8. **Evals.** `file_classification` judge gains `employer` (a string that the cleaned answer must equal, or null) next to `issuer_key`; one new case is made from a Meitav-style synthetic report (page 1 with "שם המעסיק", page 2 a certificate listing three accounts), expecting the employer and three holdings. The `run-evals` skill is run before and after the prompt change.

9. **The employer is a classifier field, not a typed extraction field (owner decision, 2026-09-23).**
   The catalog's per-type extraction fields (`fields`, openspec `document-extraction`) are read by the verification step, which runs after an item is collected. The employer is needed earlier: at classification time for the child label and at tie time for the split, both before any item is collected. So `employer_name` lives on the classifier's analysis and `SAVINGS_FIELDS` is left unchanged; the verifier's own `account_number` per item confirms the split in the step modal. Alternative: also declare an optional `employer` extraction field for the two employer-bound types (a separate field list, two Notion child pages, one eval case) — declined by the owner as not needed for naming or splitting.

## Risks / Trade-offs

- [File text enters item names and, through them, later prompts] → One field, two types, cleaned, ≤ 60 chars, must hold a letter; the injection screen and `injection_suspected` quarantine already run before naming, and a quarantined child gets no name. The exception is written into both specs so it is not widened silently.
- [The model reads the wrong line as the employer (e.g. the fund name)] → The prompt names the exact printed label ("שם המעסיק") and asks for null when unsure; the eval case checks it; a wrong employer costs a wrong suffix, not a wrong match (the field decides nothing).
- [Two spellings of one employer on two reports ("פרייסמנס בע"מ" / "פרייסמנס בעמ")] → Two items. Acceptable: the accountant sees both names and can mark one not required; a table of employers is a non-goal.
- [An item that already names a company and is `approved` cannot be renamed] → `splitByCompany` skips a head that left the live statuses, as today; the files stay on it, logged. The test client's Meitav item is `approved` — hence the manual re-run below.
- [Longer names in the list and in WhatsApp messages] → `MAX_CHILD_DISPLAY_NAME` (150) still caps labels; item names are unbounded text today and the planner already sees the full list.

## Migration Plan

No schema change (`analysis` and `resolution_evidence` are JSON). Deploy as usual (push to master → sandbox; manual promotion). Existing rows are not rewritten. To see the change on the test client (`71282430-…`): with the dev stack running, mark the Meitav item pending again from the documents card, re-run classification for the three children through the admin file re-analysis action (or resend the PDF from the test phone), and let the next planner cycle split the item. Rollback: revert the commit; rows and labels created by the split are ordinary items and files and stay valid; `employer_name` in stored analyses is ignored by the old code.
