# admin-cost-graph-tab Specification

## Purpose
What an admin viewing the workspace as an accountant sees on a client's cost graph tab: one chart of the client's LLM spend over time that the admin can filter by call type, model and date range, group by day, week or month, switch between cost, calls and tokens, and drill into by clicking a point; and that nobody else sees it.

## Requirements

### Requirement: A declaration-of-capital client has an admin-only cost graph tab
While an admin views the workspace as an accountant, every declaration-of-capital client view SHALL show one more client tab labeled "גרף עלות" (cost graph), right after the cost tab, marked admin-only with the same marker and colour as the questionnaire and cost tabs. The accountant's own session, a staff viewer's session and the monday embed SHALL NOT show the tab, and a remembered tab choice of "cost graph" SHALL fall back to the Conversation tab when the view is not an admin's view-as session. The tab SHALL be shown for a soft-deleted client and for an admin test client exactly as for a live client.

#### Scenario: Admin sees the tab
- **WHEN** an admin viewing as an accountant opens a declaration-of-capital client
- **THEN** the client tabs are conversation, dashboard, documents, details, questionnaire, cost, cost graph, and the cost graph tab carries the admin-only marker

#### Scenario: Accountant does not see the tab
- **WHEN** the accountant or one of their staff opens the same client
- **THEN** no cost graph tab is shown

#### Scenario: Remembered tab outside view-as
- **WHEN** the cost graph tab was the last open tab for a client and that client is next opened outside an admin's view-as session
- **THEN** the Conversation tab opens

### Requirement: The tab draws from every LLM call recorded for the client
The tab SHALL load every LLM call recorded for the client through the same admin-only route the cost tab uses, and SHALL compute every figure from the cost, tokens, type, model, status and time each call recorded at call time. A call that recorded no cost SHALL count as zero cost and SHALL be counted as unpriced; nothing SHALL be recomputed from today's prices. Calls whose draft a re-plan later discarded and calls that failed SHALL be included like any other call. The figures SHALL be the ones computed when the tab was loaded; the tab reloads when it is opened, not on every new call. While the calls load the tab SHALL show a loading text; when loading fails it SHALL show an error banner.

#### Scenario: Unpriced and failed calls count
- **WHEN** a client's calls in the chosen range recorded 0.0042 USD, no cost (unpriced) and 0.0010 USD on a failed call
- **THEN** the range summary reads 3 calls and `$0.0052+`

#### Scenario: Client with no calls
- **WHEN** a client has no LLM calls yet
- **THEN** the tab shows the toolbar and a short empty-state text instead of the chart

### Requirement: Toolbar of controls
The tab SHALL show, above the chart, these controls in this order:
1. **Call type**: a select with "all types" and one entry per distinct call type among the client's calls, labeled as the cost tab labels a type ("Planner", "Extract Document", ...), sorted by the type's total cost descending. Default: all types.
2. **Model**: a select with "all models" and one entry per distinct model among the client's calls, labeled as the cost tab labels a model, sorted by the model's total cost descending. Default: all models.
3. **Date range**: four presets "7 days", "30 days", "90 days", "all", and a pair of date inputs (from, to). Default: all. Picking a preset SHALL set the date inputs to the preset's range (for "all": from the day of the client's first call to the day of the last call) and editing either date input SHALL deselect the presets. A preset of N days SHALL cover the last N local calendar days ending today, inclusive.
4. **Group by**: "day", "week", "month". Default: day.
5. **Measure**: "cost", "calls", "tokens". Default: cost.
A control whose list has a single entry (one call type, one model) SHALL still be shown, with that entry and the "all" entry.

#### Scenario: Type list follows the client's calls
- **WHEN** a client's calls are of types planner (0.03 USD total) and extract_document (0.01 USD total)
- **THEN** the call type select offers "all types", "Planner", "Extract Document" in that order

#### Scenario: Preset fills the dates
- **WHEN** today is 12 November and the admin picks "7 days"
- **THEN** the from date reads 6 November and the to date reads 12 November, and the "7 days" preset is highlighted

#### Scenario: Custom date deselects the preset
- **WHEN** the admin picks "30 days" and then changes the from date by hand
- **THEN** no preset is highlighted and the chart covers the hand-set range

### Requirement: Filtering and bucketing of the calls
The chart SHALL include a call only when its type matches the chosen type (or any, for "all types"), its model matches the chosen model (or any, for "all models") and its local calendar day lies within the from–to range, inclusive. The included calls SHALL be grouped into buckets by the chosen grouping, in the browser's local time: a bucket per calendar day; a bucket per week starting Monday; a bucket per calendar month. The chart SHALL show every bucket from the one holding the from date to the one holding the to date, buckets with no calls at zero. A bucket's value SHALL be, by measure: the sum of the recorded costs of its calls (unpriced calls as zero); the number of its calls; the sum of input, output and thinking tokens of its calls. Bucket labels SHALL read as a short date for days ("3 Mar") and weeks (the Monday, "3 Mar") and as month and year for months ("Mar 2026").

#### Scenario: Week buckets
- **WHEN** the range is 1 March (Sunday) to 15 March (Sunday), grouping is week, and the client had calls on 1 March (0.01 USD) and 10 March (0.02 USD)
- **THEN** the chart shows three buckets labeled 23 Feb, 2 Mar and 9 Mar with values 0.01, 0, 0.02

#### Scenario: Month buckets with tokens
- **WHEN** the range is 15 January to 10 March, grouping is month, measure is tokens, and the calls in range used 1,200 tokens in January and 300 in March
- **THEN** the chart shows Jan 2026 = 1,200, Feb 2026 = 0, Mar 2026 = 300

#### Scenario: Type and model filters combine
- **WHEN** the admin picks type "Planner" and model "gemini-2.5-pro"
- **THEN** only planner calls that ran on gemini-2.5-pro are counted; every other call is left out of the chart, the summary and the bucket list

#### Scenario: Nothing in range
- **WHEN** the filters leave no call in the range
- **THEN** the chart area shows a short "no calls in this range" text and the summary reads 0 calls and `$0`

### Requirement: One line per call type when no type is chosen
When the call type is "all types", the chart SHALL show one line per call type among the included calls, the six types with the highest total of the chosen measure in range each as their own line, and every remaining type merged into one line labeled "other". The chart's legend SHALL name each line with its type label and the line's total over the range. When one call type is chosen, the chart SHALL show a single line for that type and no legend. Hovering a bucket SHALL show the bucket label, every line's value for that bucket formatted by the measure (cost as `$0.0042`, calls and tokens as plain numbers), and the bucket's number of calls.

#### Scenario: Two types, no filter
- **WHEN** the client's calls in range are of two types and no type is chosen
- **THEN** the chart shows two lines, and the legend names both types with their totals

#### Scenario: Eight types, no filter
- **WHEN** the calls in range are of eight types and no type is chosen
- **THEN** the chart shows seven lines: the six costliest types and "other", whose values are the sum of the remaining two types

#### Scenario: One type chosen
- **WHEN** the admin picks "Planner"
- **THEN** the chart shows one line and no legend

### Requirement: Range summary
Under the toolbar the tab SHALL show one line with the number of included calls and their total cost, formatted as the cost tab formats a cost (`$0.0042`, `$0` when zero), with a `+` suffix on the cost when any included call is unpriced. The summary SHALL follow the type, model and range filters and SHALL NOT change with grouping or measure.

#### Scenario: Summary follows filters
- **WHEN** 12 calls totalling 0.42 USD lie in range, 5 of them planner calls totalling 0.30 USD, and the admin picks "Planner"
- **THEN** the summary changes from 12 calls `$0.42` to 5 calls `$0.30`

### Requirement: Clicking a bucket lists its calls
Clicking a point of the chart (or pressing Enter on the focused bucket) SHALL select that bucket and show, under the chart, a card titled with the bucket's label that lists every included call of that bucket, newest first, with: type label, model, date and time, tokens (input + output + thinking), cost (`—` when unpriced), a failed marker on failed calls, and an "open call" control that opens the call's detail modal as the cost tab's top-calls list does. The card SHALL have a close control. Clicking the selected bucket again or the close control SHALL hide the card. Changing any filter, the grouping or the measure SHALL clear the selection.

#### Scenario: Click a day
- **WHEN** grouping is day and the admin clicks 3 March, which has 2 included calls
- **THEN** a card titled "3 Mar" lists those 2 calls, newest first

#### Scenario: Open a call from the list
- **WHEN** the admin clicks "open call" on a row
- **THEN** that call's detail modal opens, as it does from the cost tab

#### Scenario: Regrouping clears the selection
- **WHEN** a bucket is selected and the admin changes the grouping to month
- **THEN** the card disappears and no bucket is selected

### Requirement: The controls are remembered in the browser
The chosen call type, model, range preset, grouping and measure SHALL be stored in the browser when changed and restored whenever the tab is next opened, for any client, in the same browser. The from–to dates SHALL NOT be stored: a restored preset is re-applied to the current client (its dates recomputed), and a restored "custom" state falls back to "all". A restored call type or model that the current client's calls do not contain SHALL fall back to "all". When the browser's storage is unavailable the tab SHALL use the defaults and work as usual.

#### Scenario: Grouping remembered across clients
- **WHEN** the admin sets grouping to week and measure to calls on client A, then opens the cost graph tab of client B
- **THEN** client B's tab opens with grouping week and measure calls

#### Scenario: Remembered type the client lacks
- **WHEN** the admin picked "Extract Document" on client A and opens client B, which has no extraction calls
- **THEN** client B's tab opens with "all types"

### Requirement: The figures reach an admin only
The tab SHALL obtain the calls only through the admin-only route of the cost tab, which refuses a non-admin session. No figure of this tab SHALL be present in any reply the accountant's session, a staff viewer's session or the monday embed receives.

#### Scenario: Accountant's session
- **WHEN** the accountant's session requests the client's LLM calls
- **THEN** the request is refused and no figure is served
