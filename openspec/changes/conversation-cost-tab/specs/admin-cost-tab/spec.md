## Purpose
What an admin viewing the workspace as an accountant sees about one client's LLM spend on a dedicated client tab: the total, the split by call type and by model, the spend over time and the costliest calls; and that nobody else sees it.

## ADDED Requirements

### Requirement: A declaration-of-capital client has an admin-only cost tab
While an admin views the workspace as an accountant, every declaration-of-capital client view SHALL show one more client tab labeled "עלות" (cost), after the questionnaire tab, marked admin-only with the same marker and colour as the questionnaire tab. The accountant's own session, a staff viewer's session and the monday embed SHALL NOT show the tab, and a remembered tab choice of "cost" SHALL fall back to the Conversation tab when the view is not an admin's view-as session. The tab SHALL be shown for a soft-deleted client and for an admin test client exactly as for a live client.

#### Scenario: Admin sees the tab
- **WHEN** an admin viewing as an accountant opens a declaration-of-capital client
- **THEN** the client tabs are conversation, dashboard, documents, details, questionnaire, cost, and the cost tab carries the admin-only marker

#### Scenario: Accountant does not see the tab
- **WHEN** the accountant or one of their staff opens the same client
- **THEN** no cost tab is shown

#### Scenario: Remembered tab outside view-as
- **WHEN** the cost tab was the last open tab for a client and that client is next opened outside an admin's view-as session
- **THEN** the Conversation tab opens

### Requirement: The tab aggregates every LLM call recorded for the client
The cost tab SHALL load every LLM call recorded for the client (all of them, not a page) and compute its figures from the cost, tokens, type, model, status and time each call recorded at call time. A call that recorded no cost (its model had no price when it ran) SHALL count as zero in every sum and SHALL be counted as "unpriced". Nothing SHALL be recomputed from today's prices. The figures SHALL be the ones computed when the tab was loaded; the tab reloads when it is opened, not on every new call. Calls whose draft a re-plan later discarded SHALL be included like any other call: their cost was spent.

#### Scenario: Sum of priced calls
- **WHEN** a client's calls recorded 0.0042, 0.0100 and no cost (unpriced)
- **THEN** the total reads `$0.0142` and the tab notes one unpriced call

#### Scenario: Discarded draft's call
- **WHEN** a planner call wrote a draft that a re-plan later discarded and recorded 0.0030 USD
- **THEN** that 0.0030 USD is part of the total and of the planner row

#### Scenario: Failed call
- **WHEN** a call ended in an error after recording 0.0010 USD
- **THEN** that 0.0010 USD is part of the total and the call is counted among the failed calls

### Requirement: Four summary tiles head the tab
The top of the tab SHALL show four tiles, in this order:
1. **Total cost**: the sum of all recorded costs, formatted as the roster pill formats a cost (`$0.0042`, `<$0.0001`, `$1.25`, `$0` when zero). When any call is unpriced the value SHALL carry a `+` suffix (as the usage page does) and the tile's context SHALL say how many calls are unpriced.
2. **LLM calls**: the number of calls, with context "n failed" when any call failed, otherwise "all succeeded".
3. **Tokens**: the total of input, output and thinking tokens of all calls in compact form (1.3K / 4.2M), with context giving input, output and cached tokens.
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

### Requirement: Cost by call type
The tab SHALL show a card "cost by call type" with one row per call type (the recorded purpose, labeled as the admin call browser labels it: "Planner", "Extract Document", ...), sorted by cost descending, with: number of calls, number of failed calls, cost, share of the total cost in percent, and average cost per call. A donut chart beside the table SHALL show the cost share by type with the total in its centre. A type whose calls are all unpriced SHALL show `$0` and a 0% share.

#### Scenario: Two types
- **WHEN** a client has 3 planner calls costing 0.0300 USD in total and 1 extract_document call costing 0.0100 USD
- **THEN** the table shows "Planner" with 3 calls, `$0.0300`, 75%, `$0.0100` per call, then "Extract Document" with 1 call, `$0.0100`, 25%, `$0.0100` per call

#### Scenario: Failed calls in a type
- **WHEN** one of the planner calls failed
- **THEN** the Planner row shows 1 failed call and keeps its cost

### Requirement: Cost by model
The tab SHALL show a card "cost by model" with one row per model name used by the client's calls, sorted by cost descending, with number of calls, cost and share of the total cost.

#### Scenario: Two models
- **WHEN** the client's calls ran on gemini-2.5-pro (0.03 USD) and claude-sonnet-4-5 (0.01 USD)
- **THEN** the card shows gemini-2.5-pro with `$0.0300` and 75%, then claude-sonnet-4-5 with `$0.0100` and 25%

### Requirement: Cost over time
The tab SHALL show a chart of the client's spend per day, from the day of the first call to the day of the last call, days without calls at zero, in the browser's local day. Hovering a day SHALL show its date, its cost and its number of calls.

#### Scenario: Three days
- **WHEN** a client had calls on 1 March (0.01 USD), none on 2 March and calls on 3 March (0.02 USD)
- **THEN** the chart shows three points: 0.01, 0, 0.02

### Requirement: Most expensive calls
The tab SHALL list the five costliest calls (fewer when the client has fewer priced calls), costliest first, each with its type label, model, date and time, cost, and a link that opens the call's detail modal as the trace's call link does (`#/llm-calls/<id>`). Failed calls SHALL be marked as such in the list.

#### Scenario: Open a call
- **WHEN** the admin clicks the costliest call's link
- **THEN** the call detail modal opens, as it does from the conversation trace

#### Scenario: Fewer than five calls
- **WHEN** the client has 2 priced calls
- **THEN** the list shows those 2 calls

### Requirement: The cost figures reach an admin only
The route that serves one client's LLM calls to the tab SHALL refuse a non-admin session, exactly as the admin conversation endpoint does, and SHALL serve the calls of a deleted or test client as well as a live one. No cost figure of this tab SHALL be present in any reply the accountant's session, a staff viewer's session or the monday embed receives.

#### Scenario: Accountant's session
- **WHEN** the accountant's session requests the client's LLM calls
- **THEN** the request is refused and no cost figure is served

#### Scenario: Deleted client under view-as
- **WHEN** an admin opens the cost tab of a soft-deleted client
- **THEN** the tab shows the figures of that client's calls as for a live client
