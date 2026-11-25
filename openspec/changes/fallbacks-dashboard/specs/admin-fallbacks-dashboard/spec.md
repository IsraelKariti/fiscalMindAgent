## Purpose

The admin-only "fallbacks" page: for each language model, what share of the calls aimed at it failed and were handed to the stage's backup model, over a chosen period, so a provider that silently stops answering is seen at a glance.

## ADDED Requirements

### Requirement: An admin-only fallbacks tab
The admin dashboard SHALL have one more top-level tab labeled "fallbacks" (Hebrew UI: "נפילות לגיבוי"), routed at `#/fallbacks`, placed right after the "versions" tab. The page and its data route SHALL be available to admins only: an accountant's session, a staff viewer's session and the monday embed SHALL have no tab and SHALL get an authorization error from the route.

#### Scenario: Admin opens the tab
- **WHEN** an admin opens `#/fallbacks`
- **THEN** the fallbacks page is shown with the "fallbacks" tab highlighted

#### Scenario: Accountant has no access
- **WHEN** an accountant's session requests the fallbacks data route
- **THEN** the request is refused as not authorized, and the accountant's workspace shows no such tab

### Requirement: One card per model with its fallback share
The page SHALL show one card per model that, in the chosen period, was the first model asked on at least one call ("calls aimed at it"). Each card SHALL state, for that model as primary: the model's name and provider; the number of calls aimed at it; the number of those calls that were handed to a backup model ("fell back"); the fallback share as a percentage of the calls aimed at it, shown large; the number of calls that failed with no backup to go to; and, of the calls that fell back, how many the backup answered and how many failed on the backup too. A call aimed at a model SHALL count once, whatever the number of retries inside it. A call that a held provider sent straight to the backup without trying the primary SHALL count as aimed at the primary and as fallen back, with the reason "provider held". Cards SHALL be ordered by fallback share descending, then by calls aimed descending.

#### Scenario: Primary fails on every planner call of some clients
- **WHEN** in the period 20 planner calls were aimed at `claude-opus-5`, 7 of them failed and went to the backup `gpt-6-astra`, which answered all 7, and 13 were answered by `claude-opus-5`
- **THEN** the `claude-opus-5` card reads 20 calls aimed, 7 fell back, 35%, 0 failed without backup, backup answered 7 / failed 0

#### Scenario: Failure with no backup
- **WHEN** a stage with no backup made 10 calls on `gemini-2.5-pro` of which 2 failed
- **THEN** the `gemini-2.5-pro` card reads 10 calls aimed, 0 fell back, 0%, 2 failed without backup

#### Scenario: Primary provider held
- **WHEN** Anthropic is held and 3 extraction calls go straight to the Gemini backup
- **THEN** the Anthropic model's card counts the 3 as aimed at it and as fallen back, with reason "provider held"

### Requirement: Each card breaks the fallbacks down by reason and by stage
Each primary card SHALL list, below its figures, the fallen-back calls by failure reason (the provider's status such as "status 400", or "timeout", "network", "provider held") with a count each, and by stage (the call purpose, labeled as the call browser labels it) with calls aimed, fell back and share for that stage. A reason or stage with zero fallen-back calls SHALL NOT be listed, except that a stage with calls aimed at the model SHALL be listed even at zero fallbacks.

#### Scenario: Grammar error on one stage only
- **WHEN** `claude-opus-5` served the planner and the injection screen in the period, and only planner calls fell back, all with status 400
- **THEN** the card's reasons list reads "status 400 — 7" only, and the stages list reads planner (20 aimed, 7 fell back, 35%) and injection screen (50 aimed, 0 fell back, 0%)

### Requirement: Models that only served as backups get a backup card
A model that took at least one fallback call in the period SHALL have a "as backup" section on its card (or a card of its own when no call was aimed at it as primary) stating how many fallback calls it took, how many it answered, and from which primary models they came, with a count each.

#### Scenario: Backup-only model
- **WHEN** `gpt-6-astra` was never a primary in the period but took 7 fallback calls from `claude-opus-5` and answered all
- **THEN** the page shows a `gpt-6-astra` card with the "as backup" section: took 7, answered 7, from `claude-opus-5` 7, and no primary figures

### Requirement: Period picker
The page SHALL offer the periods "7 days", "30 days", "90 days" and "all", default "30 days", as a row of buttons above the cards; the chosen period SHALL be remembered in the browser for the next visit. A period of N days SHALL cover the calls made in the last N × 24 hours up to now. Changing the period SHALL reload the figures from the server. Above the cards the page SHALL show the totals of the period: calls, fell back, and the overall share.

#### Scenario: Switching to 7 days
- **WHEN** the admin clicks "7 days"
- **THEN** the cards and the totals show only calls of the last 7 days, and the next visit opens on "7 days"

### Requirement: The figures come from the call log
Every figure SHALL be computed from the recorded LLM call rows, where the backup call's row names the primary model it replaced and the reason; nothing SHALL be derived from trace steps at read time. The outage probe's calls (pinned pings of a held provider) SHALL NOT be counted. A call row from before the fallback mark existed SHALL be counted as aimed at its own model; such a failed primary row SHALL count as "failed without backup" unless the one-time backfill marked its backup row. The page SHALL say, in one line under the totals, since when the mark exists ("fallbacks are recorded since <date of the first marked row>, older failures count as failed without backup") when rows older than the mark are in the period.

#### Scenario: Period reaches before the mark
- **WHEN** the admin picks "all" and the log has rows older than the first marked backup row
- **THEN** the note names the date of the first marked row

#### Scenario: Period entirely after the mark
- **WHEN** the admin picks "7 days" and every row of the period is marked or has no fallback
- **THEN** no note is shown

### Requirement: Empty and loading states
While the figures load the page SHALL show a loading text; when loading fails it SHALL show an error banner; when no call was made in the period it SHALL show the period picker and a short empty-state text instead of cards.

#### Scenario: No calls in the period
- **WHEN** the admin picks "7 days" on a deployment with no call in the last week
- **THEN** the page shows the picker and "no LLM calls in this period"
