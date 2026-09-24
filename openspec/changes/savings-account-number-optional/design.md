## Context

See proposal.md - Why. Today:

- `catalog.ts` holds one shared `SAVINGS_FIELDS` list used by `pension_provident`, `study_fund` and `life_insurance_savings`; its `account_number` entry is `required: true` with the prompt line "מספר החשבון או מספר הפוליסה של העמית בקופה, כפי שמודפס."
- `runChecks` (`verifyChecks.ts`) fails `type_fields` on any required field that is null. The observed text already renders a null as "לא נמצא", so no rendering change is needed.
- The savings `analysisHintHe` says the dedicated certificate shows "מספר חשבון, מספר תיק ניכויים" — that describes the office's samples (Altshuler, Harel, Meitav), not Menora's, whose certificate prints only the withholding-file number.
- The evals `menora_pension_2025.pdf` is a synthetic file that does print a member number (case `ext_06` expects `4401-778210`), so the harness never saw the real shape.
- `docs/agents.md` and the Notion "Type fields" child pages list the field as required.

## Goals / Non-Goals

**Goals:**

- A savings document that carries the holder identity, fund name and at least one of the two amounts passes `type_fields` with or without a printed account number.
- The model is told the number may be missing and is warned off the withholding-file number, so it does not invent one.
- Bank and securities documents are untouched.

**Non-Goals:**

- Reading the withholding-file number into its own field. It is the employer's tax file, not a client asset identifier.
- Asking the client for the missing account number in the conversation. The declaration does not need it.
- Rewriting stored verification records or auto-retrying documents that already failed.

## Decisions

1. **Flip `required` on the shared list, not per type.** All three savings types get the same accepted forms (dedicated certificate or last annual-report page), and the annual-report page of any fund may omit the member number. One flag change in `SAVINGS_FIELDS` keeps the three in step, as the spec has always described them as "the same list for the three". Alternative: make only pension optional — rejected, it splits a list the spec and the tests treat as one, for no proven benefit.

2. **Sharpen the prompt line, do not add a field.** The `promptHe` becomes: the member/account/policy number as printed; `null` when the document does not print one; "מספר תיק ניכויים" is the employer's withholding file and is not the account number. Alternative: add a `withholding_file_number` field — rejected (Non-Goals).

3. **Prove it with a synthetic PDF in the real shape.** A new eval file (`menora_pension_no_member_number_2025.pdf`, via the `add-eval-case` skill) mirrors the real report: annual-report page with balance table, certificate page with name, id, fund name, "מספר תיק ניכויים" and the deposits table, no member number. The case expects `account_number: null` and `verdict.passed: true`. Alternative: edit `menora_pension_2025.pdf` — rejected, `ext_06` and `ext_16` depend on its member number, and the regen script rewrites every file (see memory: restore unchanged files before committing).

4. **Unit test at the checks layer.** `tests/verifyChecks.test.ts` gets one case: a savings answer with `account_number: null` and `closing_balance` set passes `type_fields` with "מספר חשבון: לא נמצא" in the observed text; the bank context with a null account still fails. `tests/capitalCatalog.test.ts` asserts the `required` flags of the savings list explicitly so a later edit cannot silently flip it back.

## Risks / Trade-offs

- [A savings document with no number and no fund name could pass on amounts alone] → `fund_name` stays required, and `subject` / `id_matches_client` / `amounts` checks still gate the document.
- [Duplicate detection between two funds of the same company loses the account number] → Tie-up already keys on fund name, holder and employer (per-company / employer split); the account number was never the sole key.
- [The model keeps returning null where a number IS printed] → The prompt line now says explicitly where to look (member number on the report header or certificate); the evals with printed numbers (`ext_04`, `ext_06`, `ext_07`, `ext_12`, `ext_15`) still judge the value.

## Migration Plan

Code-only. Deploy as usual (push to master → sandbox; manual promotion → prod). No migration, no data rewrite. The failed document on the local test client ("ניב", spouse's Menora report) re-verifies on the next agent cycle or a manual re-run.
