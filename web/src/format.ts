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

/** Compact USD amount for LLM costs, which range from fractions of a cent upward. */
export function formatUsd(value: number): string {
  if (value > 0 && value < 0.0001) return '<$0.0001';
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}
