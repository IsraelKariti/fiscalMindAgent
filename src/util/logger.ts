type LogFields = Record<string, unknown>;

function format(level: string, message: string, fields?: LogFields): string {
  const suffix = fields ? ` ${JSON.stringify(fields)}` : '';
  return `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${suffix}`;
}

/**
 * Stack plus the `cause` chain: undici/fetch wraps the real network failure
 * (ECONNRESET, DNS, TLS...) in a bare "TypeError: fetch failed" whose only
 * useful detail is in `cause`.
 */
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts = [err.stack ?? err.message];
  let cause: unknown = err.cause;
  for (let depth = 0; cause !== undefined && cause !== null && depth < 5; depth++) {
    if (cause instanceof AggregateError) {
      // e.g. undici connect failures across IPv4+IPv6 — the detail is in .errors.
      const inner = cause.errors.map((e) => (e instanceof Error ? e.message : String(e))).join('; ');
      parts.push(`caused by: ${cause.stack ?? cause.message} [${inner}]`);
      cause = cause.cause;
    } else if (cause instanceof Error) {
      parts.push(`caused by: ${cause.stack ?? cause.message}`);
      cause = cause.cause;
    } else {
      parts.push(`caused by: ${JSON.stringify(cause)}`);
      break;
    }
  }
  return parts.join('\n');
}

export const logger = {
  info(message: string, fields?: LogFields): void {
    console.log(format('info', message, fields));
  },
  warn(message: string, fields?: LogFields): void {
    console.warn(format('warn', message, fields));
  },
  error(message: string, err?: unknown, fields?: LogFields): void {
    console.error(format('error', message, fields), err === undefined ? '' : describeError(err));
  },
  debug(message: string, fields?: LogFields): void {
    if (process.env.DEBUG) console.debug(format('debug', message, fields));
  },
};
