import { parseDay } from './costGraph.js';
import { localDay } from './costSummary.js';

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/**
 * Pure helpers of the admin analytics tab (openspec
 * `discarded-message-analytics`): duration formatting, percentages and the
 * range presets. The figures themselves come from the server
 * (src/analytics/discardedMessages.ts); this module only renders them.
 */

export type AnalyticsPreset = 30 | 90 | 'all';
export const ANALYTICS_PRESETS: AnalyticsPreset[] = [30, 90, 'all'];
export const STORAGE_KEY = 'fm.messageAnalytics.range';

/** The preset's inclusive day range: the last N local calendar days ending today, or the instance's whole life. */
export function analyticsPresetRange(preset: AnalyticsPreset, today: string, firstDay: string | null): { from: string; to: string } {
  if (preset === 'all') return { from: firstDay ?? today, to: today };
  return { from: localDay(addDays(parseDay(today), -(preset - 1))), to: today };
}

export function readStoredPreset(): AnalyticsPreset {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const v = raw === 'all' ? 'all' : Number(raw);
    return ANALYTICS_PRESETS.includes(v as AnalyticsPreset) ? (v as AnalyticsPreset) : 'all';
  } catch {
    return 'all';
  }
}

export function writeStoredPreset(preset: AnalyticsPreset): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(preset));
  } catch {
    // Storage blocked (private mode): the tab still works with the default.
  }
}

export type DurationUnit = 's' | 'min' | 'h' | 'd';
export interface DurationPart {
  value: number;
  unit: DurationUnit;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A duration in its largest fitting unit plus one smaller unit when it is not
 * zero: 35 s · 12 min · 4 h 20 min · 2 d 3 h. The component attaches the
 * Hebrew unit words.
 */
export function durationParts(ms: number): DurationPart[] {
  const v = Math.max(0, Math.round(ms));
  if (v < MINUTE) return [{ value: Math.round(v / SECOND), unit: 's' }];
  if (v < HOUR) return [{ value: Math.floor(v / MINUTE), unit: 'min' }];
  if (v < DAY) {
    const h = Math.floor(v / HOUR);
    const min = Math.floor((v - h * HOUR) / MINUTE);
    return min > 0 ? [{ value: h, unit: 'h' }, { value: min, unit: 'min' }] : [{ value: h, unit: 'h' }];
  }
  const d = Math.floor(v / DAY);
  const h = Math.floor((v - d * DAY) / HOUR);
  return h > 0 ? [{ value: d, unit: 'd' }, { value: h, unit: 'h' }] : [{ value: d, unit: 'd' }];
}

/** 0..1 → "67%"; null → "—". */
export function formatPercent(share: number | null): string {
  if (share === null) return '—';
  return `${Math.round(share * 100)}%`;
}

/** A wait of `seconds` as a clock-style m:ss tick label ("0:00", "1:30", "10:00"). */
export function waitLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** The curve point nearest to `seconds`, clamped to the curve. */
export function waitCurveIndex(seconds: number, stepSeconds: number, pointCount: number): number {
  return Math.min(pointCount - 1, Math.max(0, Math.round(seconds / stepSeconds)));
}

/** The share of each bar relative to the tallest bar, 0..1 (a histogram's bar widths). */
export function barShares(counts: number[]): number[] {
  const max = Math.max(0, ...counts);
  return counts.map((c) => (max === 0 ? 0 : c / max));
}
