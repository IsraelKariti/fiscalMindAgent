## MODIFIED Requirements

### Requirement: Four summary tiles head the tab
The top of the tab SHALL show four tiles, in this order:
1. **Total cost**: the sum of all recorded costs, formatted as the roster pill formats a cost (`$0.0042`, `<$0.0001`, `$1.25`, `$0` when zero). When any call is unpriced the value SHALL carry a `+` suffix (as the usage page does) and the tile's context SHALL say how many calls are unpriced.
2. **LLM calls**: the number of calls, with context "n failed" when any call failed, otherwise "all succeeded".
3. **Tokens**: the total of all tokens of all calls (full-price input, cached, cache-write, output and thinking) in compact form (1.3K / 4.2M), with context giving the full-price input tokens (input tokens that are neither cached nor cache-write), the output tokens, the cached tokens and the cache-write tokens.
4. **Cost per sent message**: the total cost divided by the number of messages the agent delivered to the client (outbound, not draft), formatted as a cost; `—` with context "no messages sent yet" when none was delivered.

#### Scenario: Tiles with data
- **WHEN** a client has 12 calls totalling 0.42 USD, one of which failed, and the agent delivered 4 messages
- **THEN** the tiles read `$0.42`, `12` with "1 failed", the token total, and `$0.1050`

#### Scenario: Client with no calls
- **WHEN** a client has no LLM calls yet
- **THEN** the tiles read `$0`, `0`, `0` and `—`, and the tab shows a short empty-state text beneath them instead of the breakdown cards

#### Scenario: Unpriced calls
- **WHEN** two of the client's calls ran on models the pricing registry did not know
- **THEN** the total cost value ends with `+` and its context says 2 calls are unpriced

#### Scenario: Tokens tile context with cached tokens
- **WHEN** a client's only call recorded 54,193 input tokens of which 42,768 are cached and 0 are cache-write, and 727 output tokens
- **THEN** the tokens tile reads `54.9K` and its context gives input `11.4K`, output `727`, cached `42.8K` and cache-write `0`
