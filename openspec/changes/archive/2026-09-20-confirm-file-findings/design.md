## Context

See proposal.md for the motivation and the real case.

What the planner sees today for each received file is one line built by `formatFileAnalysis` in `prompt.ts`: kind, tax year, subject name, document type, issuer, match verdict, confidence, summary. The data comes from the `file_classification` stage (`analyzeFile.ts`, schema in `analyzeFileRules.ts`) and is stored as JSON in `document_files.analysis`.

In the real case the 11 stored analyses held: the issuer for all files, a `subject_name` for 3 of them, and summaries that say "policies" in the plural with no count. Four summaries mention that the holder's name is hidden. So the planner could not have written "2 policies in each company, one in your name and one in your wife's name": the count and the second holder were never read.

The rule for such a file lives in `prompt.md` (action 2, "a file that does not belong to the list"). It says: say what the file is, and ask whether it is the client's. It does not say what to do with the facts, so the model asked for them.

Constraints that stay:

- A file never changes the list. An item is created only on the client's quoted words (`unlisted-files`).
- Everything the file check reads is text from attacker-controlled bytes. It is cleaned with `sanitizeInline` before it enters the planner's input, and a quarantined file shows nothing.
- `validate_classification` is pure code with its own audited checks. This change adds no check to it.
- Replies are short (2 to 4 sentences) and end with one request.

## Goals / Non-Goals

**Goals:**

- The file check reads, per file, the accounts or policies it shows, with holder and number.
- The planner sees these facts and uses them to state and confirm, not to ask.
- One grouped confirmation for many files of one turn.

**Non-Goals:**

- No change to the company check, to the evidence rule, or to how a waiting file is attached.
- No use of the new list in verification (`verifyChecks.ts`) or in any code gate.
- No re-analysis of files already stored. Old analyses simply have no list.
- No change to the first interview (asking for the company name up front is a separate idea).
- No new database column and no migration.

## Decisions

### 1. A structured list in the file check's answer, not a richer summary

Add a required field `holdings` to `FileAnalysisSchema`: an array of `{ product: string, holder_name: string | null, account_number: string | null }`, at most 20 entries, plus `holdings_partial: boolean`. `holder_name: null` means "no readable name" (absent or blacked out).

Why: the planner must count and group by holder. A free-text summary gave "policies" with no count in the real case. A closed structure forces the model to look for each policy, and lets `prompt.ts` print the count itself instead of trusting the model's arithmetic.

Alternative considered: only tell the summary prompt to mention counts and names. Rejected: not checkable in an eval by code, and the real summaries show the model drops these details.

Alternative considered: a second LLM call (a new stage) that reads holdings only for unmatched files. Rejected: the file check already reads the whole file once; a second pass doubles cost and latency for the 11-file case, and needs a whole new stage with gate, audit row and eval adapter.

The field is required in the schema (Gemini structured output handles required arrays well; an empty array is the "nothing to list" answer). The stored type marks it optional (`holdings?:`) because old rows lack it, the same way `issuer_name` is handled today.

### 2. Instructions of the file check

Add a `holdings` bullet to `ANALYSIS_PROMPT`: list each account, fund or policy that the file shows, only for the institution-bound types; copy the product, holder name and number exactly as printed; `holder_name: null` when the name is missing or blacked out; never take a name or number from the file name or from the required-documents list; empty array for other types. The institution-bound types are already known to code (`isInstitutionBound` in `catalog.ts`); the prompt lists them by their Hebrew names from the catalog so the two cannot drift.

### 3. What the planner sees

`formatFileAnalysis` adds one part after the issuer, only when `holdings` exists and is not empty:

`accounts/policies in file: 2 — (1) <product> | holder: <name or "hidden in the file"> | no. <number or "none">; (2) …` and, when `holdings_partial`, `(partial list)`.

The count is computed in code from the array length. Each text goes through `sanitizeInline` (product 100 chars, holder 100, number 40). Quarantined files return before this code, so they show nothing. Code drops the list (treats it as empty) when the file's `document_type` is not institution-bound, so a stray list on a vehicle licence never reaches the planner.

Account numbers reach the planner but the prompt rule tells it not to quote full numbers to the client; the last 4 digits are enough to tell two policies apart. Masking is done in code: the planner line shows only the last 4 characters of the number. The full number stays in the stored analysis for the accountant.

### 4. The planner rule: state and confirm

Rewrite the paragraph "a file that does not belong to the list" in `prompt.md`:

- State what the analysis shows: company, kind, how many accounts or policies, whose name on each. Relate the holder names to the people of the declaration in plain words ("in your name", "in Michal's name") when the name on the file matches the client or a person the client already mentioned; otherwise quote the name as printed.
- Then ask the client to confirm that this is correct and belongs in the declaration.
- Forbidden: asking for a fact that the analysis line already shows. The rule names the two real bad questions as examples ("how many policies", "in whose name").
- Allowed: an open question for a fact the line does not show. Say that the file does not show it (for example the name is hidden) and ask only for that.
- Several files: one grouped statement by company and holder, one confirmation request at the end. This grouped statement may exceed the 2 to 4 sentence default when many files arrived, laid out as a short numbered list, like the summary message is allowed to.
- Keep the rest of the paragraph as it is: do not change the list, create the item only on the client's words with `evidence` and `file_ids`, pick the type from the analysis, do not ask again after "not mine".

The "one request per message" rule is kept: the grouped confirmation is the one request. When some files also need an open question (hidden holder), the confirmation and that question form one small group, which the existing rule already allows (2 to 3 related questions count as one request).

### 5. Evidence after a short confirmation

No code change. The decision gate checks that the quote is verbatim in a stored inbound message of the client. "כן, הכול נכון" passes today. The prompt rule adds one sentence: after the client confirms, create all the confirmed items in that cycle, each quoting the confirmation, each naming its waiting file in `file_ids`. The item names must carry the company (so the company check passes on the tie) and the holder when there are several holders.

### 6. No new gate check

The list is descriptive input for the planner's wording. It decides nothing in code: no tie, no item, no verdict. So `validate_classification` gets no new check and its audit row keeps its shape. The only code guard is the type filter and the cleaning in decision 3.

## Risks / Trade-offs

- [The model invents a holder or a count] → The instruction says "only as printed"; an eval case with a file that prints no name checks `holder_name: null`. The client still has to confirm, so a wrong statement is corrected by the client and creates nothing by itself.
- [The agent states something wrong with confidence, and the client says "yes" without reading] → Same risk as any confirmation. The created items still go through the company check and the automatic verification of each file (subject name check included), so a wrong holder is caught there.
- [Longer file-check answers on big reports] → The list is capped at 20 entries with short fields.
- [Long replies when many files arrive] → One grouped statement; the rule asks for a compact numbered layout. Accepted: the user prefers a longer statement over an open question.
- [Personal data in the planner's input] → Holder names were already there (`subject_name`). Account numbers are new, so the planner line shows only the last 4 characters.
- [Old analyses have no list] → The planner line is unchanged for them, and the prompt rule says: when the line shows no account list, state what it does show (company and kind) and ask about the rest. The real client's 11 files are in this state; a fresh upload is needed to see the new reply.

## Migration Plan

No database migration. Deploy is a normal push. Rollback is a revert: a stored analysis with the extra field is harmless to the old code (unknown JSON keys are ignored).
