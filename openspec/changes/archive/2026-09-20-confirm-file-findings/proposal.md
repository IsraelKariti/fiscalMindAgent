## Why

When a client sends files that belong to no list item, the agent asks the client for details the files already show. Real case (client Niv, 2026-09-19): one PDF was cut into 11 files from Harel, Clal, Migdal and others, and the agent replied "how many policies are there in each company, and in whose name is each one?". The client expects the opposite: the agent says what it read ("I see 2 policies in each company, one in your name and one in your wife's name") and the client only confirms.

Two causes were found:

- The agent's instructions for such a file say "say what the file is and ask whether it is theirs". They do not forbid an open question about facts the file already shows.
- The file check does not read the facts needed for such a sentence. It stores one holder name per file and a free summary ("policies of life insurance"). It stores no list of the policies or accounts in the file, so the agent does not know how many there are or whose name is on each one.

## What Changes

- The file check also reports the accounts, funds or policies that the file shows: for each one, the product as printed, the holder's name as printed (or that the name is hidden), and the account or policy number as printed (or none).
- The agent sees this list on the file's analysis line, next to the company and the document type.
- The agent's instructions change for a file that belongs to no list item: the reply states what was read from the files (company, how many policies or accounts, whose name is on each) and asks the client to confirm it. An open question is allowed only for a fact the files do not show (for example a hidden holder name), and the reply then says that this fact is missing from the file.
- Several such files in one turn are covered by one grouped statement and one confirmation request, not one question per file.
- Nothing changes in how list items are created: an item is still created only on the client's own quoted words, and the client's short confirmation ("yes, correct") is such words, as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `unlisted-files`: the requirement "The agent asks the client about a file that belongs to no agreed item" changes from asking to stating-and-confirming; a new requirement makes the file check report the accounts or policies a file shows and makes the planner see them.

## Impact

- File check: `src/agents/declarationOfCapital/analyzeFileRules.ts` (answer schema), `analyzeFile.ts` (instructions of the file check), `src/db/types.ts` (stored analysis shape). Stored analyses of older files lack the new list; they must keep working.
- Planner: `prompt.ts` (the file's analysis line), `prompt.md` (the rule for a file that belongs to no list item).
- Evals: `evals/cases/file_classification.json` and `evals/cases/generate_message.json` get cases for the new list and for the confirm-not-ask reply.
- Docs: `docs/agents.md` and the stage description of the file check.
- No database migration (the analysis is stored as JSON). No change to the code gates' verdicts, to the company check, or to the evidence rule.
