## Why

When the planner marks a document as collected, its reply is always thrown away: the code verifies the collected documents first and runs the planner again to write the real reply (`verification-reply`). The planner still writes a full message in that first call, because its contract says every `follow_up` answer must carry one. That message costs output tokens and time on every file turn (about 26 s and a 2.7 KB answer in the last local run) and is never used. The model should not write text it cannot send.

## What Changes

- The planner's answer gets a third decision value, `collect`. The model MUST choose it whenever its answer ties a file to a list item or marks an item as collected, and a `collect` answer carries no message, no send time, no attestation request and no document-fetch action.
- A `follow_up` answer MUST NOT tie a file or mark an item as collected; the gate rejects the mismatch either way and asks for one correction, as it does for other contract violations.
- The follow-up cycle after verification cannot choose `collect`: its request schema does not offer the value, so the model cannot loop.
- After a `collect` answer the code always verifies the collected documents and runs the follow-up cycle, also when the code refused every tie and nothing reached verification, so the turn still ends with one reply.
- The trace step recorded when the reply is deferred keeps its key and gets a label that no longer speaks of a withheld draft.
- The evals harness learns the `collect` decision: the two cases that tie files to new items expect `collect`, and new cases cover a file paired with an existing item and the follow-up cycle that must reply.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `verification-reply`: the collecting cycle gives no message at all instead of a withheld draft; the follow-up cycle also runs when the batch is empty; message-bound actions are absent from a collecting answer rather than ignored.

## Impact

- `src/agents/declarationOfCapital/decisionSchema.ts`, `decide.ts`: the `collect` value, the gate rules that pair it with file ties, the per-context schema that drops it for the follow-up cycle, the correction text.
- `src/agents/declarationOfCapital/prompt.md`, `prompt.ts`: the rule for the model, and the follow-up section that is rendered even when no document was verified.
- `src/agents/declarationOfCapital/plan.ts`: the collecting branch keys on the decision value, runs the follow-up cycle unconditionally after it, and records the deferred-reply step.
- `web/src/i18n.tsx`: the step label.
- `evals/stages.ts`, `evals/cases/generate_message.json`: the new decision value in the judge and the cases.
- No migration. Old trace rows keep their step key.
