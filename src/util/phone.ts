/**
 * Normalizes user-entered phone numbers to E.164 for WhatsApp routing.
 * Accepts international input ("+972 50-123 4567") and Israeli local input
 * ("050-1234567" → "+972501234567"). Returns null when the input can't be a
 * valid number.
 */
export function normalizeE164(input: string): string | null {
  const stripped = input.replace(/[\s\-().]/g, '');
  let candidate: string;
  if (stripped.startsWith('+')) {
    candidate = stripped;
  } else if (stripped.startsWith('00')) {
    candidate = `+${stripped.slice(2)}`;
  } else if (stripped.startsWith('0')) {
    // Local Israeli format: drop the trunk 0, prepend the country code.
    candidate = `+972${stripped.slice(1)}`;
  } else {
    return null;
  }
  return /^\+[1-9]\d{6,14}$/.test(candidate) ? candidate : null;
}
