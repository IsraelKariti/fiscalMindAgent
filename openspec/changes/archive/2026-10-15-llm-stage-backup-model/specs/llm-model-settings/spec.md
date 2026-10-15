## Purpose

Which language model each LLM stage of the pipeline runs on: the admin-chosen primary model per stage, an optional backup model on another provider, and when a call falls back from the primary to the backup.

## ADDED Requirements

### Requirement: Each LLM stage has a primary model and an optional backup model
Every LLM stage (today: the conversation planner, the questionnaire mapping, the injection screen, file splitting, file classification and document extraction) SHALL run on one primary model, chosen by an admin per stage; a stage with no chosen model SHALL follow the platform-wide model, and that one the server's default. Each stage MAY also have one backup model. The backup model MUST be served by a different provider (Gemini, OpenAI or Anthropic) than the stage's primary model; a backup from the same provider SHALL be refused. A stage with no backup SHALL behave as today: when the primary model fails, the stage fails. Both settings SHALL apply to every accountant and every client, and a change SHALL take effect from the next call without a restart. Only models whose provider the deployment can call (its API key is set) SHALL be offered or accepted, for the primary and for the backup alike.

#### Scenario: Backup from another provider accepted
- **WHEN** the planner stage runs on a Gemini model and an admin sets its backup to an Anthropic model
- **THEN** the setting is saved and the next planner call that the Gemini model does not answer runs on the Anthropic model

#### Scenario: Backup from the same provider refused
- **WHEN** the planner stage runs on a Gemini model and an admin tries to set its backup to another Gemini model
- **THEN** the save is refused with an error saying the backup must be from a different provider, and the stage keeps its previous backup

#### Scenario: Primary change that collides with the backup refused
- **WHEN** a stage has an Anthropic backup and an admin tries to change its primary (or the platform-wide model that this stage follows) to an Anthropic model
- **THEN** the save is refused with an error naming the stage and saying the primary and the backup would share a provider; the admin changes or clears the backup first

#### Scenario: Backup cleared
- **WHEN** an admin sets a stage's backup to "none"
- **THEN** the stage has no backup and a failed primary call fails the stage as before

#### Scenario: Backup whose provider became unavailable
- **WHEN** a stage's saved backup is an OpenAI model and the deployment no longer has an OpenAI key
- **THEN** the stage behaves as if it had no backup, and the settings show the backup as "none"

### Requirement: A call falls back to the backup when the primary does not answer
When a stage has a backup model, a call on its primary model SHALL get one attempt and, on a transient failure (rate limit, server error, overload, timeout or network failure), one retry; no more. When that retry fails too, or when the provider rejects the request outright with an API error, the system SHALL send the same request (same instructions, same contents, same answer schema or tools, same temperature) to the backup model and SHALL use the backup's answer exactly as it would have used the primary's: the same code gate checks it, the same usage accounting applies, with the backup model and its provider recorded as the model that served the call. The backup call SHALL get the full retry loop of a normal call (five attempts today). If the backup fails too, the stage fails with the backup's error. A stage with no backup SHALL keep the full retry loop on its primary, as today.

The system SHALL NOT fall back when: the stage has no usable backup; the call was refused by the daily spend cap (the budget stop is not a provider failure); the primary answered but with an empty or refused answer (the model did answer); or the caller pinned the model explicitly (the evals harness), in which case the pinned model is the only one tried.

#### Scenario: Primary times out twice, backup answers
- **WHEN** a file-classification call on the primary Gemini model times out on its first attempt and again on its one retry, and the stage's backup is an OpenAI model
- **THEN** no third attempt goes to Gemini; the same file and prompt are sent to the OpenAI model, its answer goes through the classification gate, and the call is accounted to the OpenAI model

#### Scenario: Primary recovers on its retry
- **WHEN** a call on the primary fails once with a 503 and the one retry succeeds
- **THEN** the primary's answer is used and the backup is not called

#### Scenario: No backup keeps the full retry loop
- **WHEN** a stage has no backup and its primary fails with a 503
- **THEN** the primary is retried up to the full attempt count as today before the stage fails

#### Scenario: Primary rejects the request
- **WHEN** the primary provider answers an extraction call with an API error (for example 400 or 401) and a backup is set
- **THEN** the request is sent once to the backup model and its answer is used

#### Scenario: Both fail
- **WHEN** the primary and then the backup both fail
- **THEN** the stage fails with the backup's error, and both failures are recorded

#### Scenario: Spend cap reached
- **WHEN** the daily spend cap refuses a call before it is sent and the stage has a backup
- **THEN** no call is sent to either model and the refusal stands

#### Scenario: Harness pins a model
- **WHEN** the evals harness runs a stage with an explicit model
- **THEN** only that model is tried, whatever backup the admin set

#### Scenario: Planner on OpenAI falls back mid-continuation
- **WHEN** the planner's primary is an OpenAI model whose continuation turns fail before the closing tool call and the backup is a Gemini model
- **THEN** the whole planner request is sent fresh to the Gemini model and only the Gemini answer's tool calls reach the gate (no tool call of the failed OpenAI turns is kept)

### Requirement: A fallback is visible in the records
The failed primary call and the backup call SHALL each be recorded as their own LLM call row (the primary with its error, the backup with its answer), so the admin call browser and the client's trace show both, in order. For a call made for a client, the trace SHALL also carry one code step between the two call rows, named as a model fallback, stating the stage, the primary model and its provider, the reason the primary failed (the status, "timeout" or "network", with the error text), and the backup model and its provider. The step SHALL follow the existing trace rules: visible to admins only, with its own step link and copyable details. The server log SHALL also note every fallback at warning level.

#### Scenario: Trace after a fallback
- **WHEN** an admin opens, with the LLM calls and code steps toggles on, the trace of a client whose planner call fell back from Gemini to Claude
- **THEN** the timeline shows the failed Gemini call row (status error), then the fallback step naming both models and the reason, then the Claude call row with the answer

#### Scenario: Accountant view
- **WHEN** an accountant views the same conversation
- **THEN** no call row and no fallback step is shown, as for every trace row today

### Requirement: Admin settings show and edit both models per stage
The admin settings "language model" section SHALL show, for each stage, the primary model picker as today and below it a backup model picker. The backup picker SHALL offer "none" and only the available models of providers other than the current primary's provider; when the admin changes the primary, the backup picker's options SHALL follow the new provider. A refused save SHALL show the server's error in the section and leave the pickers on the saved values. The admin stages page (`#/llm-stages`) SHALL show each stage's backup model and its provider next to the resolved primary model, or "none".

#### Scenario: Backup options follow the primary's provider
- **WHEN** an admin changes a stage's primary from a Gemini model to a GPT model
- **THEN** that stage's backup picker now lists Gemini and Claude models (and "none"), not GPT models

#### Scenario: Refused save shown
- **WHEN** a save is refused because primary and backup would share a provider
- **THEN** the section shows the error text and the pickers show the values that are actually saved

#### Scenario: Stages page
- **WHEN** an admin opens `#/llm-stages` for a stage with a Claude backup
- **THEN** the stage's model line shows the primary model and provider, then the backup model and its provider
