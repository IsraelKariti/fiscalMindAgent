# planner-prompt-caching Specification

## Purpose

Defines how the planner's request is laid out so that provider prompt caches can serve its fixed instructions: the instructions and tool definitions carry nothing that differs between clients or calls, and every per-request fact is given in a platform-written section at the start of the input.

## Requirements

### Requirement: The planner's fixed instructions are identical across calls
The planner's system instructions SHALL be byte-identical for every planner call of every client whose declaration is for the same tax year. They SHALL NOT contain the accountant's name, the client's name or phone number, the engagement start date, the current date or time, the time since the last message, the upcoming-dates calendar, or the per-request fence token.

#### Scenario: Two clients of different accountants
- **WHEN** the planner runs for a client of accountant A and then for a client of accountant B, both declaring for the same tax year
- **THEN** the two system instructions are identical

#### Scenario: The same client on two days
- **WHEN** the planner runs for one client on Monday and again on Tuesday
- **THEN** the two system instructions are identical, and the current time of each run is given in the input instead

### Requirement: Per-request facts open the input
The planner's input SHALL begin with a platform-written section, fenced like the other platform sections, that states: the accountant's name, the client's name and WhatsApp number, the engagement start date, the current date and time in UTC and in the accountant's local timezone (naming the timezone), the time since the last message (or that none was sent yet), and the upcoming-dates calendar the `send_at` rule relies on. The instructions SHALL point to this section wherever they refer to those facts (the agent's identity, the goal, the self-introduction, the "later than now" rule for `send_at`, and the calendar rule).

#### Scenario: Self-introduction uses the accountant's name
- **WHEN** the client asks who is writing
- **THEN** the planner introduces itself as the digital assistant of the accountant's office using the name given in the opening section, never a personal name

#### Scenario: send_at still comes from the calendar
- **WHEN** the planner schedules a follow-up
- **THEN** the date it writes is a line copied from the calendar in the opening section, later than the local time stated there

### Requirement: The fence token is stated in the input, not in the instructions
The untrusted-data rule in the instructions SHALL identify the request's fence token as the code inside the square brackets of the first line of the input, and SHALL NOT embed the token itself. The first line of the input SHALL be the opening fence of the per-request section and SHALL carry that token.

#### Scenario: Forged fence inside a client message
- **WHEN** a client message contains a line that looks like a section boundary with a different code
- **THEN** the planner treats that line as raw data, because only lines bearing the code from the first line of the input are boundaries

### Requirement: Cache hits on consecutive OpenAI planner calls
When two planner calls that offer the same tool set run on an OpenAI model within the provider's cache lifetime, the second call's recorded cached tokens SHALL cover the fixed instructions and tool definitions (at least 15,000 tokens with the current prompt), whichever client each call is for.

#### Scenario: Two client messages a minute apart
- **WHEN** a client's message triggers a planner call and a second message a minute later triggers another, both in the normal cycle (same tool set)
- **THEN** the second call's `cached_tokens` is at least the size of the fixed instructions plus tools

#### Scenario: Different clients back to back
- **WHEN** the planner runs for one client and, a minute later, for another client with the same tool set
- **THEN** the second call's `cached_tokens` is at least the size of the fixed instructions plus tools
