## Purpose

How the platform behaves when a model provider cannot serve calls for a reason on our side (billing, key, quota, outage, or the daily spend cap): the work that needs the provider is held and recovered by itself, the admin is told, and the client and the accountant see a calm, neutral state instead of an error that looks like their fault.

## ADDED Requirements

### Requirement: A provider failure opens a hold on that provider
When a model stage fails because the provider did not serve the call — the provider answered an API error of any status (for example a billing or credit error, an authentication error, a quota error, a rate limit that outlived the retries, a server error) or was unreachable, on the primary model and, when a backup is set, on the backup too — the platform SHALL open a hold on each provider that failed. The daily spend cap refusing a call SHALL open a hold on the pseudo-provider "budget". A failure where only a request timeout occurred SHALL NOT open a hold (the request, not the provider, is suspected), and a failure where the model answered (an empty, refused or gate-rejected answer) SHALL NOT open a hold. A hold SHALL record the provider, the reason kind (billing, auth, quota, rate limit, server error, unreachable, budget), the error text, and the time it opened. A hold SHALL survive process restarts and SHALL be visible to the web and the worker process alike.

#### Scenario: Credit balance exhausted
- **WHEN** the injection screen stage runs on an Anthropic model with no backup and Anthropic answers 400 "Your credit balance is too low"
- **THEN** a hold opens on Anthropic with reason kind billing and that error text, and the message that was being screened is held as unscreened (not withheld)

#### Scenario: Primary and backup both down
- **WHEN** the planner's primary (Gemini) answers 503 on every attempt and the backup (Anthropic) answers 401
- **THEN** holds open on both Gemini and Anthropic, each with its own reason

#### Scenario: Backup answers
- **WHEN** the primary answers 500 twice and the backup answers normally
- **THEN** no hold opens and the stage completes on the backup as today

#### Scenario: Timeout only
- **WHEN** a classification call times out on every attempt and no provider ever answered with a status
- **THEN** no hold opens and the file is marked failed as today

### Requirement: While a provider is held, no call is sent to it
While a provider is held, every model call whose primary and (if set) backup models are on held providers SHALL be refused before it is sent, with a distinct "provider held" error, except the probe call. A stage whose backup is on a provider that is not held SHALL run on the backup as a normal fallback. The daily spend cap hold SHALL refuse every call except the probe.

#### Scenario: Stage with a healthy backup during a hold
- **WHEN** Anthropic is held and the extraction stage runs on an Anthropic primary with a Gemini backup
- **THEN** the call is sent to the Gemini backup without trying Anthropic first, and the fallback is recorded as today

#### Scenario: Stage with no way out
- **WHEN** Anthropic is held and the injection screen stage runs on an Anthropic primary with no backup
- **THEN** no request leaves the system, and the stage reports "provider held" to its caller

### Requirement: Held content is not judged and not shown to the model
An inbound message whose injection screen reported "provider held" SHALL be marked as waiting for the safety check: it is not withheld, no injection audit row or alert is written, and no fixed reply goes to the client. Its text SHALL NOT be given to any model until the screen has run; a planner prompt that renders the thread SHALL show a neutral "message waiting for the safety check — not shown" marker in its place. An inbound file whose screen, split or classification reported "provider held" SHALL stay in its pending analysis state, marked as held by the outage: it is not quarantined and not marked failed, and no injection audit row is written.

#### Scenario: Message arrives during a billing hold
- **WHEN** a client sends "here are my pension reports" while Anthropic is held and the screen stage runs on Anthropic
- **THEN** the message row is marked waiting for the safety check, no block is recorded, the client receives no "cannot process" reply, and the planner (which does not run yet) would not see the text

#### Scenario: File arrives during the hold
- **WHEN** a client sends a PDF during the hold
- **THEN** the file is stored, stays pending, is marked held, is not quarantined, and no critical injection alert is raised

#### Scenario: Screen fails for a reason that is not a provider failure
- **WHEN** the screen's own code gate rejects the model's answer as malformed
- **THEN** the content is blocked as today (fail closed) — the hold applies only to provider failures

### Requirement: A client's work waits during the hold, with one neutral state
A client whose turn, planner run, verification or file analysis is stopped by a hold SHALL be marked as held by the system. The client SHALL NOT be marked as draft-failed and SHALL NOT be paused. While held, the accountant's client view SHALL show a neutral waiting state ("waiting for the system — the agent will continue by itself") instead of "drafting failed" or "stuck"; the client dot SHALL stay blue (in progress). The accountant SHALL NOT be shown the cause. An admin viewing the client's trace SHALL see one code step per held turn naming the provider and the reason kind.

#### Scenario: Planner call hits the outage
- **WHEN** the deferred planner run of a client fails because the planner's provider answered a billing error
- **THEN** the client is marked held, not draft-failed; the client view shows the waiting state; the trace has a hold step naming Anthropic and billing

#### Scenario: Accountant opens the client during the hold
- **WHEN** an accountant opens a held client
- **THEN** they see the waiting state text, no error wording, no retry button, and no mention of billing or a provider

### Requirement: The provider is probed and the hold clears by itself
While a hold is open, the system SHALL probe the held provider at a configured interval (`LLM_OUTAGE_PROBE_SECONDS`, default 300) with one minimal fixed call on a model of that provider; for the budget hold the probe SHALL be the spend-cap check itself. An admin SHALL be able to run the probe at once from the admin UI ("retry now") and SHALL see its result (recovered, or still failing with the error text). A successful probe SHALL clear the hold and start recovery. A failed probe SHALL keep the hold, update its last error and time, and SHALL raise no new alert.

#### Scenario: Credits added
- **WHEN** the admin adds credits and the next probe (or "retry now") gets an answer from Anthropic
- **THEN** the Anthropic hold clears and recovery starts

#### Scenario: Retry now while still broken
- **WHEN** the admin clicks "retry now" and the provider still answers the billing error
- **THEN** the bar shows "still failing" with the error text, the hold stays, and no second alert email is sent

### Requirement: Recovery re-runs the held work in order
When a hold clears, the system SHALL, for every client with held work: re-run the safety check on every message waiting for it, re-run the analysis of every held file from its stored bytes, and then request the client's deferred planner run under the normal turn rules, so the client receives one reply for everything they sent during the hold. A message or file whose re-run hits a hold again SHALL stay held (the hold reopens). A client whose state no longer allows a plan (complete, paused, declined) SHALL have their held marker cleared without a plan. Nothing sent by the client during the hold SHALL be lost or require resending.

#### Scenario: Ten messages and nine files sent during the hold
- **WHEN** the hold clears after a client sent ten messages and nine files during it
- **THEN** every message is screened, every file is analyzed, and exactly one planner run follows, producing one reply

#### Scenario: Client completed meanwhile
- **WHEN** the hold clears and a held client was marked complete by the accountant during the hold
- **THEN** the client's held marker is cleared and no planner run is requested

### Requirement: The admin is told when a hold opens and when it clears
When a hold opens, the system SHALL raise one critical alert (an alert row and the admin email) naming the provider, the reason kind, the error text and the time, throttled so a sustained outage produces one alert, not one per failed call. When a hold clears, the system SHALL raise one informational alert saying the provider recovered and how many clients were recovered. The server log SHALL note both at warning level.

#### Scenario: Sustained billing outage
- **WHEN** 40 calls fail over an hour with the same billing error
- **THEN** exactly one critical alert row and one email are produced for that hold

### Requirement: Every admin page shows the hold
While any hold is open, every admin page SHALL show a red bar at the top naming each held provider, its reason kind in plain words (for example "payment or credit problem"), since when, the number of clients waiting, the sentence that nothing is lost, and a "retry now" button; the bar SHALL refresh without a reload. The admin settings language-model section and the stages page SHALL show the same state next to the affected provider's models. When no hold is open, the bar SHALL NOT be shown.

#### Scenario: Admin opens the dashboard during the hold
- **WHEN** an admin opens any admin page while Anthropic is held for billing and three clients are waiting
- **THEN** the top of the page shows the red bar with "Anthropic — payment or credit problem — since 14:49 — 3 clients waiting — nothing is lost" and the retry button

#### Scenario: Hold clears while the page is open
- **WHEN** the probe succeeds while the admin's page is open
- **THEN** the bar disappears on the next refresh without a reload

### Requirement: The client gets at most one calm acknowledgement per outage
If a hold is still open after a configured delay (`LLM_OUTAGE_ACK_AFTER_SECONDS`, default 600; 0 disables) and a client has sent a message or file during the hold, the system SHALL send that client one fixed WhatsApp text, without any model, saying the message was received and there is a short delay on our side. The text SHALL NOT mention a provider, billing or an error. It SHALL be sent at most once per client per hold, only over WhatsApp, only inside the open 24-hour window, and SHALL be recorded as an outbound message in the thread. A hold that clears before the delay SHALL send nothing.

#### Scenario: Short blip
- **WHEN** a client writes during a hold that clears after four minutes
- **THEN** the client receives no acknowledgement, only the normal reply after recovery

#### Scenario: Long outage
- **WHEN** a client writes during a hold and the hold is still open after the delay
- **THEN** the client receives the fixed acknowledgement once, and no second one for later messages during the same hold
