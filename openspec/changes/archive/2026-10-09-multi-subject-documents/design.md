## Context

See proposal.md — Why. Today the extraction contract (`verifyChecks.ts`: `ExtractedFields`, `ExtractionSchema`, `EXTRACTION_PROMPT`) carries one `subject_name` and one `subject_id_number`. `runChecks` hands those two values to `resolveSubjectIdentity` (`spouseIdentity.ts`), which is the whole of chart B of the "Document Approval Flow" artifact: one person, resolved against the client and the one spouse on file, with adoption as a returned proposal. `verifyDocument.checkExtractedData` persists the adoption and writes the `verify_extraction` row with `subject_matched`. The evals judge (`evals/stages.ts`, `extract_document` stage) expects `subject_id_number` and re-implements the subject rule for `subject_name_matches`. Nothing in the path can represent two people on one document, so the model is forced to pick one id and to pack several names into one string; the gate then treats that string as a person's name.

The real case of 2026-10-07 (trace step `0deaaf3b-…`): the four-party contract became the spouse "מקמל קתי פנינה, מקמל חזי, תמיר מיכל, תמיר ניב" with an id that may be a seller's.

## Goals / Non-Goals

**Goals:**
- The model never has to choose: it lists every person with the id printed beside that person and a role.
- The per-person identity rule (chart B) stays exactly as it is, pure and tested; what is new is a document-level rule over the owner parties.
- Joint documents of the household pass; co-owners who are not the household never reject a document and never become the spouse by accident.
- Adoption always stores one person's id and one person's name.
- Old verification records and trace rows stay readable.

**Non-Goals:**
- Changing the classifier's `subject_name` (descriptive, prose only) or its `holdings[].holder_name` (already per holding).
- Tying a file to the spouse's list instance by party (the planner does that from the classifier's holder names today).
- A second spouse, children, or partial-ownership percentages.
- A workspace action to clear or edit the spouse (still by hand in the DB; the one wrong local record is cleaned by hand).
- A DB migration: parties live inside the stored extraction answer and the trace detail, both JSON.

## Decisions

**D1. The extraction contract: `parties` replaces the two subject fields.**
`ExtractedFields` loses `subject_name` and `subject_id_number` and gains `parties: { name: string; id_number: string | null; role: 'owner' | 'counterparty' | 'other' }[]` (max 10, the gate cuts a longer list). `ExtractionSchema`, `extractionJsonSchema` and `EXTRACTION_PROMPT` change together, as the `document-extraction` spec requires. The prompt line for `parties` says, in Hebrew: one entry per person; the name as printed beside that person; the id as printed beside that same name, digits only, or null when no id is printed for that person or the pairing cannot be read; never join names; never give an owner a counterparty's id; the role by the document's own words (the buyer / account holder / member / insured / borrower / heir / registered owner is `owner`; the seller / lending bank / builder / giver is `counterparty`; witness / lawyer / guarantor / agent is `other`). *Alternative:* keep `subject_*` and add `parties` beside them — rejected: two sources of truth, and the model would keep packing names into the old field.

**D2. Per-party rule stays; a document-level rule is added on top.**
`spouseIdentity.ts` keeps the per-person logic but splits it into two named functions, as `docs/pipeline.md` asks (one junction, one function):
- `resolveParty(party, ctx) → { kind: 'client' | 'spouse' | 'adoptable' | 'nobody' | 'uncompared', reason }` — chart B for one person. `uncompared` is the "no client id on file" path. `adoptable` carries the four conditions already in the spec (no spouse id on file, checksum valid, not registered as not married, name does not contradict the spouse name on file). The name-only branch gives `client` / `spouse` / `nobody`.
- `resolveDocumentOwners(parties, ctx) → IdentityVerdict` — filters `role === 'owner'`, calls `resolveParty` for each, then decides: `matched` is `client`, `spouse`, `both` or `null` from the resolved owners plus the adoption; `adopt` from D3; `coOwners` = owners resolved as `nobody` or `adoptable`-but-not-adopted when the document was accepted; `checks` built as D4 says.
`runChecks` calls `resolveDocumentOwners`. `resolveSubjectIdentity` is removed (its tests move to the two functions). *Alternative:* one function with a loop inside — rejected, the pipeline doc and the chart want each decision nameable.

**D3. Adoption from a multi-owner document only through a name on file.**
`chooseSpouseToAdopt(resolvedOwners, ctx) → { idNumber, name } | null`: the candidates are the owners resolved as `adoptable`. Adopt when there is exactly one candidate and either the document has exactly one owner (today's rule, unchanged) or a spouse name is on file and the candidate's own name loosely matches it (for one owner this is already inside `adoptable`; for several owners it is the only way to tell the spouse from a sibling, a parent or a business partner). Otherwise `null`. The stored name is `ctx.spouse.name ?? candidate.name` — one party's printed name. Two candidates never adopt, even with a name on file, because `namesLooselyMatch` is loose (a shared surname) and two Tamirs could both match. *Alternative:* adopt the co-owner whenever the client is married and the surname matches — rejected, a brother or a parent shares the surname.

**D4. Check entries over the owner parties, keys unchanged, one new key.**
`subject`, `id_checksum`, `id_matches_client`, `spouse_adopted`, `client_id_on_file` keep their keys (older trails, i18n labels, the evals judge). Their observed/expected wording follows the `code-gates` delta: owners listed as "name (••••••123)" joined by " · ", capped at 6 like amounts. `id_checksum` fails when any owner id fails. `co_owners` is new, informational, always passed, present only when the document was accepted and another owner is not the household. `describePerson` is reused; a `both` match joins the two descriptions with " / ". `ChecksVerdict.subjectMatched` becomes `'client' | 'spouse' | 'both' | null`; `adoptSpouse` is unchanged in shape.

**D5. Trace detail carries the parties.**
`recordVerifyExtractionStep` adds `parties: [{ name, role, maskedId, resolved }]` (`resolved`: `client` / `spouse` / `adopted` / `co_owner` / `none` / `uncompared`; counterparties and others get `none`). The step modal renders this list under the checks, by the i18n labels. Full ids never reach the detail (same `maskId`). Old rows without `parties` render as today.

**D6. Evals judge expects parties.**
`VerifyDocumentCase.expected` replaces `subject_id_number` with `owner_ids: string[]` (digits, order-free, every owner id the document prints) and keeps `subject_name_matches`, now computed through the real `resolveDocumentOwners` instead of a copy of the rule. A new optional `expected.verdict.adopted: boolean` checks `adoptSpouse !== null`. Three cases on two new synthetic PDFs built by `evals/make-files.ts`: `contract_four_parties.pdf` (two sellers with ids, two buyers with ids; judged twice — client only, and client with the spouse's name on file expecting adoption) and `joint_bank.pdf` (two holders with ids, client plus a third person; expects `co_owners`, no adoption). A third case reuses the contract PDF with the buyers' ids blanked (`contract_sellers_ids_only.pdf`) and expects owners without ids and no adoption. Existing cases that state `subject_id_number` are rewritten to `owner_ids` with the same digits. Regen churn rule: restore every unchanged PDF before committing (memory).

**D7. Prompt for the planner: nothing changes.**
The planner already reads `VERIFICATION RESULTS` (reasons in Hebrew) and the `CLIENT IDENTITY` block. Co-owners are not told to the planner: they are an accountant's detail in the trace, and nothing in the conversation rules depends on them.

## Risks / Trade-offs

- [The model pairs an id with the wrong name] → the only defense is the prompt wording and the evals; a mispaired client id still passes `subject` as the client, and a mispaired stranger id on the client's name resolves that party to `nobody` (contradiction inside the party), so the document fails rather than adopts. Accepted.
- [A document of only strangers with a co-owner that matches by surname] → `subject` fails; nothing adopted. Same as today.
- [Fewer adoptions than today on joint documents without a spouse name on file] → by design; the spouse gets adopted from their own single-owner document (pension, study fund), which is the common case. The questionnaire usually gives the name.
- [Stored answers with the old shape in `document_files` / `client_documents.verification`] → readers (`typeFieldValue`, the step modal) never required `subject_*`; nothing breaks. The evals `results/*.json` of old runs keep the old keys; `rejudge` of an old run reports the missing `parties` as a failed case, which is acceptable for history files.
- [Longer prompt and answer] → ten parties at most; the list is short on every real document.

## Migration Plan

No DB migration. Deploy the code; documents verified from then on carry `parties`. The local test client "ניב" has the wrong spouse (`agent_fields.spouse`) from the 2026-10-07 run: clear it by hand (set `spouse` to null, or re-fire the kickoff with the spouse cells filled, which wins over the inferred value) and re-collect the contract to see the new row. Rollback: revert the code; stored `parties` are ignored by the old reader, and the old reader's `subject_*` are absent from new answers, which the old gate treats as "subject not printed" (the document fails `subject`, nothing is adopted).
