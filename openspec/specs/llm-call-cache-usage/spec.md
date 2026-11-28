# llm-call-cache-usage Specification

## Purpose

What an LLM call records and shows about token usage and prompt caching: the provider's raw usage report, the tokens written into the provider's prompt cache and their price, the cache lifetime the call asked for, how these enter the call's cost, and when a request asks the provider to cache.

## Requirements

### Requirement: Anthropic requests ask for prompt caching
Every request sent to an Anthropic model that has system instructions SHALL ask the provider to cache the fixed start of the request: the tool definitions and the system instructions. The per-call input (the contents and any replayed turns) SHALL stay outside the cached part. The request SHALL ask for the cache lifetime that the admin setting holds at the time of the call (see `llm-model-settings`). A request with no system instructions SHALL be sent without a cache request.

#### Scenario: Two planner calls three minutes apart
- **WHEN** the planner runs on an Anthropic model for a client and runs again three minutes later with the same tool set
- **THEN** the second call's recorded cached tokens cover the tool definitions and system instructions, and its recorded cache-write tokens are 0

#### Scenario: First call after the cache expired
- **WHEN** an Anthropic call runs and no call with the same fixed start ran within the cache lifetime
- **THEN** the call's recorded cached tokens are 0 and its recorded cache-write tokens cover the tool definitions and system instructions

#### Scenario: Fixed start below the provider's minimum
- **WHEN** an Anthropic call's tool definitions and system instructions are shorter than the provider's minimum cacheable size
- **THEN** the call succeeds, and both its cached tokens and cache-write tokens are 0

### Requirement: A call records cache-write tokens and their price
Every LLM call row SHALL record the number of tokens the call wrote into the provider's prompt cache, and the price per token that applied to them at the time of the call. Cache-write tokens SHALL be counted inside the row's input tokens, the same way cached (cache-read) tokens are. A call on a provider that has no cache-write charge, a failed call, and a row recorded before this change SHALL carry 0 cache-write tokens. When the price list has no cache-write price for the model, the system SHALL use the provider's published multiple of the input price for the lifetime the call asked for (Anthropic: 1.25 times for 5 minutes, 2 times for 1 hour).

#### Scenario: Anthropic call that writes the cache
- **WHEN** an Anthropic call returns 45,000 cache-creation tokens, 7,000 other input tokens and 0 cache-read tokens
- **THEN** the row records 52,000 input tokens, 45,000 cache-write tokens and 0 cached tokens

#### Scenario: OpenAI or Gemini call
- **WHEN** a call runs on an OpenAI or Gemini model
- **THEN** the row records 0 cache-write tokens

#### Scenario: Planner run with several model turns
- **WHEN** one planner call takes two model turns, the first writing 45,000 tokens into the cache and the second reading them
- **THEN** the row records 45,000 cache-write tokens and 45,000 cached tokens, each the sum over the turns

### Requirement: The call's cost includes cache-write tokens at their own rate
The cost stored on a call row SHALL be: input tokens that are neither cached nor cache-write at the input price, cached tokens at the cached price, cache-write tokens at the cache-write price, output tokens at the output price, and thinking tokens at the thinking price. A row with 0 cache-write tokens SHALL cost exactly what it costs today.

#### Scenario: Cache-write call on claude-opus-5 with a 5-minute lifetime
- **WHEN** a call has 52,000 input tokens of which 45,000 are cache-write, 600 output tokens, input price $5 per million, cache-write price $6.25 per million and output price $25 per million
- **THEN** the stored cost is 7,000 × $5/M + 45,000 × $6.25/M + 600 × $25/M = $0.33125

#### Scenario: Call with no cache-write tokens
- **WHEN** a call has 0 cache-write tokens
- **THEN** its stored cost equals the cost computed by the rule in force before this change

### Requirement: A call records the cache lifetime it asked for
Every LLM call row SHALL record the cache lifetime its request asked the provider for: "5 minutes", "1 hour", or none when the request carried no cache request. The value SHALL come from the request that was sent, so a later change of the admin setting does not change old rows.

#### Scenario: Setting changed after the call
- **WHEN** a call ran while the setting was 5 minutes and the admin then sets 1 hour
- **THEN** the old call's row still says 5 minutes and the next Anthropic call's row says 1 hour

#### Scenario: Call with no cache request
- **WHEN** a call runs on an OpenAI or Gemini model
- **THEN** its row records no cache lifetime

### Requirement: A call records the provider's raw usage report
Every successful LLM call row SHALL store the usage block(s) the provider returned, unchanged: every field and value as received, with no renaming, no summing and no dropped fields. A call that took several model turns SHALL store one block per turn, in turn order. A failed call, and a row recorded before this change, SHALL store none. Raw usage carries token counts only; prices are never part of it.

#### Scenario: Anthropic single-turn call
- **WHEN** an Anthropic call returns a usage block with `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens` and a nested cache-creation breakdown
- **THEN** the row stores that block with all of those fields and values

#### Scenario: Two-turn planner call
- **WHEN** a planner call takes two model turns
- **THEN** the row stores two usage blocks, the first turn's first

#### Scenario: Failed call
- **WHEN** a call fails on every attempt
- **THEN** the row stores no raw usage

### Requirement: The call page shows cache-write tokens, the cache lifetime and the raw usage
The admin call page (`#/llm-calls/<id>`) SHALL show a "cache-write tokens" tile in the token tiles row, after the cached-tokens tile and before the total cost, with the token count and the price per million tokens that applied, in the same form as the other tiles. The tile SHALL be shown on every call, with 0 when the call wrote nothing. The page SHALL show the cache lifetime the call asked for ("5 minutes" or "1 hour") on that tile, and a dash when the call carried no cache request. The page SHALL show the raw usage as a copyable JSON section, one block per turn, and SHALL say that none was recorded when the row has none. The admin API that serves a call SHALL return these four values. The "copy details" text of a call SHALL include them.

#### Scenario: Call that wrote the cache with a 1-hour lifetime
- **WHEN** an admin opens a `claude-opus-5` call that wrote 45,000 tokens into the cache with a 1-hour lifetime
- **THEN** the tiles row shows "cache-write tokens 45,000" with "$10.000 / million tokens" and the lifetime "1 hour"

#### Scenario: Call on a provider with no cache request
- **WHEN** an admin opens a Gemini call
- **THEN** the cache-write tile shows 0 and a dash for the lifetime

#### Scenario: Raw usage section
- **WHEN** an admin opens a two-turn Anthropic planner call
- **THEN** the page shows two raw usage JSON blocks, each with the provider's own field names, and each can be copied

#### Scenario: Row recorded before this change
- **WHEN** an admin opens a call recorded before this change
- **THEN** the cache-write tile shows 0, the lifetime shows a dash, and the raw usage section says none was recorded

### Requirement: Usage totals count cache-write tokens at their own rate
The stored usage totals (per day, accountant, agent instance and model, and the lifetime totals per accountant and model) SHALL add up cache-write tokens separately for each cache lifetime (5 minutes, 1 hour), from every call counted after this change. The cost that the admin usage page (`#/usage`) and the per-accountant usage totals show SHALL price those tokens at the model's cache-write rate for their lifetime, with the same rule as a single call's cost, so that for calls made at unchanged prices a day's cost equals the sum of its calls' costs. Totals counted before this change SHALL carry 0 cache-write tokens and keep their cost. The usage page's table SHALL show a "cache-write" token column, next to the cached column, holding the sum of both lifetimes.

#### Scenario: A day with one cache-write call
- **WHEN** the only call of a day on `claude-opus-5` has 52,000 input tokens of which 45,000 are cache-write with a 5-minute lifetime, and 600 output tokens
- **THEN** the usage page shows 45,000 in the cache-write column for that day and model, and the cost $0.33125, the same as the call page

#### Scenario: Both lifetimes on one day
- **WHEN** one call of a day writes 10,000 tokens with a 5-minute lifetime and a later call, after the admin changed the setting, writes 10,000 tokens with a 1-hour lifetime
- **THEN** the cache-write column shows 20,000 and the cost prices 10,000 at the 5-minute rate and 10,000 at the 1-hour rate

#### Scenario: Days before this change
- **WHEN** an admin views a day counted before this change
- **THEN** the cache-write column shows 0 and the day's cost is what it was before
