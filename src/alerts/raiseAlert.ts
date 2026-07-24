import * as anomalyAlerts from '../db/queries/anomalyAlerts.js';
import type { AlertSeverity } from '../db/queries/anomalyAlerts.js';
import { sendAdminAlertEmail } from './adminAlert.js';
import { logger } from '../util/logger.js';

/**
 * Records an anomaly finding and emails the platform admins about it. The
 * (rule, scope_key) throttle in insertIfNotRecent makes a sustained anomaly
 * produce one alert + one email, not one per 15-minute scan. The email failing
 * never fails the caller — the alert row is already stored and visible on the
 * admin audit page.
 */
export async function raiseAlert(a: {
  rule: string;
  scopeKey?: string;
  severity: AlertSeverity;
  title: string;
  detail?: Record<string, unknown>;
  /** Minimum minutes between alerts for the same (rule, scope). Default 60. */
  throttleMinutes?: number;
}): Promise<void> {
  const row = await anomalyAlerts.insertIfNotRecent({
    rule: a.rule,
    scopeKey: a.scopeKey ?? '',
    severity: a.severity,
    title: a.title,
    detail: a.detail ?? {},
    throttleMinutes: a.throttleMinutes ?? 60,
  });
  if (!row) return;
  logger.warn('anomaly alert raised', { alertId: row.id, rule: row.rule, scopeKey: row.scope_key, severity: row.severity });
  try {
    await sendAdminAlertEmail(row);
    await anomalyAlerts.markNotified(row.id);
  } catch (err) {
    logger.error('admin alert email failed', err, { alertId: row.id, rule: row.rule });
  }
}
