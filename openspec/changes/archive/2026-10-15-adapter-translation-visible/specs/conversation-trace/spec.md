## ADDED Requirements

### Requirement: The call record keeps the request as the provider received it
Every LLM call record SHALL store, alongside the request as the code declared it, the parts of the request that the provider adapter changed before sending: the answer schema as sent (for a stage that answers with one JSON object) or the tool set as sent (for a tool-call stage, each tool with its strict flag), and the names of the declared request fields the adapter left out (for example `temperature`). The record SHALL name the provider that received the request. A provider whose adapter sends the request exactly as declared (Gemini today) SHALL record no sent copy. The sent copy SHALL be served only where the declared request is served today (the admin call endpoints); an accountant's session SHALL NOT receive it.

#### Scenario: Anthropic call with a nullable field
- **WHEN** the injection screen runs on an Anthropic model and the declared schema has `evidence: string or null`, required
- **THEN** the call record's sent schema shows `evidence` as a plain string that is not in `required`, names Anthropic as the provider, and lists `temperature` as left out

#### Scenario: OpenAI planner call
- **WHEN** the planner runs on an OpenAI model
- **THEN** the call record's sent tool set shows every tool with `strict: true` and `additionalProperties: false`, and lists `temperature` as left out

#### Scenario: Gemini call
- **WHEN** any stage runs on a Gemini model
- **THEN** the call record carries no sent copy, and the modal treats the declared request as the sent one

### Requirement: The call detail modal shows the schema as sent
The call detail modal's answer-schema pane SHALL show the schema the provider received, and its heading SHALL say which provider received it. When the sent schema differs from the declared one, the modal SHALL also offer the declared schema in a collapsed section labelled as the version in the code, so both can be read without leaving the modal. For a tool-call stage the tools pane SHALL behave the same way: the tools as sent, the declared tools collapsed when they differ. A call recorded before the sent copy existed SHALL show the declared schema with a note that the sent version was not recorded. "Copy details" SHALL include the sent copy next to the declared request, so the pasted text shows both.

#### Scenario: Admin opens the injection screen call from 2026-10-14
- **WHEN** an admin opens an Anthropic injection-screen call made after this change
- **THEN** the schema pane heading names Anthropic, shows `"evidence": { "type": "string" }` with `required: ["suspected_injection"]`, and the collapsed section shows the declared `["string", "null"]` version with both fields required

#### Scenario: Old call
- **WHEN** an admin opens a call recorded before this change
- **THEN** the schema pane shows the declared schema and a note that the sent version was not recorded, with no empty section

#### Scenario: Copy details
- **WHEN** the admin presses "copy details" on a call that carries a sent copy
- **THEN** the pasted JSON contains the sent schema or tools and the omitted fields next to the declared request

### Requirement: Adapter translations are code steps in the trace
For every LLM call that a provider adapter translated, the trace SHALL show two code-step rows under the code-steps toggle: a request-translation step recorded before the call, and an answer-restore step recorded after it, each attributed to the client of the call and each opening the step detail modal like every other code step. A call whose adapter sent the request exactly as declared and changed nothing in the answer SHALL record no such steps.

The request-translation step SHALL list, as labelled rows: the provider, the stage, the fields that lost their null option (by path), the fields removed from the required list, the schema keywords stripped (by keyword and path), the request fields left out, and whether the tools were marked strict. A translation that changed nothing in the schema but left out request fields SHALL still be recorded and SHALL say the schema is unchanged.

The answer-restore step SHALL list the nullable fields the adapter filled with null because the model left them out (by path), or say that nothing was filled. The step SHALL NOT alter the answer; it reports what the adapter did.

Both steps carry no result badge and no checks; they are informational and never fail a call.

#### Scenario: Anthropic injection screen
- **WHEN** the injection screen runs on an Anthropic model and the model leaves `evidence` out
- **THEN** the trace shows, in time order, the translation step ("null removed: evidence; removed from required: evidence; left out: temperature"), the `Injection Screen` call chip, the restore step ("filled with null: evidence"), then the `validate_injection_scan` gate row

#### Scenario: Anthropic answer that holds text in a nullable field
- **WHEN** the model writes the text `"null"` into `evidence` instead of leaving the field out
- **THEN** the restore step says nothing was filled, and the following gate row shows the failed check as today

#### Scenario: OpenAI planner
- **WHEN** the planner runs on an OpenAI model
- **THEN** the translation step says the tools were marked strict and `temperature` was left out, and the restore step is not recorded because the adapter changes nothing in the answer

#### Scenario: Gemini
- **WHEN** any stage runs on a Gemini model
- **THEN** no translation or restore step is recorded

#### Scenario: Accountant
- **WHEN** an accountant opens their own client's conversation tab
- **THEN** the two steps are not shown, like every other code step
