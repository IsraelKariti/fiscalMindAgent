import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  GMAIL_OAUTH_CLIENT_ID: z.string().min(1),
  GMAIL_OAUTH_CLIENT_SECRET: z.string().min(1),
  GMAIL_TOKEN_PATH: z.string().min(1).default('./secrets/gmail_token.json'),
  GMAIL_PUBSUB_TOPIC: z.string().min(1),
  PUBSUB_PUSH_AUDIENCE: z.string().min(1),
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
  // Web-application OAuth client (Google Cloud Console) for dashboard sign-in
  // and the connect-Gmail flow. Optional so the worker/CLI can run without
  // them; the auth endpoints return 503 until both are set.
  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  // Signs the dashboard session cookie. If unset, a random per-process secret
  // is used (sessions are invalidated whenever the web process restarts).
  DASHBOARD_SESSION_SECRET: z.string().min(16).optional(),
  // AES-256-GCM key (64 hex chars) encrypting Gmail refresh tokens in Postgres.
  // Optional at boot so worker/CLI paths that never touch tokens still run;
  // enforced at use in src/util/crypto.ts.
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'must be 64 hex characters (32 bytes)')
    .optional(),
});

export const env = EnvSchema.parse(process.env);
