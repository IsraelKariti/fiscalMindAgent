## Why

The owner rewrote the WhatsApp opening message in a warmer tone (secure, step by step, at the client's pace; handing the documents to the office is "no problem") and gave the two quick-reply buttons neutral texts: "נאסוף כאן בווצאפ" and "העברה ישירות למשרד". Twilio/Meta approved it on 2026-11-03 as `capital_declaration_intro_v3` (SID `HXb58466a274518ac48b8092d6cb82477f`). The agent still sends v2 and still recognises the v2 button text.

## What Changes

- Seed `capital_declaration_intro_v3` (same three variables, purpose `intro`) and delete `capital_declaration_intro_v2`, so the planner is only ever offered v3.
- The decline button's recognised text becomes "העברה ישירות למשרד" (the button id `decline` is unchanged and remains the primary match).
- The planner prompt's example of the decline button words, the eval intro fixture and `docs/agents.md` follow the new texts.

## Capabilities

### Modified Capabilities
- `whatsapp-templates`: the single intro template is v3 with the new body and button texts.
- `client-decline`: the button-tap scenario names the new button text.

## Impact

- `migrations/072_intro_template_v3.sql` (new), `clientDeclineRules.ts` (one constant), `prompt.md` rule 4, `evals/cases/generate_message.json` intro fixture body, `docs/agents.md`.
- Production needs migration 072 (runs on deploy). No API or UI change.
