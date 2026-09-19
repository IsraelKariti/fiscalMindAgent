## Why

`reply-after-full-turn` made the planner wait for all files of a client turn, but the agent still writes a reply too early in one case: when the planning cycle marks documents as collected. That cycle schedules its draft first and only then starts document verification in the background (`plan.ts`, fire-and-forget `verifyCollectedDocument`). Every verdict then runs its own extra planning cycle (`replanAfterVerification`), which replaces the draft. Seen in the live test of 2026-09-19: one turn with three files produced a first draft at 52 s and a second one at 73 s, after `extract_document`. A turn that collects N documents produces up to N+1 drafts, and the first draft (written before any verdict, often "thank you, received") can be sent before verification reopens the document and asks the client to send it again.

## What Changes

- A planning cycle that marks documents as collected **does not schedule its draft**. It applies its state changes as today, then runs the verification of every just-collected document, and only then runs **one** follow-up planning cycle that writes the reply with all verdicts in view.
- Verification no longer triggers a planning cycle by itself. The caller that started a batch of verifications runs one follow-up cycle after the whole batch.
- The tax-authority / provider fetch delivery path follows the same rule: several fetched documents are verified as one batch, followed by one planning cycle (today: one per document).
- The follow-up cycle is told which verdicts just landed: a new prompt block lists, for every document of the batch, the file the client just sent, the outcome, and the failure reasons. Without it the model only sees the old note "a previous file failed verification" on the row and cannot tell that the rejected file is the one from this turn (live test 2026-09-19: two just-rejected files were described as "received and passed on for checking"). The system prompt rule that today depends on "the last message in the thread is yours" is rewritten around this block, because the last message is now the client's.
- The withheld draft is never stored as an outbound draft, so it does not appear as a superseded message in the timeline and is not shown to the model as an unsent draft.
- The workspace keeps showing the client as "drafting" until the follow-up cycle has written the reply.
- A verification that fails with an error (or is skipped because of the kill switch) does not block the reply: the follow-up cycle still runs and reports what is known.
- Unchanged: what verification checks, its verdicts (approved / reopened / stalled), the accountant notifications, the rule that a follow-up cycle cannot collect files (no loop), and the audit step `planner.rerun_after_verification` (now once per batch).

## Capabilities

### New Capabilities
- `verification-reply`: how the agent's reply relates to document verification — no reply is drafted between collecting a document and its verdict, and one follow-up planning cycle runs per verification batch.

### Modified Capabilities

None. `inbound-turn` covers when the planner starts after inbound activity; this change covers what happens inside the cycle after it collected documents.

## Impact

- `src/agents/declarationOfCapital/plan.ts` — withhold the draft when documents were collected; await the verification batch; run the follow-up cycle.
- `src/agents/declarationOfCapital/verifyDocument.ts` — `verifyCollectedDocument` returns its outcome and stops re-planning; new batch helper that verifies a list and re-plans once.
- `src/agents/declarationOfCapital/taxFetch/deliver.ts` — use the batch helper.
- `src/agents/declarationOfCapital/prompt.ts`, `prompt.md`, `src/agents/types.ts` — the verification-results block and its instruction; the results travel in `PlanHints`.
- `evals/stages.ts`, `evals/cases/generate_message.json` — case input for the block, message substring asserts, one new case.
- `src/audit/audit.ts`, `web/src/i18n.tsx` — new step for a withheld draft; `planner.rerun_after_verification` detail lists all documents of the batch.
- `src/gemini/llmStages.ts` / `#/llm-stages` description of `generate_message` and `extract_document` — order of the stages.
- `docs/agents.md` — verification pipeline section.
- `tests/`, `evals/` — unit tests for the withhold rule; no eval case changes expected.
- No migration, no API change. One planner call is still spent on the collecting cycle (its message text is discarded); total planner calls per collecting turn drop from 1+N to 2.
- The client lock is held while verification runs (tens of seconds per document). Inbound messages during that time are handled by the `inbound-turn` dirty flag.
