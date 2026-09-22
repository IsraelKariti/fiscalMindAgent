## Why

Items that come from the online questionnaire are often named after a person, not a company ("קרן השתלמות מיכל", "ביטוח מנהלים ניב"). The company check of `unlisted-files` then drops every match to such an item ("item company not identified"), so a client who sent all their fund and insurance reports in one PDF ends with every item still pending and a confirmation question for each report. Observed on 2026-09-20: one WhatsApp PDF, eleven reports, eleven correct matches, eleven dropped.

## What Changes

- When a list item of an institution-bound type names no company that the institutions table knows, the company check no longer drops a match to it: a file whose document type equals the item's type is accepted (by the file check and by the planner's pairs alike). Two identified, different companies are still always refused; a file whose own company cannot be identified still needs the client's quoted words.
- The `issuer_matches_item` check passes in that case with the expected value "not identified", so the step detail still shows that the comparison was one-sided.
- Known limit, accepted by the owner: an item named "קרן השתלמות ניב" can receive files from several companies; the accountant tells them apart on the documents tab by the company on each file.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `unlisted-files`: the requirement "Code compares the company of the file with the company of the item" — an unidentified item company is accepted when the document types agree, for the file check and for the planner's ties.
- `file-splitting`: the scenario "The gate drops the match" no longer describes a drop for an item that names no company; the same behavior is kept for two different companies.

## Impact

- `src/agents/declarationOfCapital/institutions.ts` (`tieAllowedByCompany`), `analyzeFileRules.ts` (`validate_classification`), `fileTies.ts` (`companyRefusal`, `filterPairsByCompany`).
- Tests: `tests/analyzeFileRules.test.ts`, `tests/institutions.test.ts`, `tests/fileTies.test.ts`.
- Docs: `docs/agents.md` (unlisted-files section, rule 2).
- No migration, no UI change, no prompt change. Files already stored with `match_dropped: "item company not identified"` are not re-checked; the planner may still pair them with the item, and the pair is now accepted.
