import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  // 'production' in the deployed containers (set in the Dockerfiles) — gates
  // prod-only hard requirements like DASHBOARD_SESSION_SECRET.
  NODE_ENV: z.string().optional(),
  // Deployment name ('sandbox' on the sandbox stack, unset locally and in
  // prod). Surfaced via /api/me so the GUI can show a not-production banner;
  // scripts/seedSandbox.ts also requires it as a refuse-to-run-in-prod latch.
  ENV_NAME: z.string().min(1).optional(),
  // Sandbox fence for outbound messages. Empty (the default everywhere except
  // sandbox) = unrestricted. When set — comma-separated email addresses and
  // phone numbers — any email/WhatsApp send to a recipient NOT on the list is
  // dropped and logged, and the calling flow proceeds as if the message went
  // out, so whole pipelines stay testable against synthetic clients (see
  // src/util/outboundGuard.ts).
  OUTBOUND_ALLOWLIST: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  ACCOUNTANT_TIMEZONE: z.string().min(1).default('America/New_York'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** When set, the worker serves 200 on /healthz here (App Service pings the container port). */
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().optional(),
  // Public base URL of the dashboard/web process (no trailing slash) — used to
  // build OAuth redirect URIs. http://localhost:3000 locally, the real
  // https://app.<domain> in production.
  APP_BASE_URL: z
    .string()
    .url()
    .transform((u) => u.replace(/\/$/, ''))
    .default('http://localhost:3000'),
  // Web-application OAuth client (Google Cloud Console) for dashboard sign-in.
  // Optional so the worker/CLI can run without them; the auth endpoints return
  // 503 until both are set.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  // Google Picker (customer_service agent: pick Sheets/Docs knowledge sources).
  // Browser API key from the same Google Cloud project as the OAuth client;
  // the Picker endpoints return 503 until it is set.
  GOOGLE_PICKER_API_KEY: z.string().min(1).optional(),
  // The Google Cloud project *number* — ties the Picker to the OAuth client so
  // drive.file grants cover picked files. Optional but recommended.
  GOOGLE_APP_ID: z.string().min(1).optional(),
  // Signs the dashboard session cookie. REQUIRED in production (the web
  // process refuses to start without it — see src/api/auth.ts); in dev a
  // random per-process secret is used and sessions reset on every restart.
  DASHBOARD_SESSION_SECRET: z.string().min(16).optional(),
  // Encrypts secrets at rest in Postgres (client tax-portal credentials,
  // Google/monday OAuth tokens) — AES-256-GCM via src/crypto/secretBox.ts.
  // 32 bytes base64 (`openssl rand -base64 32`). Required: without it the app
  // would silently write plaintext secrets again. Losing it makes the stored
  // credentials unrecoverable (clients/accountants must re-connect).
  SECRET_ENC_KEY: z.string().min(40),
  // Comma-separated emails. NOT an authorization list: admin access lives in
  // users.is_admin (migration 033) and is managed from the admin panel. This
  // var only (a) seeds the first admins while the DB has none, (b) is the
  // alert-recipient fallback before that seed runs, (c) supplies the public
  // contact address shown to accountants.
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  // Recipient of admin review alerts (048): "a message awaits your approval"
  // emails for review-mode agent instances. Unset = alerts are skipped (the
  // review hold itself never depends on it).
  ADMIN_ALERT_EMAIL: z.string().email().optional(),
  // Resend (resend.com): sends agent mail and delivers inbound mail for
  // AGENT_EMAIL_DOMAIN to /webhooks/resend.
  RESEND_API_KEY: z.string().min(1),
  // Signing secret of the Resend webhook endpoint (Svix). Optional so the
  // worker/CLI can run without it; the webhook route returns 503 until set.
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Domain agent mailboxes are allocated on: <local-part>@AGENT_EMAIL_DOMAIN.
  // A subdomain of the root domain: the root's MX records belong to Google
  // Workspace (admin@ and other human mail), so Resend receiving must live on
  // a subdomain with its own MX. Must match migration 029's stored addresses.
  AGENT_EMAIL_DOMAIN: z.string().min(1).default('agents.fiscalmind.app'),
  // Twilio (twilio.com): sends/receives WhatsApp messages for the per-accountant
  // sender numbers (wa_senders). All optional — WhatsApp features return 503 /
  // stay disabled until set.
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  // Exact public URL Twilio posts inbound messages to — signature validation
  // covers the full URL, so this must match what's configured on the sender
  // (in dev: https://<NGROK_DOMAIN>/webhooks/twilio).
  TWILIO_WEBHOOK_URL: z.string().url().optional(),
  // WhatsApp Business Account all the platform's senders live under (Twilio
  // console -> Messaging -> WhatsApp senders). Only needed for the admin
  // panel's "buy number" auto-provisioning; assigning manually registered
  // numbers works without it.
  TWILIO_WABA_ID: z.string().min(1).optional(),
  // Display name auto-provisioned senders register with on WhatsApp — must
  // follow Meta's display-name guidelines and match the WABA's business.
  TWILIO_WA_SENDER_NAME: z.string().min(1).default('FiscalMind'),
  // Meta app + Embedded Signup configuration id (Meta developer console ->
  // your app -> WhatsApp -> Embedded Signup). Powers the "connect your own
  // WABA" popup in Settings -> Integrations; without them the card still
  // offers manual WABA-id entry.
  META_APP_ID: z.string().min(1).optional(),
  META_ES_CONFIG_ID: z.string().min(1).optional(),
  // monday.com app (Developer Center -> your app -> Basic Information): the
  // Client Secret that signs the widget iframe's sessionToken JWTs. Optional —
  // the /api/monday endpoints return 503 until it is set.
  MONDAY_CLIENT_SECRET: z.string().min(1).optional(),
  // Client ID of the same monday app — needed (with the secret) only for the
  // OAuth connect flow that stores a server-side monday API token per
  // accountant (customer_service agent). Optional — the connect endpoints
  // return 503 until both are set.
  MONDAY_CLIENT_ID: z.string().min(1).optional(),
  // Azure Blob Storage holding client document files. The default is the
  // well-known Azurite dev connection (docker-compose `azurite` service);
  // production sets the real storage-account connection string.
  AZURE_STORAGE_CONNECTION_STRING: z.string().min(1).default('UseDevelopmentStorage=true'),
  AZURE_STORAGE_CONTAINER: z.string().min(1).default('client-documents'),
  // Signs the short-lived public media URLs Twilio fetches when the agent sends
  // a document over WhatsApp (the blob container is private). Optional — media
  // sending throws a clear error until it is set.
  MEDIA_SIGNING_SECRET: z.string().min(16).optional(),
  // Tax-authority document fetch (browser automation). When true, the mock
  // provider is used instead of driving a real browser — every real login sends
  // an OTP email to a real citizen, so iterate on the mock. Default false.
  TAX_FETCH_MOCK: z.coerce.boolean().default(false),
  // How long a live browser session waits for the client's OTP before it is
  // closed and the fetch is marked expired (ms). Default 10 minutes.
  TAX_FETCH_SESSION_TTL_MS: z.coerce.number().int().positive().default(600_000),
  // Browser-runner sidecar (src/browserRunner.ts): the worker never drives
  // Chrome itself — real fetches go over HTTP to this separate process, which
  // holds no platform secrets, so a browser compromise can't reach them.
  // (TAX_FETCH_DEBUG_DIR is read by the runner, not here.)
  BROWSER_RUNNER_URL: z
    .string()
    .url()
    .transform((u) => u.replace(/\/$/, ''))
    .default('http://localhost:4100'),
  // Shared bearer token for the runner's API. Optional — real (non-mock)
  // fetches fail with a clear error until it is set; the mock needs neither.
  BROWSER_RUNNER_TOKEN: z.string().min(16).optional(),
  // Where real fetches run. 'static': one long-lived runner at
  // BROWSER_RUNNER_URL (local dev). 'aci': a throwaway Azure Container
  // Instance per session in the Israel Central egress subnet — the tax
  // authority drops non-Israeli source IPs, so browsers must exit through the
  // verified NAT IP there (aciSessionPool.ts).
  TAX_FETCH_RUNNER_MODE: z.enum(['static', 'aci']).default('static'),
  // aci mode only; all validated together on first use (aciSessionPool.ts).
  TAX_FETCH_ACI_SUBSCRIPTION_ID: z.string().optional(),
  TAX_FETCH_ACI_RESOURCE_GROUP: z.string().optional(),
  TAX_FETCH_ACI_SUBNET_ID: z.string().optional(),
  TAX_FETCH_ACI_IMAGE: z.string().optional(),
  TAX_FETCH_ACI_ACR_IDENTITY_ID: z.string().optional(),
  TAX_FETCH_ACI_LOCATION: z.string().default('israelcentral'),
  // Cap on fetches in flight. Unset: 3 in static mode (real Chromes on one
  // small runner), 100 in aci mode (each session is its own container; the
  // effective bound is the ACI container-group quota).
  TAX_FETCH_MAX_LIVE_SESSIONS: z.coerce.number().int().positive().optional(),
  // How long failed-fetch evidence screenshots (debug/taxfetch/ blobs) are
  // kept before the daily cleanup job deletes them. Default 14 days.
  TAX_FETCH_DEBUG_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
});

export const env = EnvSchema.parse(process.env);
