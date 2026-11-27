## Why

Once every item of the capital-declaration list is settled, the agent sends a long closing summary (the attestation request): it lists every document that was received and verified, every item the client said they do not have, and asks the client to confirm the list is complete. The client already knows what they sent, so the recap of received documents is noise on a phone screen, and the one thing the message is for — the client's own words that nothing is missing — is buried at the end. After the client confirms, nothing is sent back: the conversation ends in silence (today's goal-complete path only emails the accountant).

## What Changes

- The closing summary becomes short: a thank-you, the items the client said they **do not have** (one line each), and one explicit yes/no question — is the list complete. It no longer recaps the documents that were received and verified. When the client declared no "do not have" items, the message is only the thank-you and the question.
- The attestation itself stays: the goal still completes only when the client confirms the summary in their own words (nothing changes in the gate or the evidence rules).
- After the confirmation lands and the goal completes, the agent sends one short closing message to the client: thanks, and the accountant will contact them if anything else is needed. The text is fixed (code-authored, Hebrew, with the client's first name and the accountant's name), sent only on WhatsApp inside an open 24h window, and shown in the timeline like any other outbound message.
- The manual completion path (accountant settles the last row from the workspace) sends the same closing message when the window is open, and skips it silently when it is closed.

## Capabilities

### New Capabilities
- `declaration-completion`: what the client hears when the capital-declaration list is settled — the content of the closing summary, the confirmation that completes the goal, and the closing message after it.

### Modified Capabilities
- (none — `verification-reply`, `planner-thread-context`, `code-gates` and `injection-defense` only reference the attestation request and its confirmation window, which keep their behavior)

## Impact

- `src/agents/declarationOfCapital/prompt.md` (action 3 wording, the "long exception" rules for the summary), `prompt.ts` (INTAKE STATUS line).
- `src/agents/declarationOfCapital/plan.ts` (`completeGoalIfDone` sends the closing message), `router.ts` (manual completion path), a new small module for the closing text, `docs/pipeline.md` + `docs/agents.md` (the "No closing message is sent to the client" sentence becomes wrong).
- `evals/cases/generate_message.json` (`dec_06`: the summary must not recap received documents), `tests/` (closing message unit test).
- No migration, no schema change, no API change.
