## 1. Email text

- [x] 1.1 In `src/agents/declarationOfCapital/teamQuestions.ts`, rewrite the body of `teamQuestionEmail` to the generic text: greeting, "the agent has a question about client <name> that it cannot answer itself", "the question and the answer box are in the questions tab of the client's page in the app", "a reply to this email is not read", the app link. Drop the question and reason lines and the `reason` branch. Verify with `npm run typecheck`.

## 2. Tests

- [x] 2.1 In `tests/teamQuestions.test.ts`, replace the two `teamQuestionEmail` tests with one that asserts the subject and body name the client, the body mentions the questions tab, the app link and the "reply not read" line, and the body contains neither the question text nor the reason. Verify with `npm test -- tests/teamQuestions.test.ts`.

## 3. Docs

- [x] 3.1 In `docs/agents.md`, update the team-questions paragraph: the addressee gets one generic email that points to the questions tab and carries no question text. Verify by reading the paragraph.

## 4. Commit

- [x] 4.1 Pull with rebase, run `npm run typecheck` and `npm test`, commit and push per the repo Git workflow.
