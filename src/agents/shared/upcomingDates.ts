import { chagLabel } from './jewishHolidays.js';

const HEBREW_WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** Israel's weekend, in JS Date.getUTCDay() terms (matches sendAtGuard). */
const FRIDAY = 5;
const SATURDAY = 6;

const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's calendar date in `timeZone`, re-encoded as a UTC-midnight timestamp so day stepping is pure date arithmetic (no DST effects). */
function localDateAsUtcMs(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'));
}

/**
 * A dated calendar for the scheduling prompts ({{upcoming_dates}}): one line
 * per day, ISO date + Hebrew weekday, with today and weekend days marked.
 * LLMs reliably copy absolute dates but miscompute relative ones ("next
 * Sunday" came out as Monday in a live draft) — this list turns every
 * relative phrase the model must schedule around into a lookup instead of
 * arithmetic. Six weeks covers the prompts' pacing rules (reminder backoff
 * caps at ~2 weeks) and typical client promises.
 */
export function formatUpcomingDates(now: Date, timeZone: string, days = 42): string {
  const start = localDateAsUtcMs(now, timeZone);
  const lines: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * DAY_MS);
    const weekday = d.getUTCDay();
    const iso = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const marks: string[] = [];
    if (i === 0) marks.push('היום');
    if (weekday === FRIDAY || weekday === SATURDAY) marks.push('סוף שבוע');
    const chag = chagLabel(iso);
    if (chag) marks.push(chag);
    lines.push(`${iso} יום ${HEBREW_WEEKDAYS[weekday]}${marks.length > 0 ? ` — ${marks.join(', ')}` : ''}`);
  }
  return lines.join('\n');
}
