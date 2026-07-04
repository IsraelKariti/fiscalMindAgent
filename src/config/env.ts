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
});

export const env = EnvSchema.parse(process.env);
