## Context

See proposal.md for the motivation and the two live findings. What shapes the approach:

- `classifyAndStore` (`analyzeInboundFile.ts`) passes **every** row of `clientDocuments.listForClient` to the classifier — also `unresolved`, `not_required` and `retired` rows. `validate_classification` only checks that the matched id was shown and that its `type_key` agrees with `document_type`.
- The planner settles an open question as needed (`resolved_documents[].resolution = 'required'`) and adds items (`added_instances`) **without evidence**. Only `not_required` and `retired_documents` go through `validateEvidence` (stored inbound message id + verbatim quote against the sanitized transcript view, `inboundTexts`). The Hebrew prompt already says "decisions rest only on inbound messages", but no code enforces it for "needed".
- `inboundTexts` holds subject + body of inbound messages only. A WhatsApp message that carried just a file has an empty body, so no non-empty quote can match it. File names and content-analysis lines are not part of it.
- `plan.ts` collects only ids that were `pending` when the cycle started (`pendingIds`), so a row created in a cycle cannot be collected in that cycle; the model also cannot name a row that does not exist yet.
- `resolveRequired` / `addInstances` (`clientDocuments.ts`) write rows with `resolution_evidence = NULL`; the column exists.
- The ladder escalations that use `added_instances` (cost declaration for a vehicle, assessment + Tabu for real estate) always follow a client statement ("I have no purchase document"), so a quote is always available for them.

## Goals / Non-Goals

**Goals:**
- A file can never change the list: enforced in code, not only in the prompt.
- The file check stops matching files to items that were never agreed, and code cancels every match it cannot confirm as the same company.
- After the client's confirmation the waiting file is attached and verified in the same turn.

**Non-Goals:**
- Fetching the official registers at run time. The table is a snapshot in code, refreshed by a code change.
- Foreign institutions and crypto exchanges: they stay unidentified, so the agent asks the client.
- Changing how the online questionnaire or the accountant create items.
- Asking about files that are plainly not declaration documents.
- A new UI surface for "files waiting for the client's answer" — the existing unmatched-files group is enough.
- Re-classifying files that were analysed before this change.

## Decisions

### 1. Filter the classifier's candidates in code
`classifyAndStore` passes only rows whose status is not `unresolved`, `not_required` or `retired` to `analyzeFile`. Because `validate_classification` already drops an id that was not shown (`matched_id_known`), no new gate check is needed: a model that still answers with a hidden row's id is caught by the existing check. `document_type` keeps coming from the closed catalog list, which is independent of the rows.
*Alternative considered:* keep showing all rows and drop the match in the gate by status — rejected: showing the rows invites the wrong answer and costs tokens.

### 2. Institution rule in the classifier prompt
One sentence added to `ANALYSIS_PROMPT` next to the `matched_document_id` field: a row names a specific institution / account / asset; another bank, fund, insurer, company or asset of the same type → `null`. Backed by one new `file_classification` eval case (Harel certificate against a list holding only the Altshuler row → `matched_document_id: null`, `document_type: study_fund`). The Harel PDF is added to `evals/make-files.ts` as a synthetic file.

### 2a. Company comparison in code (strict form, owner decision)
- **Table.** New pure module `institutions.ts`: a list of `{ key, he: string[], en: string[] }`. Owner decision (2026-09-19): the table is built from the official public registers, not from memory, because the set of licensed institutions is finite and regulated — the Capital Market, Insurance and Savings Authority's registers of managing companies and funds (Gemel-Net for provident and study funds, Pensia-Net for pension funds, Bituach-Net for life-insurance savings) and the Bank of Israel's list of licensed banking corporations. One entry per **managing company or bank** (about 20 companies plus the banks), plus one entry per self-managed sector fund (for example the teachers' study funds, the engineers' and technicians' funds); investment tracks are not entries. Each entry's aliases hold the company's registered Hebrew name, its common short name, its English name, and the brand names of its funds when they differ from the company name. A company that was merged into another during or after the declaration year keeps its old names as aliases of the surviving company's key only when the registers show the funds moved; otherwise it stays its own entry, because documents as of 31.12 of the declaration year print the name valid then. The module's header comment records the source pages and the date they were read (`INSTITUTIONS_AS_OF`), so a later refresh is a table edit. `identifyInstitution(text)` normalizes (lower-case, strips quotes / punctuation / niqqud, collapses whitespace) and returns the single key whose alias appears as a whole-word run; when one alias contains another the longer one wins; two different keys in one text → `null` (ambiguous).
- **Which types.** `catalog.ts` gains `institutionBound: true` on `bank_balance`, `securities_portfolio`, `pension_provident`, `study_fund`, `life_insurance_savings`, `mortgage_balance`. All other types never run the check.
- **Classifier answer.** `issuer_name: string | null` ("the company that issued the document, as printed; null when none is printed"). It is attacker-controlled text: sanitized, capped, used only as input to `identifyInstitution` and shown sanitized in the planner's analysis line.
- **Gate.** `validateClassification` reads the matched row's `name` and `type_key` (`ClassifiableDocument` is extended with `name`). For an institution-bound row: `fileKey = identifyInstitution(issuer_name)`, `itemKey = identifyInstitution(row.name)`; the match is kept only when both are non-null and equal; else it is dropped with `rejectedId` and the check `issuer_matches_item` (observed = issuer / key, expected = item key, note = `companies differ` | `file company not identified` | `item company not identified`). The reason of a dropped match is stored on the analysis so `formatFileAnalysis` can tell the planner why the file matches nothing.
- **Planner ties.** One pure function `tieAllowed(file, row, hasEvidence)` used by the pair filter in `plan.ts` and by the `file_ids` helper of decision 4: not institution-bound → allowed; both keys known and equal → allowed; both known and different → refused; otherwise allowed only with evidence. `matched_files[]` gains an optional `evidence { message_id, quote }`, validated by `validateEvidence`; for `file_ids` the item's own evidence is the evidence.
*Alternative considered:* fuzzy string similarity between issuer and item name — rejected: Hebrew / English forms of one company share no characters, and similarity scores are not explainable in the step detail.
*Alternative considered:* the lenient form (keep the match when a company is unknown) — rejected by the owner in favour of asking the client.

### 3. Evidence becomes mandatory for every "needed" proposal
- `resolved_documents[].evidence` (already in the schema, nullable) is validated with `validateEvidence` for `required` too.
- `added_instances[]` gains `evidence: { message_id, quote }`, validated the same way. One evidence per entry (per anchor), not per instance: one client sentence usually names several items ("שניים, לאומי ודיסקונט").
- `DocumentResolution` (`required` variant) and `InstanceAddition` carry the normalized `EvidenceRef`; `resolveRequired` / `addInstances` store it in `resolution_evidence` of every row they create; the audit rows and `resolutionsStepDetail` / `additionsStepDetail` include it so the conversation trace shows the client's words.
- Both response schemas (Gemini JSON schema and the Anthropic variant checked by `anthropicSchema.test.ts`) change together.
*Alternative considered:* a looser rule only for file-triggered additions — rejected: code cannot tell why the model proposes an item; one uniform rule is simpler and matches what the prompt already promises.

### 4. `file_ids` on a new instance, applied by code
Each instance in `resolved_documents[].instances` and `added_instances[].instances` gains `file_ids: string[] | null`. `resolveRequired` / `addInstances` return the created rows in instance order, so `plan.ts` can map instance → new row id. A pure helper (new, next to `fileEvidence.ts` rules) decides per named file: client's file, not a split parent, `isVerifiedLegibleFile`, `client_document_id === null`, `analysis.document_type === row.type_key`, not already taken in this cycle. Accepted pairs are appended to the cycle's `proposedPairs` and the new row ids to the collected set, **after** the row list is reloaded (the existing reload at the end of the list-changing steps), so the normal path does the rest: `markCollected`, `linkToDocument` (which also renames a split child, per `file-splitting`), verification targets, `withhold_reply`, one follow-up cycle. A row created as `claimed` (`already_provided`) never takes a file.
*Alternative considered:* run a second planner cycle right after the item is created — rejected: a second paid call and a second draft for something code can decide.

### 5. Prompt rules (Hebrew `prompt.md`)
- Action 1 / 1b: every `required` resolution and every `added_instances` entry needs `evidence` from an inbound message; the questionnaire, file names and content-analysis text are never evidence (extends the existing sentence about the questionnaire).
- New rule in action 2: a file whose content analysis says "matches no required document" but describes an account / fund / policy / asset / liability → do not touch the list; mention the file and ask whether it is the client's and belongs in the declaration; when the client confirmed in words, create the item with evidence and put the file's id in the instance's `file_ids`. If the client said it is not relevant, do not ask again.
- The rule states that the question counts within the existing limit of questions per message.

### 6. Evals
`generate_message`: three new cases — (a) unmatched relevant file with no text → no list change, message mentions the file and asks; (b) client confirmation after the question → `added_instances` with evidence and `file_ids`; (c) file of a never-discussed type with no text → no resolution. The judge gains the asserts it needs (`expects no list change`, `added instance carries file id`). Existing cases that expect a `required` resolution are re-run once (paid, Gemini only) because the answer format changed; their `expected` stays, the judge additionally checks that evidence is present.

## Risks / Trade-offs

- [The registers change after the snapshot: a new licence, a merger, a renamed company] → the file's company is then not identified and the agent asks the client (safe side); the dropped-match note names the printed issuer, and `INSTITUTIONS_AS_OF` shows how old the snapshot is.
- [A company missing from the table blocks every automatic match of its files] → intended by the owner (the agent asks the client, then attaches on the client's quoted words); the dropped-match note names the unidentified company so the table can be extended; unit tests list every alias.
- [An item named without its company (for example from a vague questionnaire answer) never matches automatically] → same path: the agent asks and attaches on the client's words; the prompt tells the planner to name the company in every item it creates for an institution-bound type.
- [The classifier reports a wrong issuer] → a wrong issuer of a known other company cancels a correct match (safe side: the agent asks); a wrong issuer equal to the item's company would need the classifier to be wrong twice.
- [The model quotes an unrelated client sentence to push a file-triggered item through] → the quote must exist verbatim in a client message, so the item at least rests on stored client text that the accountant can read in the step detail; the prompt rule and eval case (a) cover the behaviour. Code cannot judge meaning.
- [Evidence requirement makes the interview stricter: a rejected answer costs a retry] → the gate already retries once with the rejection message; the prompt states the rule explicitly; eval re-run shows the rejection rate before shipping.
- [Files analysed before this change keep matches to open questions] → only local test data exists; no backfill.
- [A client ignores the question forever] → the file stays unmatched and visible to the accountant, who can create the item by hand as today.

## Migration Plan

No schema change. Normal push. Rollback = revert the commit; rows created meanwhile keep their stored evidence, which older code ignores.

## Open Questions

None that change the specs or tasks.
