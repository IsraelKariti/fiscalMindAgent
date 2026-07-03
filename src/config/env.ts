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
  // Dashboard login. Optional so the worker/CLI can run without them; the
  // dashboard login endpoint rejects requests until DASHBOARD_PASSWORD is set.
  DASHBOARD_PASSWORD: z.string().min(8).optional(),
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
