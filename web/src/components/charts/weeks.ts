import { LOCALE } from '../../format';

/** How many weeks of history the weekly charts show. */
export const WEEKS = 8;

export function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Monday-based
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
}

/** Monday of each of the last WEEKS weeks, oldest first, current week last. */
export function weekStarts(): Date[] {
  const monday = startOfWeek(new Date());
  const starts: Date[] = [];
  for (let k = WEEKS - 1; k >= 0; k--) {
    starts.push(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * k));
  }
  return starts;
}

export function weekLabel(d: Date): string {
  return d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' });
}
