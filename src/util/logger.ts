type LogFields = Record<string, unknown>;

function format(level: string, message: string, fields?: LogFields): string {
  const suffix = fields ? ` ${JSON.stringify(fields)}` : '';
  return `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}${suffix}`;
}

export const logger = {
  info(message: string, fields?: LogFields): void {
    console.log(format('info', message, fields));
  },
  warn(message: string, fields?: LogFields): void {
    console.warn(format('warn', message, fields));
  },
  error(message: string, err?: unknown, fields?: LogFields): void {
    console.error(format('error', message, fields), err instanceof Error ? err.stack ?? err.message : err);
  },
  debug(message: string, fields?: LogFields): void {
    if (process.env.DEBUG) console.debug(format('debug', message, fields));
  },
};
