## Context

The planner answers with flat tool calls (`decisionTools.ts`); `assembleDecision` rebuilds the decision form and `normalizeDecision` (`decisionSchema.ts`) validates it. Today a list item is created by `resolve_document` (required) + `add_instance`, or by `add_instance` alone under a settled row, and both need a verbatim client quote (`validateEvidence` against `intake.inboundTexts`). The open change `real-estate-goal-driven-clarification` added `proven_by_file_id` to `add_instance` / `retire_document`, validated by `validateProvenByFile` against a code-built pool (`approvedPropertyFilesOf`) and stored as `{ source: 'approved_file', … }` in `client_documents.resolution_evidence`. Files the planner names for a new row are attached by `assignFilesToNewRows` (`fileTies.ts`), with the company check `companyRefusal(file, row, hasEvidence=true)`. The per-company / per-employer split (`companySplit.ts`, `splitChildNames.ts`) already builds item names "<name> — <company nameHe> — <employer>" from the institutions table and the cleaned employer. Identity matching of a document's parties against the client and the spouse on file lives in `spouseIdentity.ts` (`namesLooselyMatch`, `readSpouse`). The file analysis (`analyzeFileRules.ts`) stores `document_type`, `issuer_name`, `holdings[{product, holder_name, account_number}]`, `holdings_partial`, `employer_name`, `confidence`, `matched_document_id`, `legible`, `injection_suspected`.

## Goals / Non-Goals

**Goals:**
- One pure, testable rule that says whether a stored file proves its own item, computed by code from stored data only.
- Reuse `proven_by_file_id` and the existing evidence/validation shape instead of a new tool.
- The created item behaves exactly like one created on a quote: same tie path, same verification, same follow-up reply, same name pattern as the split.

**Non-Goals:**
- No change to what the classifier reports or to `validate_classification`.
- No change to the quote route, the split, or the property-paper route.
- No new document types, no catalog text change (the Mor tax approval question is out of scope; the user decided the approval is acceptable).
- No automatic item for a file whose holder is hidden or a third person — those still go through the question.

## Decisions

1. **Pool built by code, not judged by the model.** `selfEvidentFiles.ts` (new, pure): `selfEvidentFilesOf(files, { clientName, spouse }, institutions)` → `Map<fileId, SelfEvidentFile { typeKey, institutionKey, issuer, holders, matchedPerson: 'client' | 'spouse', employer | null }>`. Conditions: `isInstitutionBound(type)`, `isVerifiedLegibleFile`, `!isSplitParent`, `client_document_id === null`, `matched_document_id === null`, `confidence === 'high'`, `identifyInstitution(issuer_name)` non-null, `holdings.length ≥ 1`, `!holdings_partial`, every `holder_name` non-null and sharing at least two name tokens (`sharedNameTokens`, first and last name) with `clientName` or with `spouse.name`, the closer one winning and the client on a tie (a file with one client holder and one stranger is not self-evident). Alternative considered: let the classifier emit `holder_is_client` — rejected, the model must not decide identity; code already owns identity (spouse-identity spec).
   `plan.ts` → `buildIntakeState` adds `intake.selfEvidentFiles` next to `approvedPropertyFiles`.

2. **Cite with `proven_by_file_id` on both tools.** `resolve_document` gains `proven_by_file_id: z.string()` ('' = none; keep the plain-string rule for the Anthropic union budget). `validateResolutions`: when `resolution === 'required'`, `evidence` empty and `proven_by_file_id` set → `validateProvenByFile(..., { kind: 'resolve', row, instances })`. `validateProvenByFile` first looks in `selfEvidentFiles`: the file's `typeKey` must equal the row's / anchor's `typeKey`, exactly one instance, else a named error ("file … is not self-evident / is of another type / proves one item only; quote the client instead"); otherwise it falls through to the property-paper rules unchanged. New evidence type `SelfEvidentFileEvidence { source: 'self_evident_file'; file_id; issuer; holders: string[]; matched: 'client'|'spouse'; employer?: string }`, added to `EvidenceRef` and to `ResolutionEvidence` (db/types.ts, JSON column, no migration). A quote still wins when both are given. `not_required` never accepts a file.

3. **Code finishes the name and forces the tie.** In `plan.ts`, when a resolution/addition carries self-evident evidence: the instance name is passed through `companySuffixedName` (institution nameHe) and, for employer-bound types, `employerSuffixedName` (cleaned employer) — same helpers as the split, so the "names no company" matching rule never applies to the new row; the cited file id is unioned into `fileIds` before `assignFilesToNewRows`, which then ties it (company check passes: identified same company). Alternative considered: rename at split time — rejected, split explicitly skips items created in the same cycle.

4. **Decision kind.** No new decision: a cycle that ties a file is already `collect` with no message (collect-decision spec), and the follow-up cycle writes the reply after verification. The planner prompt just says: for a self-evident file, cite it and conclude `collect`; do not ask. Other unmatched (non-self-evident) files of the same turn are asked about in the follow-up reply, which already receives the unmatched files list.

5. **Prompt surface.** `prompt.ts` file line: after "matches no required document", append `self-evident: in the client's name — may be added without asking (proven_by_file_id)` (or "in the spouse's name"), rendered only when the pool holds the file (plan passes the pool into the prompt input). `prompt.md` § "קובץ שאינו שייך לרשימה": split into two cases — with the marker: `resolve_document` (required, `proven_by_file_id`, `evidence_*` "") + one `add_instance` (`proven_by_file_id`, `file_ids=[file]`, name with the company), or `add_instance` alone under a settled row; `collect`; never ask. Without the marker: unchanged. The `add_instance` description and the `proven_by_file_id` description mention both uses.

6. **Trace / UI / audit.** `applyStepDetails.ts` shows the created item with "created from a file in the client's name — issuer, holder". `DocumentsCard.tsx` adds the `self_evident_file` label (Hebrew: "נוצר מקובץ על שם הלקוח — <issuer>") next to the existing `approved_file` branch; `web/src/api.ts` union gains the source. Audit: the existing item-creation audit row carries the evidence object (no new action name).

## Risks / Trade-offs

- [A relative with the same surname] → the holder must share first AND last name (two tokens, `sharedNameTokens` in spouseIdentity.ts) with the client or the spouse on file — stricter than the one-token identity rule, so "רונית ישראלי" is not "ישראל ישראלי"; the file must also be high confidence and from a recognised institution; the later extraction identity check still compares the printed id/name against the client and spouse and rejects a stranger, leaving the item waiting with reasons.
- [A self-evident file for a row the client explicitly said "I don't have"] → the file wins; the follow-up reply states that the fund was added from the report, so the client can object (the reply already reports verification results per item).
- [Planner cites the file but also lists two instances] → rejected by the gate with a correction suffix; one file, one item.
- [`resolve_document` schema change] → `tests/decisionTools.test.ts` shape test and `tests/anthropicSchema.test.ts` union budget must pass; plain string, not nullable.
- [Prompt change shifts other planner behaviour] → run `/run-evals` for `generate_message` before and after; add the two new cases first.

## Migration Plan

No migration. Deploy code only; existing rows and evidence are untouched. Rollback = revert the commit; stored `self_evident_file` evidence would then render as an unknown source (UI falls back to no label).

## Open Questions

None that change the spec. Whether a partial holdings list (`holdings_partial`) should ever count can be decided later; the design excludes it.
