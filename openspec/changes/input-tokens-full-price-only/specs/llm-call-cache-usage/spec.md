## ADDED Requirements

### Requirement: A figure shown as input tokens counts only tokens billed at the input price
Every figure the app labels or presents as "input tokens" SHALL be the full-price input tokens: the recorded input tokens minus the cached (cache-read) tokens minus the cache-write tokens, never below 0. This holds for a single call and for any sum or average over calls or usage totals. The recorded row keeps its input total unchanged (cached and cache-write tokens stay counted inside it); only what is shown changes. No cost figure changes.

The rule SHALL apply on:
- the call page (`#/llm-calls/<id>`) input tokens tile;
- the admin call list tokens column, which SHALL read input / output / thinking / cached / cache-write;
- the call line of the conversation trace and of the admin conversations card (input / output);
- the client cost tab tokens tile context (see `admin-cost-tab`);
- the usage page (`#/usage`) input tokens column;
- the accountant page per-model usage table, which SHALL also show a cached column and a cache-write column;
- the versions page (see `cost-per-version`).

A figure that shows the total tokens of a call or of a group of calls (the cost tab tokens tile, the cost graph "tokens" measure and its bucket list, the usage page "tokens" measure) SHALL count every token of the call: full-price input, cached, cache-write, output and thinking.

The "copy details" text of a call and the `npm run call` output SHALL carry the full-price input token count as its own field, next to the recorded input total.

#### Scenario: Call that read the cache
- **WHEN** an admin opens a call that recorded 54,193 input tokens, of which 42,768 are cached and 0 are cache-write
- **THEN** the input tokens tile shows 11,425 with the input price, and the cached tile shows 42,768 with the cached price

#### Scenario: Call that wrote the cache
- **WHEN** an admin opens a call that recorded 52,000 input tokens, of which 45,000 are cache-write and 0 are cached
- **THEN** the input tokens tile shows 7,000 and the cache-write tile shows 45,000

#### Scenario: Two-turn call
- **WHEN** a planner call took two turns and recorded 107,138 input tokens, of which 85,536 are cached
- **THEN** the input tokens tile shows 21,602

#### Scenario: Tiles explain the cost
- **WHEN** an admin opens any priced call
- **THEN** the sum of each tile's token count times that tile's price equals the total cost shown

#### Scenario: Call list row
- **WHEN** the call list shows a call with 54,193 recorded input tokens, 42,768 cached, 0 cache-write, 727 output and 0 thinking tokens
- **THEN** its tokens cell reads `11,425 / 727 / 0 / 42,768 / 0`

#### Scenario: Usage page day
- **WHEN** the only call of a day recorded 52,000 input tokens of which 45,000 are cache-write
- **THEN** the usage table shows 7,000 in the input column and 45,000 in the cache-write column for that day

#### Scenario: Total tokens keep every token
- **WHEN** a client's only call recorded 54,193 input tokens (42,768 cached), 727 output tokens and 0 thinking tokens
- **THEN** the cost tab tokens tile and the cost graph "tokens" measure show 54,920

#### Scenario: Provider with no cache
- **WHEN** a call recorded 9,000 input tokens with 0 cached and 0 cache-write tokens
- **THEN** every screen shows 9,000 input tokens for it

#### Scenario: Copy details
- **WHEN** an admin presses "copy details" on a call with 54,193 recorded input tokens of which 42,768 are cached
- **THEN** the copied JSON holds the recorded total 54,193 and a full-price input count of 11,425
