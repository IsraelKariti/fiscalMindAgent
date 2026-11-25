import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * The browser runner's OWN environment. It deliberately does NOT import
 * src/config/env.ts: this process renders hostile external web content, so it
 * must never parse — or have sitting in process.env for Chrome's subprocesses
 * to inherit — the platform's secrets (DATABASE_URL, SECRET_ENC_KEY, API keys).
 *
 * The root .env is read WITHOUT mutating process.env (dev convenience); real
 * process.env wins (prod, where the container is given only these vars).
 */
const fileEnv: Record<string, string> = {};
loadDotenv({ processEnv: fileEnv, quiet: true });

const RunnerEnvSchema = z.object({
  // Port the runner's HTTP API listens on.
  BROWSER_RUNNER_PORT: z.coerce.number().int().positive().default(4100),
  // Shared bearer token the worker authenticates with. The only credential this
  // process holds — it grants nothing beyond driving this runner. Optional here
  // so scripts can import launch/providers directly (documentFetchSmoke); the HTTP
  // server refuses to start without it.
  BROWSER_RUNNER_TOKEN: z.string().min(16).optional(),
  // Worker-side OTP-wait TTL; the runner closes orphaned browsers a grace
  // period after this as a backstop (the worker's timer is the primary one).
  DOCUMENT_FETCH_SESSION_TTL_MS: z.coerce.number().int().positive().default(600_000),
  // When set, providers save step screenshots here (dev only).
  DOCUMENT_FETCH_DEBUG_DIR: z.string().min(1).optional(),
});

// DOCUMENT_FETCH_* was TAX_FETCH_* until 2026-11-25: the old name still counts
// (same rule as src/config/env.ts, kept inline so the runner imports nothing of the platform).
const pick = (source: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(
    Object.keys(RunnerEnvSchema.shape)
      .map((key) => [key, source[key] ?? source[key.replace(/^DOCUMENT_FETCH_/, 'TAX_FETCH_')]])
      .filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

export const runnerEnv = RunnerEnvSchema.parse({ ...pick(fileEnv), ...pick(process.env) });
