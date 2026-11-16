## Purpose
How the system records the trigger, the planned send time, the discard time, the discard reason and the planning cost of every outbound draft, and what an admin viewing the workspace as an accountant sees on the agent's analytics tab about drafts that were discarded before they were sent.

## ADDED Requirements

### Requirement: Every outbound draft records what started its planning cycle
Every planning cycle SHALL carry a trigger, and the draft the cycle schedules SHALL record it. The triggers SHALL be: `client_message` (the client's turn settled: a message or files arrived), `agent_message_sent` (the agent's own scheduled message went out and the next one is planned), `file_verification` (a verification batch finished), `tax_fetch` (a tax-authority fetch delivered or ended), `kickoff` (the client's first message), `team_answer` (the client's team answered a question), `admin_redraft`, `review_regenerate`, `admin_unpause` (the admin brake was released), `resume` (the accountant resumed the client and the agent redrafted), `goal_reopened`, `channel_changed` (the client's WhatsApp availability changed).

#### Scenario: Draft after a client reply
- **WHEN** a client's message settles and the agent drafts the reply
- **THEN** that draft records the trigger `client_message`

#### Scenario: Draft after the agent's own send
- **WHEN** a scheduled message is sent and the agent plans the next follow-up
- **THEN** that draft records the trigger `agent_message_sent`

#### Scenario: First message
- **WHEN** the kickoff drafts the first message
- **THEN** that draft records the trigger `kickoff`

### Requirement: Every outbound draft records its planned send time
When the agent schedules an outbound draft (queued, or held for the accountant's approval or for admin review), the system SHALL store the planned send time on the draft itself, so it survives the cancellation of the queued send.

#### Scenario: A scheduled follow-up
- **WHEN** the planner schedules a draft for tomorrow at 10:00
- **THEN** the draft row holds tomorrow 10:00 as its planned send time, and still holds it after the queued send is cancelled

#### Scenario: A held first message
- **WHEN** the kickoff drafts and holds the first message
- **THEN** the draft row holds the planned send time the kickoff computed

### Requirement: A discarded draft is stamped with the time and the reason
Whenever the system cancels a client's pending send and the draft is not going to be sent, the system SHALL stamp that draft with the discard time and a discard reason, exactly once. A draft that was sent, or that is still pending or held, SHALL carry no discard stamp. The reasons SHALL be: `client_message` (a client reply arrived), `file_verification` (a verification batch finished), `tax_fetch` (a tax-authority fetch delivered or ended), `admin_redraft` (an admin or accountant asked for a new draft), `admin_pause` (an admin paused the agent or the client), `resume` (a resume could not restore the held draft and redrafted), `client_declined`, `goal_changed` (the goal completed or reopened), `channel_changed` (the client's WhatsApp availability changed), `client_deleted`, `send_settled` (the send ran and the next plan replaced the row), `review_regenerate` (an admin regenerated a draft under review).

#### Scenario: Client replies while a follow-up waits
- **WHEN** a client with a scheduled follow-up sends a message
- **THEN** the follow-up draft is stamped discarded at the moment of the cancellation with reason `client_message`

#### Scenario: Verification replaces the draft
- **WHEN** a verification batch finishes and the agent re-plans
- **THEN** the draft that was pending before the re-plan is stamped `file_verification`

#### Scenario: Sent draft is never stamped
- **WHEN** a draft is sent and the next plan drafts the following message
- **THEN** the sent row carries no discard stamp, and only an unsent pending row would be stamped `send_settled`

#### Scenario: Held draft restored on resume
- **WHEN** a paused client resumes and the held draft is re-queued or sent as is
- **THEN** that draft carries no discard stamp

### Requirement: Old drafts are backfilled once
At migration time, every outbound draft SHALL be backfilled with a trigger read from the thread row right before it: `client_message` when that row is inbound, `agent_message_sent` when it is a sent outbound row, `kickoff` when nothing precedes it. Every outbound draft that is neither sent nor the client's live pending draft SHALL also be backfilled with: a discard time equal to the time of the next message in the client's thread after it (the next inbound or the next outbound row), or left unknown when nothing followed; the planned send time read from the draft's scheduling step in the audit trail when one exists; and the reason `unknown`.

#### Scenario: Backfilled draft
- **WHEN** an old draft of 3 March 10:00 was followed in the thread by a client message at 3 March 14:00
- **THEN** after the migration the draft reads discarded at 3 March 14:00, reason `unknown`

#### Scenario: Live draft untouched
- **WHEN** a client has a pending queued draft at migration time
- **THEN** that draft gets a trigger but no discard stamp

#### Scenario: Backfilled trigger
- **WHEN** an old draft was written right after the client's message in the thread
- **THEN** after the migration it reads trigger `client_message`

### Requirement: Every LLM call of a planning cycle is tied to the draft it produced
Each planning cycle SHALL carry one cycle id. Every LLM call the cycle makes (the planner call, its retries, its continuation calls, the backup-model call and the follow-up write) SHALL record that cycle id, and the draft the cycle schedules SHALL record the same id, so the cost of a draft is the recorded cost of its cycle's calls. Calls and drafts recorded before this change SHALL carry no cycle id, and their cost SHALL count as unknown, never as zero.

#### Scenario: One cycle, two calls
- **WHEN** a planning cycle makes a planner call of 0.0030 USD and a continuation call of 0.0010 USD and schedules a draft
- **THEN** the draft's cost reads 0.0040 USD

#### Scenario: Cycle without a draft
- **WHEN** a planning cycle ends with no message (collect, or no follow-up)
- **THEN** its calls carry the cycle id but no draft carries it, and its cost is not attributed to any draft

#### Scenario: Pre-change draft
- **WHEN** a discarded draft predates this change
- **THEN** it counts in the discard counts and lifetimes, and its cost is reported as unknown

### Requirement: The Settings view has an admin-only analytics tab
While an admin views the workspace as an accountant, the workspace Settings view SHALL show one more tab labeled "ניתוח" (analytics), after the test tab and before the dashboard tab, marked admin-only with the same marker and colour as the test tab. The accountant's own session and a staff viewer's session SHALL NOT show the tab, and a remembered tab choice of "analytics" SHALL fall back to the general tab when the view is not an admin's view-as session.

#### Scenario: Admin sees the tab
- **WHEN** an admin viewing as an accountant opens the agent's Settings view
- **THEN** the tabs are general, connections, staff, test, analytics, dashboard, and the analytics tab carries the admin-only marker

#### Scenario: Accountant does not see the tab
- **WHEN** the accountant or one of their staff opens the Settings view
- **THEN** no analytics tab is shown

#### Scenario: Remembered tab outside view-as
- **WHEN** the analytics tab was the last open tab and the Settings view is next opened in the accountant's own session
- **THEN** the general tab opens

### Requirement: Date range of the tab
The tab SHALL offer the presets "30 days", "90 days", "all" and a pair of date inputs (from, to), default "all". A preset of N days SHALL cover the last N calendar days ending today, inclusive. Editing a date input SHALL deselect the presets. A draft belongs to the range by the day it was written. The chosen preset SHALL be remembered in the browser; when the browser's storage is unavailable the tab SHALL use the default.

#### Scenario: Preset fills the dates
- **WHEN** today is 15 November and the admin picks "30 days"
- **THEN** the from date reads 17 October and the to date reads 15 November

#### Scenario: Draft outside the range
- **WHEN** a draft was written on 1 October and discarded on 20 October, and the range is 17 October to 15 November
- **THEN** that draft is not counted

### Requirement: Headline figures
The tab SHALL show, for the agent instance and the chosen range, these tiles: drafts written; drafts sent; drafts discarded; discard rate (discarded ÷ written, as a percentage); cost of discarded drafts; cost of all drafts; waste share (discarded cost ÷ all cost, as a percentage); and the number of drafts whose cost is unknown. A draft still pending or held at load time SHALL count as written but neither sent nor discarded. Costs SHALL be formatted as the cost tab formats a cost (`$0.0042`, `$0` when zero), with a `+` suffix when any counted draft has an unknown cost.

#### Scenario: Simple counts
- **WHEN** in range 40 drafts were written, 25 sent, 12 discarded and 3 are still pending
- **THEN** the tiles read 40 written, 25 sent, 12 discarded, 30% discard rate

#### Scenario: Unknown cost
- **WHEN** 2 of the 12 discarded drafts predate the cycle id and the other 10 cost 0.05 USD together
- **THEN** the discarded-cost tile reads `$0.05+` and the unknown-cost tile reads 2

#### Scenario: No drafts
- **WHEN** the instance has no outbound draft in the range
- **THEN** the tab shows the range controls and a short empty-state text instead of the figures

### Requirement: Discards by reason
The tab SHALL list every discard reason that occurs in range, with its count, its share of all discards and its known cost, sorted by count descending. The reason labels SHALL be Hebrew and plain (for example "הלקוח ענה" for `client_message`, "סיבה לא ידועה" for `unknown`).

#### Scenario: Reasons table
- **WHEN** 12 discards in range are 8 `client_message`, 3 `file_verification` and 1 `unknown`
- **THEN** the list reads client replied 8 (67%), file verification 3 (25%), unknown reason 1 (8%), in that order

### Requirement: Drafts by trigger
The tab SHALL list every trigger that occurs among the drafts in range with: drafts written, sent, discarded, the discard rate, the known discarded cost, and the most common discard reason of that trigger's discarded drafts, sorted by discarded cost descending (then by discarded count). The trigger labels SHALL be Hebrew and plain (for example "אחרי הודעה מהלקוח" for `client_message`, "אחרי שליחת הודעה של הסוכן" for `agent_message_sent`).

#### Scenario: Two triggers
- **WHEN** in range 20 drafts were written after a client message (4 discarded, 0.01 USD) and 15 after the agent's own send (10 discarded, 0.03 USD, 9 of them by `client_message`)
- **THEN** the list reads the agent-send row first with 15 written, 10 discarded, 67%, `$0.03`, most common reason "the client replied", then the client-message row with 20, 4, 20%, `$0.01`

### Requirement: Lifetime of discarded drafts
For the discarded drafts in range whose discard time is known, the tab SHALL show: the median and the average time alive (discard time minus written time); the median share of the planned wait that was used (time alive ÷ (planned send time minus written time), for drafts with a known planned time, capped at 100%); and a wait curve. Durations SHALL be shown in the largest fitting unit ("4 h 20 min", "2 d 3 h", "35 s").

The wait curve answers "if the agent waited X seconds of client silence before writing, how many discards would not have happened". For every 5 seconds from 0 to 10 minutes it SHALL show the share of the drafts discarded because the client wrote again (reason `client_message`, discard time known) whose client silence was shorter than X, where client silence is the discard time minus the time of the last client message before the draft was written (the draft's written time when no such message is known). Hovering a point SHALL read the wait, the share, the count out of all such discards, and their known cost. A vertical mark SHALL show the current wait setting (`INBOUND_QUIET_SECONDS`). Discards for other reasons SHALL NOT count, since waiting does not avoid them.

#### Scenario: Median lifetime
- **WHEN** the discarded drafts in range lived 30 s, 2 h and 26 h
- **THEN** the median reads 2 h

#### Scenario: Wait curve
- **WHEN** four drafts were discarded because the client wrote again, with client silences of 40 s, 70 s, 100 s and 20 min, and one draft was discarded after a file check 30 s after it was written
- **THEN** the curve reads 25% at a wait of 60 s (1 of 4), 75% at 2 min (3 of 4) and 75% at 10 min, and the file-check draft counts nowhere on it

#### Scenario: Share of the planned wait
- **WHEN** a draft was written at 09:00 for 21:00 and discarded at 12:00
- **THEN** that draft used 25% of its planned wait

#### Scenario: Planned time unknown
- **WHEN** a backfilled draft has no planned send time
- **THEN** it counts in the time-alive figures but not in the share-of-wait figure

### Requirement: Weekly trend
The tab SHALL show a chart of one bar group per calendar week (Monday start, browser's local time) from the week of the first draft in range to the week of the last: drafts written, drafts discarded, and a line of the discarded cost. Hovering a week SHALL show the week's label (its Monday, "3 Mar"), the three values and the discard rate of that week.

#### Scenario: Two weeks
- **WHEN** the range holds a week with 10 written and 2 discarded and a week with 8 written and 5 discarded
- **THEN** the chart shows two week groups, and hovering the second reads 8 written, 5 discarded, 63%

### Requirement: Clients that wasted the most
The tab SHALL list up to ten clients of the instance ordered by known discarded cost descending (then by discarded count), each with name, discarded count, discarded cost and discard rate, and a control that opens the client. Soft-deleted clients SHALL be listed with a deleted marker; test clients SHALL be listed like live ones.

#### Scenario: Top client
- **WHEN** client A discarded 9 drafts costing 0.04 USD and client B discarded 12 costing 0.02 USD
- **THEN** client A is listed first

### Requirement: The figures reach an admin only
The tab SHALL obtain its figures only through an admin-only route for the agent instance, which refuses a non-admin session. No figure of this tab SHALL be present in any reply the accountant's session, a staff viewer's session or the monday embed receives. While the figures load the tab SHALL show a loading text; when loading fails it SHALL show an error banner.

#### Scenario: Accountant's session
- **WHEN** the accountant's session requests the instance's message analytics
- **THEN** the request is refused and no figure is served
