## Context

See proposal.md for the motivation. Each document type owns its schema, prompt, fields and checks in `documentTypes/<type>.ts`. `pension_provident` and `study_fund` read `fund_name`, `account_number`, `closing_balance`, `total_deposits`, and pass `type_fields` when the fund name and at least one of the two amounts are read. Nothing records whether the certificate is in the file, so a balance-only annual report passes.

A text field may already carry a `pattern` and a `patternHintHe`; `typeFieldsCheck` fails a required field that is null and a text that does not match its pattern. The catalog's `SAVINGS_CERTIFICATE_HINT_HE` is shared by the two fund types and by `life_insurance_savings`.

## Goals / Non-Goals

**Goals:**
- Code, not the model, decides that the certificate is present.
- The rejection note tells the planner exactly what is missing, so the client is asked for the right paper.

**Non-Goals:**
- Changing `life_insurance_savings`.
- Re-judging items approved before the change.
- Changing what the fund-site fetch providers download.

## Decisions

1. **A quoted heading, not a yes/no flag.** New field `tax_certificate_title` (text, required) in both types. The model copies the heading as printed, or null. A pattern on the field requires "אישור מס" and "הצהרת הון" in the quoted text (in that order, any characters between). A boolean was rejected: the model could answer true from the item name; a quote is visible in the trace and checked by code.
2. **Reuse `type_fields`, no new check key.** The field's `required` plus `pattern` rules already give a failing check with a note. The note is the same for a null heading and for a heading with other words: `המסמך אינו כולל את "אישור מס להצהרת הון"`. The pattern case uses the existing `patternHintHe`; the null case needed one small addition, an optional `missingHintHe` on a type field that replaces the generic "השדה … לא נמצא במסמך" note (changed during apply: the first plan was to rely on the field label, which could not give the exact note the spec asks for). Alternative rejected: a new check key — it would change the trace shape and the skipped-checks list for no gain.
3. **Keep the any-of amounts rule.** Certificates differ: some state cumulative deposits, some a balance. Making `total_deposits` required would reject real certificates.
4. **Split the shared hint.** `SAVINGS_CERTIFICATE_HINT_HE` stays as is for life insurance. A new hint for the two fund types states one accepted form (the certificate, alone or inside the annual report) and lists the balance-only report as not accepted. The module prompts carry the same text, as today.
5. **Planner wording.** In `prompt.md` the savings block is split: pension and study fund ask for the certificate only; life insurance keeps the two-forms sentence. No new planner tool or state.
6. **Field order.** `tax_certificate_title` goes first among the type fields, so the trace shows it first and the first failing note is the certificate one.

## Risks / Trade-offs

- [A fund prints the certificate under another heading, with no "הצהרת הון" words] → the file is rejected and the client is asked for the certificate. The trace shows the quoted heading (or "לא נמצא"), so the owner can widen the pattern for a real case.
- [Fund-site fetches (Phoenix, Harel, Altshuler, Migdal, Meitav, Menora) may download a report without the certificate] → those files are now rejected like any other. Each provider's live download must be checked once against the new rule (task 5.2); a provider that fails needs its own follow-up change.
- [The model quotes the heading from the file name or the item name] → the prompt forbids it; an eval case with a balance-only report named "אישור מס להצהרת הון.pdf" guards it.
- [Stored eval answers lack the new field] → the affected extraction cases need a fresh model run, not only a re-judge.

## Migration Plan

Code and prompt only. Deploy as usual; rollback is a revert. Old verification records keep their shape and their verdict.

## Open Questions

- Should the affected client's approved pension items be reopened by a script, or by hand in the workspace? By hand is assumed.
