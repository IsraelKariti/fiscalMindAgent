## Purpose

Governs the outbound route of a website fetch: how a fetch provider can be sent through an outbound proxy with a fixed address in Israel, how that proxy is configured, how a session records the route it used, and how the owner verifies the route without a client.

## ADDED Requirements

### Requirement: A fetch provider can be routed through a configured outbound proxy
The platform SHALL support one outbound proxy per fetch provider, configured by an environment variable named after the provider id in upper case (`DOCUMENT_FETCH_PROXY_<PROVIDER>`, for example `DOCUMENT_FETCH_PROXY_PHOENIX`) whose value is a proxy URL of the form `http://user:password@host:port`. When a session starts for a provider that has a configured proxy, every request the session's browser makes (pages, scripts, styles, downloads, every frame) SHALL go through that proxy with the configured credentials. A provider without a configured variable SHALL launch exactly as before, with no proxy. The variable SHALL be read at session start, so changing it needs no code change and no rebuild of the browser image. A malformed value (not a URL, missing host) SHALL fail the session's login with an error naming the variable, never silently fall back to a direct connection.

#### Scenario: Phoenix session goes through the proxy
- **WHEN** `DOCUMENT_FETCH_PROXY_PHOENIX` is set to a valid proxy URL and a Phoenix session starts
- **THEN** the login page, its login script from the second Phoenix host, the code screen and every PDF download are requested through that proxy, and Phoenix sees the proxy's exit address

#### Scenario: Other providers stay direct
- **WHEN** only `DOCUMENT_FETCH_PROXY_PHOENIX` is set and a Harel session starts
- **THEN** the Harel browser connects directly, as today, with no proxy setting

#### Scenario: Proxy variable is malformed
- **WHEN** `DOCUMENT_FETCH_PROXY_PHOENIX` holds a value that is not a proxy URL and a Phoenix session starts
- **THEN** the login fails at once with an error naming `DOCUMENT_FETCH_PROXY_PHOENIX`, the client receives the canned login-failed message, and no request leaves the browser directly

### Requirement: Proxy settings reach the session container as secrets and never leak
In container mode the worker SHALL pass every configured `DOCUMENT_FETCH_PROXY_<PROVIDER>` variable to the session container as a secure environment value, and nothing else about the proxy. The proxy password SHALL never appear in logs, audit events, evidence records, error messages or API responses; wherever the route is reported, only the proxy host (and port) SHALL be shown.

#### Scenario: Container receives the variable
- **WHEN** the worker provisions a session container while `DOCUMENT_FETCH_PROXY_PHOENIX` is set
- **THEN** the container has that variable with the same value as a secure value, and a container listing in Azure does not show the value

#### Scenario: Login error mentions the proxy
- **WHEN** the proxy refuses the credentials and the login fails
- **THEN** the recorded error names the proxy host and the refusal, and contains neither the username nor the password

### Requirement: Every session records the route it used
The first evidence record of a session and the worker's session-start log line SHALL state the route: `direct`, or `proxy` with the proxy host. The admin evidence gallery SHALL show the route on the session summary, so an admin reading a failed login sees at once whether the fetch left through the proxy.

#### Scenario: Gallery shows the proxy route
- **WHEN** an admin opens the evidence of a Phoenix session that ran with the proxy configured
- **THEN** the session summary reads "egress: proxy brd.superproxy.io:<port the zone shows>" (host and port only)

#### Scenario: Gallery shows a direct route
- **WHEN** an admin opens the evidence of a session of a provider with no configured proxy
- **THEN** the session summary reads "egress: direct"

### Requirement: The owner can verify a provider's route without a client
A command-line check, run with a provider id, SHALL launch the runner's browser exactly as a session of that provider would (same proxy, same flags), and SHALL print the exit address the internet sees and the HTTP status of that provider's check URL (for Phoenix: the login script on the second Phoenix host). It SHALL exit non-zero when the status is not 200, so it can be used as a go/no-go check after the proxy is set up and after each deploy. It SHALL run on the owner's machine against the root `.env`; checking the production value means putting that value in the local `.env` for the run (the production worker image has no Chrome).

#### Scenario: Check passes with the proxy
- **WHEN** the owner runs the check for `phoenix` with a working Israeli ISP proxy configured
- **THEN** it prints the proxy's exit address, prints status 200 for the Phoenix login script, and exits 0

#### Scenario: Check fails with a dead proxy
- **WHEN** the owner runs the check for `phoenix` with a proxy whose credentials were refused or whose address no longer answers
- **THEN** it prints the proxy's refusal or connection error instead of an exit address, and exits non-zero
