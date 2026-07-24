const SENSITIVE_KEY_RE = /token|secret|password|passwd|credential|api[-_]?key|authorization|cookie|otp|user_code|id_number/i;
const MAX_STRING = 300;
const MAX_ARRAY = 20;
const MAX_DEPTH = 4;

/**
 * Deep-copies a request body (or any JSON-ish value) for storage in
 * audit_events.detail: secret-looking keys are masked, long strings truncated
 * (prompt templates can be huge), arrays capped, depth bounded. Pure (no I/O
 * imports) so tests/audit.test.ts can cover it without a database.
 */
export function redactForAudit(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}… [${value.length} chars]` : value;
  }
  if (typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) {
    const capped = value.slice(0, MAX_ARRAY).map((v) => redactForAudit(v, depth + 1));
    if (value.length > MAX_ARRAY) capped.push(`… ${value.length - MAX_ARRAY} more`);
    return capped;
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? '[redacted]' : redactForAudit(v, depth + 1);
  }
  return out;
}
