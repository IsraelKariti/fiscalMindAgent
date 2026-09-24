/**
 * Bounded retry for fetching and storing a file a client sent (openspec
 * `inbound-files`). Pure: the pause is injectable so tests run without waiting.
 */

export interface AttemptsOptions {
  /** Total attempts, including the first (>= 1). */
  attempts: number;
  /** Pause before attempt n+1, in ms; the last entry repeats when shorter than attempts-1. */
  delaysMs: number[];
  sleep?: (ms: number) => Promise<void>;
}

/** Thrown after the last attempt: `cause` is the last error, `attempts` how many ran. */
export class AttemptsExhaustedError extends Error {
  readonly attempts: number;
  constructor(attempts: number, cause: unknown) {
    super(`gave up after ${attempts} attempt${attempts === 1 ? '' : 's'}: ${errorSummary(cause)}`, { cause });
    this.name = 'AttemptsExhaustedError';
    this.attempts = attempts;
  }
}

/** The retry policy of both ingest paths: three attempts, pauses of 2 s then 8 s. */
export const INGEST_ATTEMPTS: AttemptsOptions = { attempts: 3, delaysMs: [2_000, 8_000] };

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `fn` until it resolves or the attempts run out. Every error is retried:
 * the requests these wrap are authenticated calls to the provider's own URLs,
 * so a 4xx is as transient as a network error (signed-url skew, 429).
 */
export async function withAttempts<T>(fn: (attempt: number) => Promise<T>, opts: AttemptsOptions): Promise<{ value: T; attempts: number }> {
  const total = Math.max(1, Math.floor(opts.attempts));
  const sleep = opts.sleep ?? defaultSleep;
  let lastError: unknown;
  for (let attempt = 1; attempt <= total; attempt++) {
    try {
      return { value: await fn(attempt), attempts: attempt };
    } catch (err) {
      lastError = err;
      if (attempt === total) break;
      const delay = opts.delaysMs[Math.min(attempt - 1, opts.delaysMs.length - 1)] ?? 0;
      if (delay > 0) await sleep(delay);
    }
  }
  throw new AttemptsExhaustedError(total, lastError);
}

/**
 * One line for an audit row: the message plus the cause chain, since
 * undici's "fetch failed" carries the real reason (ECONNRESET, DNS...) in
 * `cause`. Capped so a provider HTML error page cannot bloat the row.
 */
export function errorSummary(err: unknown, maxLen = 300): string {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; current !== undefined && current !== null && depth < 4; depth++) {
    if (current instanceof AggregateError) {
      parts.push(`${current.message} [${current.errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; ')}]`);
      current = current.cause;
    } else if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  const line = parts.filter((p) => p !== '').join(' <- ').split('\n')[0] ?? '';
  return line.length > maxLen ? `${line.slice(0, maxLen - 1)}…` : line;
}
