## 1. Template row

- [x] 1.1 Add `migrations/072_intro_template_v3.sql`: insert `capital_declaration_intro_v3` (SID `HXb58466a274518ac48b8092d6cb82477f`, body verbatim, 3 variables, `declaration_of_capital`, purpose `intro`, buttons documented in a comment) and delete `capital_declaration_intro_v2`; apply locally and confirm one `intro` row.

## 2. Decline recognition

- [x] 2.1 `clientDeclineRules.ts`: `DECLINE_BUTTON_TEXT` = "העברה ישירות למשרד" (comment names v3); `tests/clientDecline.test.ts` still passes (it uses the constant).
- [x] 2.2 `prompt.md` rule 4: the example of the decline button words is the new text.

## 3. Fixtures and docs

- [x] 3.1 `evals/cases/generate_message.json`: the intro fixture body is the v3 body.
- [x] 3.2 `docs/agents.md`: intro is v3 (migration 072), the two button texts updated.
- [x] 3.3 `npm run typecheck`, `node --test tests/clientDecline.test.ts`, commit, push.
