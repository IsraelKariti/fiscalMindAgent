import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  ACCOUNTANT_TIMEZONE: z.string().min(1).default('America/New_York'),
  PORT: z.coerce.number().int().positive().default(3000),
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
  // Signs the dashboard session cookie. If unset, a random per-process secret
  // is used (sessions are invalidated whenever the web process restarts).
  DASHBOARD_SESSION_SECRET: z.string().min(16).optional(),
  // Comma-separated emails granted the admin panel + user impersonation.
  ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  // Resend (resend.com): sends agent mail and delivers inbound mail for
  // AGENT_EMAIL_DOMAIN to /webhooks/resend.
  RESEND_API_KEY: z.string().min(1),
  // Signing secret of the Resend webhook endpoint (Svix). Optional so the
  // worker/CLI can run without it; the webhook route returns 503 until set.
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Domain agent mailboxes are allocated on: <local-part>@AGENT_EMAIL_DOMAIN.
  AGENT_EMAIL_DOMAIN: z.string().min(1).default('fiscalmind.app'),
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
});

export const env = EnvSchema.parse(process.env);
