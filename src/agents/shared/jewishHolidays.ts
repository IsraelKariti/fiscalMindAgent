import { HebrewCalendar, flags } from '@hebcal/core';

/**
 * Chag (yom tov) and erev-chag dates on the Israel calendar, for the send
 * guard and the scheduling prompts. Blocked days are the CHAG-flagged events
 * (Rosh Hashana I-II, Yom Kippur, Sukkot I, Shmini Atzeret, Pesach I and VII,
 * Shavuot — one-day yom tov, il mode) plus the day before each, mirroring how
 * Friday is treated relative to Saturday. Chol hamoed, Chanukah, Purim and
 * other minor days stay open. Everything is computed locally by @hebcal/core,
 * so the calendar never goes stale and needs no network.
 */

const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

const isoFromUtcMs = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** "YYYY-MM-DD" → Hebrew label; erev entries never overwrite chag entries. */
const yearCache = new Map<number, Map<string, string>>();

function labelsForYear(year: number): Map<string, string> {
  const cached = yearCache.get(year);
  if (cached) return cached;
  const labels = new Map<string, string>();
  // No chag falls on Jan 1 (the earliest is Pesach, in March/April), so a
  // single Gregorian year always contains each chag together with its erev.
  const events = HebrewCalendar.calendar({ year, il: true });
  for (const ev of events) {
    if (!(ev.getFlags() & flags.CHAG)) continue;
    const greg = ev.getDate().greg();
    const dayUtc = Date.UTC(greg.getFullYear(), greg.getMonth(), greg.getDate());
    const name = ev.render('he-x-NoNikud');
    labels.set(isoFromUtcMs(dayUtc), `חג — ${name}`);
    const erevIso = isoFromUtcMs(dayUtc - DAY_MS);
    if (!labels.has(erevIso)) labels.set(erevIso, `ערב חג — ${name}`);
  }
  yearCache.set(year, labels);
  return labels;
}

/**
 * Hebrew label ("חג — …" / "ערב חג — …") when the "YYYY-MM-DD" date is a chag
 * or erev chag, null otherwise. Non-null means the day is blocked for
 * proactive sends, exactly like Friday/Saturday.
 */
export function chagLabel(isoDate: string): string | null {
  const year = Number(isoDate.slice(0, 4));
  if (!Number.isInteger(year)) return null;
  return labelsForYear(year).get(isoDate) ?? null;
}
