export function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

/** Accepts "YYYY-MM-DD HH:MM", an optional ":SS", and "T" as the date-time separator. */
const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isWallClockDateTime(value: string): boolean {
  return WALL_CLOCK_RE.test(value.trim());
}

/** The instant's wall-clock reading in `timeZone`, re-encoded as a UTC ms timestamp. */
function wallClockAsUtcMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/**
 * Interprets a wall-clock datetime (e.g. "2026-07-06 09:00") in the given IANA
 * timezone and returns the corresponding UTC instant.
 */
export function zonedTimeToUtc(wallClock: string, timeZone: string): Date {
  const m = WALL_CLOCK_RE.exec(wallClock.trim());
  if (!m) throw new Error(`zonedTimeToUtc: invalid wall-clock datetime "${wallClock}"`);
  const [y, mo, d, h, mi, s] = m.slice(1).map((part) => (part == null ? 0 : Number(part)));
  const asUtcMs = Date.UTC(y!, mo! - 1, d!, h!, mi!, s ?? 0);
  // Fixed-point iteration on the zone offset; the second pass corrects first
  // guesses that land on the wrong side of a DST transition.
  let utcMs = asUtcMs;
  for (let i = 0; i < 2; i++) {
    const offsetMs = wallClockAsUtcMs(new Date(utcMs), timeZone) - Math.floor(utcMs / 1000) * 1000;
    utcMs = asUtcMs - offsetMs;
  }
  return new Date(utcMs);
}

export function humanizeDuration(ms: number): string {
  if (ms < 0) return '0 minutes';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
