# cost-per-version Specification

## Purpose
How every LLM call records the version of the app that made it, and what the admin-only versions page shows so that an admin can compare app versions by cost per unit of work (a planning cycle, a document, a call of each stage) after each update.

## Requirements

### Requirement: Every LLM call records the app version that made it
Every LLM call record SHALL store the version of the app that made the call, as the short git commit the running process was built from. In the deployed environments (production, sandbox) the version SHALL be the commit the container was built from; in a local development run it SHALL be the commit of the working tree at process start; when neither is known the version SHALL read `dev`. The version SHALL be read once at process start, so every call of one process carries the same value. Calls recorded before this change SHALL carry no version. The version SHALL be served wherever the call record is served to an admin today (the admin call endpoints) and SHALL NOT be served to an accountant's session.

#### Scenario: Production call
- **WHEN** the worker built from commit `1987c49a…` runs the planner for a client
- **THEN** the call record stores the version `1987c49`

#### Scenario: Local call
- **WHEN** the developer runs the app from a working tree at commit `c768c49…`
- **THEN** every call record of that run stores the version `c768c49`

#### Scenario: Unknown build
- **WHEN** the process has no build commit and no git working tree
- **THEN** the call record stores the version `dev`

#### Scenario: Old record
- **WHEN** a call was recorded before this change
- **THEN** its record has no version

### Requirement: The admin dashboard has a versions page
The admin dashboard SHALL have one more top-level page, "גרסאות" (versions), reachable at `#/versions` and from a tab placed right after the usage tab. It SHALL be served and shown to an admin only; an accountant's session, a staff viewer's session and the monday embed SHALL have no route to it and SHALL receive none of its figures. While the figures load the page SHALL show a loading text; when loading fails it SHALL show an error banner.

#### Scenario: Admin opens the page
- **WHEN** an admin clicks the versions tab
- **THEN** the hash becomes `#/versions`, the tab is highlighted and the page shows the versions list

#### Scenario: Non-admin request
- **WHEN** a non-admin session requests the versions figures
- **THEN** the request is refused and no figure is served

### Requirement: One card per version, newest first
The page SHALL show one card per distinct version among the included calls, ordered by the version's first included call, newest first, and SHALL show at most 30 cards at once with a "show more" control that reveals the next 30. Calls with no version SHALL be grouped into one last card labeled "before versions" that takes part in no comparison. Each card SHALL show: the short version, the time of the version's first and last included call, the number of days the version was active (first to last call), the number of included calls, the number of failed calls, the total recorded cost, cost per planning cycle, cost per document extracted, and the average input tokens per planner call. A total cost SHALL be formatted as the cost tabs format a cost (`$0.0042`, `$0` when zero) with a `+` suffix when any included call is unpriced; an unpriced call counts as zero cost. A version whose included calls contain no planning cycle SHALL show `—` for cost per cycle; one with no document extraction SHALL show `—` for cost per document.

#### Scenario: Two versions
- **WHEN** calls were recorded under `c768c49` on 10 November and under `1987c49` from 12 November
- **THEN** the page shows the `1987c49` card first, then the `c768c49` card

#### Scenario: Old calls
- **WHEN** some calls were recorded before versions were stored
- **THEN** the last card reads "before versions" with their counts and costs, and no delta is shown on it or computed against it

#### Scenario: Unpriced calls
- **WHEN** a version's calls recorded 0.30 USD and two of them have no cost
- **THEN** the card's total reads `$0.30+`

### Requirement: Per-unit figures
The per-unit figures of a version SHALL be computed from its included calls as follows:
- **Cost per planning cycle**: the total recorded cost of the version's calls that belong to a planning cycle, divided by the number of distinct planning cycles those calls belong to. A cycle whose calls span two versions (a deploy during the cycle) counts in each version with the calls that version made.
- **Cost per document**: the total recorded cost of the version's document-extraction calls, divided by the number of distinct files those calls read.
- **Per stage** (purpose): the number of calls, failed calls, average cost per call, average input tokens per call, average output tokens per call (output plus thinking), and cache share. Stages SHALL be listed by total cost descending and labeled as the cost tab labels a stage ("Planner", "Extract Document", ...).
- **Average input tokens per planner call**: the average input tokens of the version's planner calls.
- **Input tokens** in the two averages above SHALL mean full-price input tokens: the recorded input tokens minus the cached tokens minus the cache-write tokens (see `llm-call-cache-usage`).
- **Cache share** SHALL be the cached tokens divided by all prompt tokens (the recorded input tokens: full-price input, cached and cache-write together).
Failed calls SHALL be included in every count and cost like any other call.

#### Scenario: Cost per cycle
- **WHEN** a version made 6 planner calls costing 0.60 USD in total that belong to 4 distinct planning cycles
- **THEN** its cost per cycle reads `$0.15`

#### Scenario: Cost per document
- **WHEN** a version made 3 extraction calls on file A and 1 on file B costing 0.08 USD in total
- **THEN** its cost per document reads `$0.04`

#### Scenario: Cache share
- **WHEN** a stage's calls in a version recorded 10,000 input tokens of which 7,500 were served from cache
- **THEN** that stage's cache share reads `75%`

#### Scenario: Average input tokens leave out cache tokens
- **WHEN** a version's 2 planner calls recorded 107,138 input tokens in total, of which 85,536 are cached and 0 are cache-write
- **THEN** its average input tokens per planner call reads 10,801

### Requirement: Each card compares with the previous version
Beside each per-unit figure of a card (cost per cycle, cost per document, average planner input tokens) the page SHALL show the change against the same figure of the previous version in the list (the next older version with the same filters), as a signed percentage; a decrease SHALL be marked as an improvement (green, `▼ 12%`) and an increase as a regression (red, `▲ 8%`). No change SHALL be shown when either figure is `—`, on the oldest version, and on the "before versions" card. A card with fewer than 10 included calls SHALL carry a "few calls" note so the admin knows its figures are weak.

#### Scenario: Cheaper cycle
- **WHEN** the previous version's cost per cycle was 0.20 USD and this version's is 0.15 USD
- **THEN** this card shows `$0.15` and `▼ 25%` in green

#### Scenario: More tokens
- **WHEN** the previous version's average planner input tokens were 20,000 and this version's are 22,000
- **THEN** this card shows `22,000` and `▲ 10%` in red

#### Scenario: Few calls
- **WHEN** a version has 4 included calls
- **THEN** its card shows the "few calls" note

### Requirement: Opening a card shows the stage breakdown
Clicking a card (or pressing Enter on the focused card) SHALL expand it to show the per-stage figures of that version, one row per stage, each with the change of its average cost per call and average input tokens against the same stage of the previous version, computed and marked as on the card. Clicking again SHALL collapse it. Only one card SHALL be expanded at a time.

#### Scenario: Expand a version
- **WHEN** the admin clicks the `1987c49` card
- **THEN** the card expands and lists its stages by total cost descending, each with its calls, failed, average cost, average input tokens, average output tokens and cache share

#### Scenario: Stage missing in the previous version
- **WHEN** a stage ran in this version but not in the previous one
- **THEN** that stage row shows no change

### Requirement: Filters
The page SHALL show, above the list, two filters: **agent instance** (all / one entry per agent instance with included calls, labeled by accountant and instance name) and **clients** (all / live clients / test clients, where a test client is an admin test client). Changing a filter SHALL recompute every card, every per-unit figure and every change against the previous version from the included calls only. Calls recorded with no client SHALL count under "all" only. The filters SHALL be remembered in the browser and restored when the page is next opened; when the browser's storage is unavailable the page SHALL use the defaults (all, all).

#### Scenario: Test clients only
- **WHEN** the admin picks "test clients"
- **THEN** every card counts only calls made for admin test clients, and the previous-version comparison uses those calls as well

#### Scenario: Filters remembered
- **WHEN** the admin picks one instance and reloads the page
- **THEN** the page opens with that instance selected
