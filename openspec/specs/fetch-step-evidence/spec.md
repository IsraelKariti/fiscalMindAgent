# fetch-step-evidence Specification

## Purpose

What the platform records at every step of a website fetch run on a client's behalf (screenshot, page HTML, full page snapshot, page log), how long it keeps that evidence, and how an admin reaches it afterwards — so a site the operator can only ever see through a live client session can still be studied after the session is gone.

## Requirements

### Requirement: Every fetch step leaves evidence
At every step of a website fetch (the points where a provider today saves a dev-only debug screenshot: page loaded, credentials filled, code screen, code filled, logged in, reports page, filters set, results, and the moment of a failure), the browser runner SHALL record a step evidence item consisting of:
- a full-page screenshot (PNG) of the page as it is at that moment;
- the serialized HTML of the page as it is at that moment, for the main frame and for every child frame the runner can read (the live DOM, not the originally downloaded source);
- a complete snapshot of the page with its resources (MHTML), so the page can be opened offline in a browser as it looked;
- a step record (JSON) holding the step name, the ordinal of the step within the session, the time, the page URL and title, the URL of every frame, the browser console messages and the failed or error (status 400 or above) HTTP responses observed since the previous step.

Evidence SHALL be recorded for successful steps and failed steps alike, in production and locally. Recording evidence SHALL never fail the step: when one part cannot be captured (page closed, capture timed out, part over its size limit) the other parts SHALL still be recorded and the record SHALL say which part is missing and why.

#### Scenario: Successful login leaves evidence
- **WHEN** a Menora fetch logs in, reaches the reports page and downloads a report without error
- **THEN** the session's evidence holds one item per step the provider passed (login page, credentials filled, code screen, code filled, logged in, reports page, filters, results), each with a screenshot, HTML, snapshot and record

#### Scenario: Failed step leaves evidence of the failure
- **WHEN** the year list on a site does not offer the requested year and the download step fails
- **THEN** the evidence holds the items of every step before the failure plus a final item named after the failing stage, taken at the moment of the failure, and the record of that item carries the error text

#### Scenario: One part cannot be captured
- **WHEN** the snapshot capture of a step times out while the screenshot succeeds
- **THEN** the step item is recorded with its screenshot, HTML and record, the record names the snapshot as missing with the reason, and the fetch continues unaffected

### Requirement: Evidence survives the runner
The evidence SHALL be moved out of the runner into the platform's own storage before the runner's container or browser goes away: after every step the worker SHALL pull the items recorded since its previous pull, and after a failed step it SHALL pull before closing the session or deleting the container. Evidence SHALL be stored per session, so everything of one session is found from the session id alone, and SHALL be readable without any database row pointing at it. Pulling or storing evidence SHALL never change the outcome of the fetch; a pull that fails SHALL be logged and the fetch SHALL proceed.

#### Scenario: Failure right after login
- **WHEN** the login step fails in production (the container is deleted on failure)
- **THEN** the evidence of the login page, the filled form and the failure moment is in platform storage before the container is deleted

#### Scenario: Download completes
- **WHEN** the download step completes and the runner closes the browser
- **THEN** every item recorded during the download step is in platform storage

#### Scenario: Evidence pull fails
- **WHEN** the worker cannot reach the runner's evidence route after a successful code submission
- **THEN** the session continues to the download step, the delivery happens as usual and the missing pull is logged

### Requirement: Evidence is kept for a retention window
The platform SHALL keep a session's evidence for a configurable number of days (`TAX_FETCH_DEBUG_RETENTION_DAYS`), defaulting to 14, and the existing daily cleanup SHALL delete only evidence older than that window. Evidence of successful sessions SHALL be kept for the same window as evidence of failed sessions. The kill-switch exemption of the cleanup SHALL still apply.

#### Scenario: Old evidence removed
- **WHEN** the daily cleanup runs and a session's evidence is 15 days old with the default retention
- **THEN** that session's evidence is deleted and a session's evidence from 10 days ago is kept

#### Scenario: Successful session kept
- **WHEN** a session delivered its documents 10 days ago
- **THEN** its evidence is still available

### Requirement: Admins can open a session's evidence gallery
An admin SHALL be able to open the evidence gallery of a fetch session: the steps of the session in order, each showing its screenshot, and for each step a way to view the HTML copy, download the HTML copy, download the snapshot and view the step record (URL, title, time, console messages, error responses, missing parts). A step whose evidence is incomplete SHALL still appear with what was captured. A session with no evidence (older than the retention window, a session that never reached a login, or evidence never pulled) SHALL show a short "no evidence kept" note.

The gallery SHALL be reachable from the site-access screen (the last access of each built card links to its session's gallery) and from any trace step whose target is the fetch session (see `conversation-trace`). The gallery SHALL be visible only to an admin; an accountant's session, a staff viewer and the monday embed SHALL NOT reach it or its data.

#### Scenario: Admin opens the gallery of a failed session
- **WHEN** an admin opens the gallery of a session that failed at the download step
- **THEN** the admin sees each step's screenshot in order, ending with the failure screenshot, and can open the HTML copy and the record of the step where the year list was read

#### Scenario: Gallery from the site-access card
- **WHEN** an admin presses the last-access line of the Menora pension card
- **THEN** the gallery of that session opens

#### Scenario: Session without evidence
- **WHEN** an admin opens the gallery of a session that expired before any login
- **THEN** the gallery shows "no evidence kept" and nothing else

#### Scenario: Non-admin requests the gallery data
- **WHEN** a signed-in accountant requests the evidence list or any evidence file of a session
- **THEN** the request is refused like every other admin route and no bytes are sent

### Requirement: Evidence files are served safely
Evidence SHALL be streamed through the server under the admin's session; no public or signed storage link SHALL be issued. The screenshot SHALL be served inline as an image. The HTML copy SHALL be viewable only inside a sandbox: the server SHALL send it with a content-security-policy that sandboxes the document and forbids script execution, so nothing from the external site can run on the platform's origin; the HTML copy and the snapshot SHALL also be downloadable as files. Every evidence response SHALL forbid content-type sniffing. The server SHALL answer "not found" for an evidence path that is not one of the session's recorded items.

#### Scenario: HTML copy viewed in the gallery
- **WHEN** an admin views a step's HTML copy
- **THEN** it is shown inside a sandboxed frame with scripts disabled, and no script from the copied page runs

#### Scenario: Snapshot download
- **WHEN** an admin downloads a step's snapshot
- **THEN** the browser saves an `.mhtml` file that opens offline as the page looked

#### Scenario: Path outside the session
- **WHEN** a request names an evidence file of another session or a path with directory traversal
- **THEN** the server answers "not found" and sends no bytes

### Requirement: The mock fetch leaves synthetic evidence
When the platform runs with the mock fetch (`TAX_FETCH_MOCK=true`), each mock session SHALL leave a small synthetic evidence set (at least two steps with a screenshot, an HTML copy and a record) so the gallery can be checked locally without a browser.

#### Scenario: Mock session gallery
- **WHEN** an admin opens the gallery of a mock session that delivered its mock documents
- **THEN** the gallery shows the synthetic steps with their screenshots and records
