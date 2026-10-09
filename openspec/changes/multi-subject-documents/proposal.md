# Proposal: multi-subject-documents

## Why

The whole verification path assumes one person per document: the extraction model returns one `subject_name` and one `subject_id_number`, and the code gate decides whether that one person is the client, the spouse, or nobody. Many declaration documents name several people: a purchase contract (buyers and sellers), a joint bank account, a shared mortgage, an inheritance order with several heirs, a home policy with two insured. On 2026-10-07 a four-party purchase contract was verified for client "ניב": the model packed all four names into `subject_name` and picked one of the printed ids, the gate adopted that id as the spouse's, and the client record now holds the spouse name "מקמל קתי פנינה, מקמל חזי, תמיר מיכל, תמיר ניב" with an id that may belong to a seller. The design is wrong at its root, not at one check.

## What Changes

- **BREAKING (extraction contract)**: the extraction answer no longer has `subject_name` and `subject_id_number`. It has `parties`: a list of the people the document names, each with their own printed name, their own printed id (or none) and a role: `owner` (the person who holds the asset or owes the liability this document proves: the buyer, the account holder, the member, the insured, the borrower, the heir), `counterparty` (the other side: the seller, the lending bank, the builder, the insurer's agent) or `other` (witness, lawyer, guarantor). The prompt tells the model to keep each id next to its own name and never to join names.
- The `verify_extraction` gate judges each `owner` party on its own with the existing identity rule (client, spouse, adoptable stranger, nobody) and ignores the other roles. The document belongs to the household when at least one owner is the client or the spouse. Other owners are co-owners: listed in the trace, never a reason to reject.
- The id checksum runs on every owner's printed id, not on one picked id.
- A spouse is adopted from a document with one owner as today. From a document with several owners, a spouse is adopted only when a spouse name is already on file and exactly one owner matches it. The adopted name is always that one party's printed name, never a joined string.
- The trace row shows every party with role and masked id, says whom the document was accepted for (client, spouse or both), and lists co-owners in a new informational check `co_owners`.
- Evals: the extraction judge expects owner ids per party instead of one subject id, and three cases are added (a four-party contract, a joint bank account, a contract that prints only the sellers' ids).
- The classifier (file_classification) keeps its single descriptive `subject_name`: it is prose for the planner's file line and decides nothing in code.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `document-extraction`: the common fields change — `parties` with name, id and role replaces the subject name and the subject id; a new requirement defines the party list and its roles.
- `spouse-identity`: the identity rule of verification is applied per owner party; the document passes when any owner is the client or the spouse; co-owners are allowed; adoption from a multi-owner document requires a spouse name on file that one owner matches; the name-only rule is per party.
- `code-gates`: the `verify_extraction` entries `subject`, `id_checksum`, `id_matches_client`, `spouse_adopted` and `client_id_on_file` are defined over the owner parties; a new `co_owners` entry is reported.

## Impact

- Extraction: `src/agents/declarationOfCapital/verifyChecks.ts` (schema, prompt, `runChecks`), `extractionCall.ts` if it names the fields.
- Identity: `src/agents/declarationOfCapital/spouseIdentity.ts` (per-party rule, document-level rule, adoption choice), `verifyDocument.ts` (detail row: `parties`, `subject_matched` gains `both`).
- Evals: `evals/stages.ts` (case shape and judge), `evals/cases/extract_document.json` (every case that states `subject_id_number`), one new synthetic PDF for the contract and one for the joint account (`evals/make-files.ts`).
- Web: `web/src/i18n.tsx` (labels for `co_owners`, `subject_matched` = both, `parties`), the step modal that renders `verify_extraction` details.
- Tests: `tests/verifyChecks.test.ts`, `tests/spouseIdentity.test.ts`.
- Docs: `docs/agents.md`, `docs/pipeline.md` (new named functions), the Notion page "verify_extraction" under Code gates, and the "Document Approval Flow" artifact (chart B).
- Data: verification records and trace rows written before this change keep the old shape; readers tolerate both. The local test client "ניב" must have its wrong spouse record cleared by hand after deploy.
- No DB migration.
