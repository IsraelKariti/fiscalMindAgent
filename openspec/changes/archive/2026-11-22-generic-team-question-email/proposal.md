## Why

The email that tells a team member about an agent question carries the full question and the agent's reason. That invites the reader to answer by replying to the email, which goes to a no-reply address and never reaches the agent. The answer must be typed in the app's questions tab, so the email should only point there.

## What Changes

- The team-question email no longer carries the question text or the agent's reason. It says only that the agent has a question about the named client and that the question and the answer box are in the app's questions tab.
- The email says plainly that a reply to the email is not read.
- The subject stays as it is (it names the client). The link to the app stays.
- The trace step of the email keeps recording the recipient, subject and body as before; the body is just the generic one.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `team-questions`: the requirement "The question is addressed to the client's team member" changes what the email carries: the client's name and a link to the app, not the question and the reason.

## Impact

- `src/agents/declarationOfCapital/teamQuestions.ts`: `teamQuestionEmail` body text.
- `tests/teamQuestions.test.ts`: the two email tests.
- `docs/agents.md`: the team-questions paragraph.
- No schema, API, database or UI change.
