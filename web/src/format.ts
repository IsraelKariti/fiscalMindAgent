/** UI locale for dates and times — the accountant side is Hebrew-first. */
export const LOCALE = 'he-IL';

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
