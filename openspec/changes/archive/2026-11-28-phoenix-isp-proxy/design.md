## Context

See proposal.md — Why. Facts the design rests on (observed 2026-11-27/28):

- The runner (`src/browserRunner/`) launches Chrome once per session in `launchInteractivePage()` with fixed flags (`--disable-quic`, no automation banner), headful under Xvfb in the `fiscalmind-browser` image. The launcher takes no arguments; `server.ts` calls it before `provider.startLogin`.
- The runner has its own env parser (`src/browserRunner/env.ts`) that deliberately knows nothing of the platform's secrets; it reads the root `.env` in dev and `process.env` in the container. The worker gives the container only `BROWSER_RUNNER_TOKEN` and `DOCUMENT_FETCH_SESSION_TTL_MS` (`aciSessionPool.ts`).
- Evidence: each step produces a `StepRecord` (`src/browserRunner/stepEvidence.ts`) that the worker pulls and stores in blob storage; the admin gallery (`web/src/components/admin/AdminFetchEvidence.tsx`) shows a session summary (provider, status, tax year, error) and the step cards.
- The `aci-sessions` subnet has no network security group, so outbound TCP to the proxy port is open; the worker and the containers share the NAT address 20.217.204.24.
- Phoenix's blocked resource is `https://auth0-login.fnx-public.com/index.js` (404 from Azure, 200 from an Israeli ISP address). Playwright supports `proxy: { server, username, password, bypass }` on `chromium.launch`; Chrome then sends every request, including sub-resources and downloads, through it, and Playwright answers the proxy's 407 challenge with the credentials.
- Bright Data ISP zone access: host `brd.superproxy.io`, the port the zone page shows (44445 for the zone created 2026-11-28) (HTTP), username `brd-customer-<account>-zone-<zone>` (with `-ip-<addr>` to pin one of the zone's allocated addresses), password = the zone password. Credentials, not IP allow-listing, because the worker and the container egress addresses are shared and we must not open the zone to the whole NAT address.

## Goals / Non-Goals

**Goals:**
- Route one provider (Phoenix) through a fixed Israeli ISP address with a config-only change per environment, and leave every other provider's launch byte-for-byte as today.
- Keep the runner's secret surface minimal: it holds only what it needs for its own egress; the worker never logs or stores the proxy credentials.
- Make a wrong route visible at the first look: the route on the session summary, the check script before any client is involved.

**Non-Goals:**
- Proxy rotation, failover between proxies, or a second route for the tax authority or any other provider.
- A UI for proxy settings or a database table of routes (env is the only source).
- Making the mock fetch (`DOCUMENT_FETCH_MOCK=true`) use a proxy — the mock never opens Chrome.

## Decisions

1. **Per-provider env variable, not one global proxy.** `DOCUMENT_FETCH_PROXY_<PROVIDER>` keeps the other five providers direct (they work and a proxy would add cost and a new failure point) and lets a future provider be routed with a settings change only. Alternative considered: a single `DOCUMENT_FETCH_PROXY` plus a list of provider ids — two variables that must agree; rejected.

2. **The proxy option is built in the runner, from the runner's own env, at launch time.** `launchInteractivePage(providerId)` reads `runnerEnv.proxyFor(providerId)` and adds `proxy: { server: "http://host:port", username, password }` when set. The worker only forwards the variables. Alternative considered: the worker sends the proxy in the `POST /sessions` body — that would put a secret on the runner API and in `llm`-independent request logs; rejected. The runner env parser gains a dynamic pick: every `process.env`/`.env` key matching `/^DOCUMENT_FETCH_PROXY_[A-Z0-9_]+$/` is parsed as a URL at startup; a malformed one is reported at session start for that provider (an error naming the variable, thrown before `launch`), so the runner still boots for the other providers.

3. **Chrome receives the proxy through Playwright's `proxy` launch option, with `bypass: "<-loopback>"` left default.** Playwright passes `--proxy-server` and handles the 407 authentication for every request, including PDF downloads and iframes; no extension, no `page.route`. `--disable-quic` stays (the proxy is HTTP CONNECT over TCP anyway). Locale/timezone stay `he-IL` / `Asia/Jerusalem`, which now match the exit address.

4. **Bright Data ISP zone with one allocated Israeli address, pinned in the username.** The username carries `-ip-<addr>` so the login, the SMS code and the downloads all leave from the same address (a session-level requirement of the login; Phoenix would otherwise see an address change mid-login). The whole value lives in the one variable: `http://brd-customer-...-zone-...-ip-1.2.3.4:<password>@brd.superproxy.io:<port the zone shows>`. Alternative considered: Bright Data's rotating residential network with a sticky session — cheaper to start but the exit is a home device that can vanish mid-login; rejected per the owner's stability requirement. Alternative considered: a static Israeli address on our own VPS — Phoenix's block is by address reputation (datacenter ranges get 404), so a VPS address would likely be blocked the same way; rejected.

5. **The route is recorded once per session, on the first evidence record, as `egress`.** `StepRecord` gains an optional `egress: { mode: 'direct' } | { mode: 'proxy', host: string }` set by the collector from the launch result (the launcher returns the host it used). The worker stores it with the record (no schema change in storage: records are JSON blobs). The admin gallery summary shows `egress: direct` / `egress: proxy <host:port>` read from the first step's record. The worker's `session container ready` log line and the runner's `start login` log line add the same object. The password and username never leave the runner's launch call. Alternative considered: a column on `document_fetch_sessions` — a migration for one debugging field; rejected.

6. **`scripts/proxyCheck.ts` reuses the runner's launcher.** It imports `launchInteractivePage(providerId)` and a per-provider check URL table (`phoenix` → the login script URL; other providers → their entry URL), opens the check URL, prints `https://api.ipify.org?format=json`'s answer (exit address) and the check URL's status from the response, closes Chrome, and exits 0 only on 200. Runs with `tsx` locally only (reads `.env` through the runner env): the production worker image has no Chrome, so the production value is checked by pasting it into the local `.env` for the run. Alternative considered: a `/proxy-check` endpoint on the runner container — it would need a session container per check and a worker route; rejected for now.

7. **Container env forwarding is generic.** `aciSessionPool.ts` forwards every `DOCUMENT_FETCH_PROXY_*` variable present in the worker env as `secureValue`, so a second routed provider needs no code change there. `src/config/env.ts` allows these keys through its schema (passthrough of that prefix) without parsing their content — the runner is the one that validates them.

## Risks / Trade-offs

- **Bright Data may not offer Israel in the ISP product.** The Israel page lists ISP as a type, the ISP page does not list Israel. If the dashboard offers no Israeli ISP address, the owner picks IPRoyal or Decodo static residential — the code is provider-agnostic (plain HTTP proxy URL), only the value changes.
- **Pinned single address.** If Bright Data retires or rotates the allocated address, logins fail until the variable is updated; the check script makes this a one-minute diagnosis. Rotation/failover is a non-goal.
- **Cost floor.** The ISP pack minimum may be 10 addresses (~$18–35/month) even though one is used.
- **Proxy sees the destination hosts.** HTTPS stays end-to-end between Chrome and Phoenix (CONNECT tunnel), so the proxy sees `my.fnx.co.il`/`auth.fnx.co.il` names and byte counts only; ID number, code and PDFs stay encrypted. Still, the proxy operator is a new party in the path; documented in `docs/agents.md`.
- **Evidence from the proxy session is unchanged**: screenshots, HTML, network log keep working (Playwright records responses regardless of proxy).
- **Mock/CI**: the mock runner never launches Chrome; unit tests cover the env parsing, the launch-option builder (pure function from a proxy URL to the Playwright option, credentials redacted in the returned log object), the container env forwarding, and the evidence summary; the live proxy itself is verified only by the check script and a real Phoenix session (owner).

## Assumptions recorded

- The check script runs on the owner's machine only; the production value is checked by pasting it into the local `.env` (decision 6).
- The Bright Data username pins the exit address with `-ip-<addr>` even when the zone holds one address; harmless, and it keeps the login on one address if more are ever allocated (decision 4).
