/**
 * Pure rule evaluators for the anomaly scan — no I/O so they are unit-testable
 * (tests/anomalyRules.test.ts). anomalyScan.ts fetches the counters and feeds
 * them here; whatever comes back is raised as an alert.
 */

export interface KeyedCount {
  key: string;
  count: number;
}

export interface VolumeSpike {
  key: string;
  current: number;
  threshold: number;
  baselineHourlyAvg: number;
}

/**
 * Flags keys whose current-window count exceeds max(minThreshold, multiplier ×
 * trailing hourly average). The floor keeps quiet instances (baseline ~0, where
 * any activity is a huge multiple) from alerting on normal traffic; the
 * multiplier catches busy instances suddenly running hotter than their history.
 */
export function evaluateVolumeSpikes(
  current: KeyedCount[],
  baseline: KeyedCount[],
  baselineHours: number,
  opts: { minThreshold: number; multiplier: number },
): VolumeSpike[] {
  const baselineByKey = new Map(baseline.map((b) => [b.key, b.count]));
  const spikes: VolumeSpike[] = [];
  for (const { key, count } of current) {
    const hourlyAvg = baselineHours > 0 ? (baselineByKey.get(key) ?? 0) / baselineHours : 0;
    const threshold = Math.max(opts.minThreshold, Math.ceil(opts.multiplier * hourlyAvg));
    if (count > threshold) {
      spikes.push({ key, current: count, threshold, baselineHourlyAvg: hourlyAvg });
    }
  }
  return spikes;
}

export interface TimedOccurrence {
  occurredAt: Date;
  key: string | null;
}

export interface OffHoursHit extends TimedOccurrence {
  localHour: number;
}

/** The occurrence's wall-clock hour (0-23) in the given IANA timezone. */
export function hourInTimeZone(at: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at));
}

/**
 * Flags occurrences outside [startHour, endHour) local time — e.g. a
 * tax-authority login (a real OTP email to a real citizen) at 3am is not a thing
 * the normal flow produces.
 */
export function evaluateOffHours(
  occurrences: TimedOccurrence[],
  timeZone: string,
  startHour = 7,
  endHour = 22,
): OffHoursHit[] {
  const hits: OffHoursHit[] = [];
  for (const o of occurrences) {
    const localHour = hourInTimeZone(o.occurredAt, timeZone);
    if (localHour < startHour || localHour >= endHour) hits.push({ ...o, localHour });
  }
  return hits;
}

export interface TokenUsage {
  key: string;
  today: number;
  priorTotal: number;
  priorDays: number;
}

export interface TokenSpike {
  key: string;
  today: number;
  threshold: number;
  priorDailyAvg: number;
}

/** Flags keys whose today's token total exceeds max(minTokens, multiplier × prior daily average). */
export function evaluateTokenSpikes(
  usage: TokenUsage[],
  opts: { minTokens: number; multiplier: number },
): TokenSpike[] {
  const spikes: TokenSpike[] = [];
  for (const u of usage) {
    const priorDailyAvg = u.priorDays > 0 ? u.priorTotal / u.priorDays : 0;
    const threshold = Math.max(opts.minTokens, Math.ceil(opts.multiplier * priorDailyAvg));
    if (u.today > threshold) {
      spikes.push({ key: u.key, today: u.today, threshold, priorDailyAvg });
    }
  }
  return spikes;
}
