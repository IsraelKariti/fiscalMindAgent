# admin-site-access Specification

## Purpose
What an admin sees on the site-access screen: every external site the agent is meant to log in to, whether that login is built yet, how often the agent has used it, and whether recent logins are succeeding.

## Requirements

### Requirement: Admins have a site-access screen
The admin dashboard SHALL have a tab labeled "גישה לאתרים" that opens the screen at `#/site-access`. The screen SHALL be reachable only by admins; the accountant's own session, a staff viewer and the monday embed SHALL NOT see the tab or the data. The screen SHALL show a loading text while the data loads and an error banner when loading fails.

#### Scenario: Admin opens the tab
- **WHEN** an admin clicks the "גישה לאתרים" tab or opens `#/site-access`
- **THEN** the site-access screen is shown and the tab is highlighted

#### Scenario: Non-admin requests the data
- **WHEN** a request without an admin session calls the site-access data route
- **THEN** the request is refused like every other admin route

### Requirement: The screen lists a fixed catalog of monitored accesses
The screen SHALL list every entry of a fixed catalog of monitored accesses, in three groups shown in this order: pension funds ("קליטת פנסיה"), study funds ("קליטת קרן השתלמות"), other sites ("אתרים נוספים"). One entry is one site and one product. The catalog SHALL contain:
- pension funds: Infinity, Altshuler Shaham, Phoenix, Harel, Clal, Migdal, More, Meitav, Menora Mivtachim;
- study funds: Infinity, Altshuler Shaham, Analyst, Harel, Phoenix, Clal, Yelin Lapidot, Migdal, More, Meitav, Menora Mivtachim;
- other sites: Israel Tax Authority (Form 106).

Each entry SHALL be shown as a card with the site's Hebrew name as its title. An entry SHALL appear even when it has no sessions at all. Entries within a group SHALL keep the catalog's order.

#### Scenario: Fresh database
- **WHEN** the database holds no fetch sessions
- **THEN** the screen still shows 9 pension-fund cards, 11 study-fund cards and 1 other-site card, each with zero counts and the health "no data yet"

### Requirement: Each entry shows whether its access is built
Each card SHALL carry a status badge: "built" when a fetch provider for that site exists and offers that product, "not built" otherwise. The badge SHALL be derived from the registered providers, never from a hand-maintained flag, so building a provider later flips the badge without a separate edit.

#### Scenario: Existing providers
- **WHEN** the screen loads with today's providers
- **THEN** exactly these cards read "built": Altshuler Shaham pension, Altshuler Shaham study fund, Harel study fund, Israel Tax Authority; every other card reads "not built"

#### Scenario: A provider is added later
- **WHEN** a fetch provider for Meitav offering the study-fund product is registered
- **THEN** the "Meitav — study fund" card reads "built" with no change to the catalog

### Requirement: Each entry shows access counts
Each card SHALL show four counts: total, today, last 7 days, last 30 days. One access is one fetch session that reached the site: its status is `logging_in`, `verifying`, `downloading`, `delivered` or `failed`, or the site was asked for a one-time code (the session records when the code was requested, whatever its status is now). Sessions that ended before a login started (`agreed`, `wa_intro_sent`, or expired/cancelled with no code ever requested) SHALL NOT count. A session counts under every product it was agreed to fetch: when the session names document keys, under each of those; when it names none, under every product the provider offers. "Today", "last 7 days" and "last 30 days" SHALL be whole calendar days in Israel time, ending today and inclusive, measured by the session's creation time.

#### Scenario: Altshuler session for both products
- **WHEN** one Altshuler Shaham session with document keys pension and study fund logged in and delivered yesterday
- **THEN** both the "Altshuler Shaham — pension" and "Altshuler Shaham — study fund" cards count 1 in total, 0 today, 1 in last 7 days, 1 in last 30 days

#### Scenario: Session never logged in
- **WHEN** a session was created with status `agreed` and later cancelled before any login
- **THEN** it counts in no card

#### Scenario: Tax-authority session with no document keys
- **WHEN** a tax-authority session with null document keys reached `awaiting_otp` and then expired
- **THEN** the "Israel Tax Authority" card counts it as one access

### Requirement: Each entry shows a health badge
Each card SHALL show a health badge computed from that entry's finished accesses, newest first. A finished access is a session in status `delivered` or `failed`; `expired` and `cancelled` sessions are abandoned by the client and SHALL be ignored for health. A `failed` session whose error says the site listed no documents SHALL count as a successful login for health, because the site was reached and answered. The badge SHALL be:
- "no data yet" when the entry has no finished access;
- "healthy" when the most recent finished access succeeded;
- "warning" when the most recent finished access failed but the one before it succeeded or does not exist;
- "failing" when the two most recent finished accesses both failed.

A built entry SHALL also show the time of its last access and its outcome, and when that access failed, the stored error text.

#### Scenario: Last login worked
- **WHEN** Harel's finished accesses, newest first, are delivered, failed, delivered
- **THEN** the "Harel — study fund" card reads "healthy"

#### Scenario: One recent failure
- **WHEN** Harel's finished accesses, newest first, are failed, delivered
- **THEN** the card reads "warning" and shows the failure's error text

#### Scenario: Two failures in a row
- **WHEN** Harel's finished accesses, newest first, are failed, failed, delivered
- **THEN** the card reads "failing"

#### Scenario: No documents on the site
- **WHEN** the newest finished access failed with the "no documents found on the site" error
- **THEN** it counts as a successful login and the card reads "healthy"

#### Scenario: Only abandoned sessions
- **WHEN** an entry's only sessions expired while waiting for the one-time code
- **THEN** the counts include them but the health reads "no data yet"

### Requirement: Group totals
Each group header SHALL show how many of its entries are built out of the group's size, and the group's total access count.

#### Scenario: Today's providers
- **WHEN** the screen loads with today's providers and no sessions
- **THEN** the pension group header reads 1 of 9 built, the study-fund group 2 of 11, the other-sites group 1 of 1
