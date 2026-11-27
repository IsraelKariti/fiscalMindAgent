## Why

Every Phoenix fetch from production fails at login: the Auth0 login page loads, but its form script (`https://auth0-login.fnx-public.com/index.js`, CloudFront + S3) answers 404 to the production outbound address (Azure Israel Central NAT, 20.217.204.24, checked from the worker on 2026-11-27), so the page shows only "JavaScript has been disabled" and the ID field never appears. The same script answers 200 from an Israeli home connection, so the block is by source address, not by browser behaviour. The fetch needs to reach Phoenix from an Israeli ISP address.

## What Changes

- The browser runner can launch Chrome behind an outbound HTTP proxy, chosen per provider: a provider with a configured proxy gets `proxy: { server, username, password }` on the Playwright launch; every other provider launches exactly as today (no proxy).
- The proxy is configured by environment only: one variable per provider, `DOCUMENT_FETCH_PROXY_<PROVIDER>` (upper-case provider id, e.g. `DOCUMENT_FETCH_PROXY_PHOENIX`), holding a proxy URL `http://user:password@host:port`. The worker passes the configured variables to the session container as secure values; the static (dev) runner reads them from the root `.env`.
- The Phoenix provider is routed through a Bright Data ISP (static residential) proxy located in Israel. The chosen Bright Data product is the ISP zone, not the rotating residential network, so the exit address is fixed and stays the same across the login, the SMS code and the downloads.
- Each session records which egress it used: the runner's first evidence record of a session (and the worker's "session container ready" log line) carries `egress: proxy` with the proxy host, or `egress: direct`. Credentials never appear in records, logs or evidence.
- A small owner script, `npm run proxy:check -- <provider>`, launches the runner's Chrome with that provider's proxy and prints the exit address and the HTTP status of the provider's blocked resource (for Phoenix, the login script), so the proxy can be verified before and after a deploy without a client.
- `.env.example` documents the variable and the Bright Data setup steps (ISP zone, Israel, one allocated IP, zone credentials, host `brd.superproxy.io`, the port the zone page shows).

Out of scope: an admin screen for proxy settings, proxying other providers (they work from Azure today), proxy rotation or failover, and the Bright Data account itself (the owner creates the account, the ISP zone and the Israel IP by hand).

## Capabilities

### New Capabilities
- `fetch-egress-proxy`: per-provider outbound proxy for website fetches — how a provider's proxy is configured, how the runner applies it to Chrome, how the session records its egress, and how the owner verifies it.

### Modified Capabilities
- `phoenix-fetch`: the Phoenix login SHALL run through the configured Israeli ISP proxy; without a configured proxy the fetch is still attempted but the login-failed outcome now points the admin at the egress (the evidence record shows `egress: direct`).

## Impact

- `src/browserRunner/env.ts` — parse `DOCUMENT_FETCH_PROXY_*` (never logged); `src/browserRunner/launch.ts` — `launchInteractivePage(providerId)` adds the `proxy` launch option; `src/browserRunner/server.ts` — passes the provider id to the launcher and the egress to the first evidence record.
- `src/config/env.ts` — the worker accepts the same variables; `src/agents/declarationOfCapital/documentFetch/aciSessionPool.ts` — forwards each configured one as a `secureValue` to the container.
- `src/agents/declarationOfCapital/documentFetch/stepEvidence.ts` / `src/browserRunner/stepEvidence.ts` — the step record gains an optional `egress` field; the admin gallery shows it on the step card.
- `scripts/proxyCheck.ts` + `package.json` script `proxy:check`; `.env.example`; `docs/agents.md` (fetch section).
- Production: the `aci-sessions` subnet has no network security group (checked 2026-11-28), so outbound to `brd.superproxy.io` on the zone port needs no infra change. The worker app settings gain `DOCUMENT_FETCH_PROXY_PHOENIX` (owner, after the Bright Data zone exists). Cost: Bright Data ISP addresses are billed per address per month (list price about $1.8–$3.5 per IP; the dashboard's minimum pack may be larger than one).
- No database migration.
