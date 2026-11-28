## MODIFIED Requirements

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
