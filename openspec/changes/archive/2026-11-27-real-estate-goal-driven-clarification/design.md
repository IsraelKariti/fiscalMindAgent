## Context

See proposal.md — Why. The pieces that shape the approach, as they are today:

- The planner's real-estate rule (`prompt.md`, "מקרה מיוחד - נדל"ן") is a procedure: "ברר תחילה אם נרכש יד שנייה או מקבלן", with one exception ("אם הלקוח כבר אמר"). The catalog `descriptionHe` of `real_estate` repeats the routes and ends the "bought" route with "והשיחה תברר". Neither says what the papers prove.
- "A file alone never changes the list" (`unlisted-files`): every `resolved_documents`, `added_instances` and `retired_documents` entry needs `{message_id, quote}` from a stored inbound message (`validateEvidence` in `decisionSchema.ts`). This is the prompt-injection fence: file content cannot steer the list.
- Verification (`verifyDocument.ts`) stores the whole extraction answer, including the typed fields and `parties`, in `client_documents.verification.extracted`, and only `approveDocument` writes `approved`. The planner already receives the rows with their `verification` JSON (`ClientDocumentRow.verification`) but reads only `reasons` from it.
- `real_estate` declares papers but no typed fields (`document-extraction`, "First set of typed fields"). `FieldKind` is `text | number | date | year`; a text field may carry a `pattern`.
- The pending change `real-estate-second-hand-contract-only` (tasks done, live check left to the owner, not archived) already made second hand = contract only and added the "ask second hand or builder" sentence. This change refines that sentence.

## Goals / Non-Goals

**Goals:**
- The agent never asks a fact an approved paper proves.
- The only new evidence source is an approved file, judged by code, and only for the one list change a proven seller kind implies.
- No new table, no migration; the proven facts are derived at prompt-build time from the stored extraction.

**Non-Goals:**
- Grouping items into "properties" in code. Items of one property share a name suffix only; the planner keeps doing the per-property reasoning, the code gives it the facts per item.
- Letting the planner use unverified content analysis (the file line in the thread) as a decision source. Unchanged.
- Changing any other type's clarification. The goal-first pattern can be applied to other types later; this change does real estate only.
- A general "approved file as evidence" rule for `resolved_documents`. A property's existence is still the client's word.

## Decisions

**D1. Goal sentence + accepted proofs, in both the catalog and the prompt.**
The `real_estate` `descriptionHe` opens with: "המטרה לכל נכס: הוכחת הבעלות והוכחת עלות הרכישה (בירושה ובמתנה — הבעלות בלבד, הנכס מדווח ב-1 ש"ח). המסמכים שמוכיחים זאת, לפי אופן קבלת הנכס: …" and the routes follow as today. The "והשיחה תברר" ending of the "bought" route becomes "והשיחה תברר רק אם אין נייר מאושר שמכריע". The planner's special case is rewritten in the same order: goal, accepted proofs per route, then the two rules below. The "ברר תחילה" sentence is removed.
*Alternative:* a pure goal with no proof list — rejected, the office does not accept any proof (a tabu alone proves ownership, not the price; a builder contract alone does not give the full price).

**D2. Proven facts are derived by one named function at prompt-build time.**
`provenFactsOf(doc)` in `prompt.ts` (listed in `docs/pipeline.md`) reads `doc.verification.extracted` of an item with `status === 'approved'` and `type_key === 'real_estate'` and returns a structured record `{ owners: string[], purchasePrice?: {value, currency}, sellerKind?: 'private'|'builder', address?, purchaseYear? }` and its Hebrew line: "הוכח במסמך שאושר: בעלות — על שם תמיר ניב, תמיר מיכל; עלות רכישה — 320,000 USD; המוכר — אדם פרטי (יד שנייה); כתובת — …". `owners` are the `parties` with role `owner` (the ownership check passed, or the document would not be approved). Missing fields are left out of the line; an empty record gives no line. `buildDocumentsSection` appends the line as one more `extras` entry; `verificationResultsForPrompt` passes the same text on `VerificationResultPromptInput` (new optional `provenFacts`) and the section builder appends it to the APPROVED verdict only.
*Alternative:* store the facts in a new column at approval time — rejected, the extraction record already holds them and old rows would need a backfill.

**D3. Typed fields on `real_estate`, all optional, `seller_kind` as a text field with a closed pattern.**
`fields`: `property_address` (text), `purchase_price` (number), `price_currency` (text, pattern `^[A-Z]{3}$`), `purchase_year` (year), `seller_kind` (text, pattern `^(private|builder)$`, hint "private = אדם פרטי, builder = קבלן / חברה"). `required: false` on all; no `fieldsAnyOf`. The `type_fields` check therefore fails only on a malformed value (a seller kind outside the list, a four-letter currency). The prompt lines (`promptHe`) say explicitly that a tabu extract and an inheritance order have no price and no seller, so the model answers null instead of guessing.
*Alternative:* a new `enum` field kind — rejected, the pattern mechanism already exists and is checked by code.

**D4. `proven_by_file_id` on `added_instances` and `retired_documents` entries; one named validator.**
Schema: both entry objects gain `proven_by_file_id: string | null`. `DecisionContext.intake` gains `approvedPropertyFiles: Map<fileId, { documentId, sellerKind: 'private'|'builder'|null }>` built by `buildDecisionContext` from the approved `real_estate` rows and their stored extraction. `validateProvenByFile(entry, what, ctx)` in `decisionSchema.ts` (listed in `docs/pipeline.md`) runs when `evidence` is null and `proven_by_file_id` is set, and throws with a plain reason on every case the spec rejects; it returns an `EvidenceRef` variant `{ file_id }`. `EvidenceRef` becomes a union `{message_id, quote} | {file_id}`; the audit detail and the `apply_additions` / `apply_retirements` step details record whichever was given. The planner prompt's evidence paragraph says when `proven_by_file_id` is allowed (the two consequences only) and that everything else still needs the quote.
*Alternative:* let the planner ask the client for the appendix without creating the item, and create it later from the client's words — rejected, the agent would ask for a paper that is not on the list, and the next cycle would ask again.

**D5. The prompt rule for proven facts.**
Two sentences in the special case, in Hebrew: (1) "עובדה שמופיעה בשורה 'הוכח במסמך שאושר' היא עובדה סגורה — לעולם אל תשאל עליה את הלקוח: מוכר אדם פרטי = נרכש יד שנייה; מוכר קבלן/חברה = נרכש מקבלן; עלות רכישה שהוכחה = אין צורך לברר הצהרה קודמת או נייר נוסף לעלות." (2) "שאל על אופן קבלת הנכס רק כשאין נייר מאושר שמכריע וכשהתשובה עדיין קובעת איזה נייר לבקש." Content analysis of a file that is not approved stays what it is today: a reason to ask for confirmation, never a settled fact.

**D6. Evals.**
`extract_document`: the three Dinovitz contract cases and the tabu case expect the new fields. `generate_message`: one case replays call `1cf945e3` — the contract item approved with a stored verification record (the eval document input gains an optional `verification` object passed through to the row), `verification_results` with the approved contract, the tabu child in `files` as "matches no required document"; expects `follow_up`, `no_list_change: true`, `message_includes_any: ["טאבו"]`, `message_excludes: ["קבלן", "יד שנייה", "הצהרת הון קודמת"]`. A second planner case covers D4: contract item + appendix item from the questionnaire, contract approved with `seller_kind: "private"`; expects `retired_documents: [appendix id]` and `message_excludes: ["נספח"]`.

## Risks / Trade-offs

- [The model misreads the seller kind (a lawyer's firm read as a company)] → the pattern limits the value to two words; the contract hint says a seller company is a construction company or developer; a wrong `builder` only adds an appendix request, which the client can answer "there is none" and the planner retires it on their words as today.
- [An old approved contract has no typed fields] → the line shows ownership only; the planner may still ask about the route for that property. Acceptable; the owner can re-run verification on such items if needed.
- [The fence weakens: a file now changes the list] → only an approved file (code-verified subject, paper, type), only `real_estate`, only two closed consequences, every other case rejected by name. The injection scan and the quarantine still run before verification.
- [Prompt grows] → the special case is rewritten, not appended; the removed "ברר תחילה" procedure roughly offsets the two new rules.
- [`EvidenceRef` union touches the audit and step details] → both already store the ref as JSON; readers that print `quote` must handle the file variant (search for `.quote` on evidence refs in `plan.ts` and the admin trace).

## Migration Plan

- Archive `real-estate-second-hand-contract-only` first (its tasks are complete; the live check is the owner's), so this delta's requirements land on top of its requirement in `document-papers`.
- No database migration. Deploy code only. Items approved before the deploy carry no typed fields (see risks).
- Rollback: revert the commit; stored extraction records with the extra keys are ignored by the old code.
