import type { AnomalyAlertRow } from '../db/queries/anomalyAlerts.js';
import * as users from '../db/queries/users.js';
import { sendEmail } from '../resend/send.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

/**
 * The platform's only path that emails the ADMINS (not an accountant): anomaly
 * and critical-event alerts, from the same no-reply domain address the
 * accountant notifications use. Recipients are the DB-managed admins
 * (users.is_admin), falling back to ADMIN_EMAILS during the pre-bootstrap
 * window when the DB has no admins yet. Throws on total failure so raiseAlert
 * can leave notified_at null (= "email never went out") on the alert row.
 */
export async function sendAdminAlertEmail(alert: AnomalyAlertRow): Promise<void> {
  const dbAdmins = await users.listAdminEmails();
  const recipients = dbAdmins.length > 0 ? dbAdmins : env.ADMIN_EMAILS;
  if (recipients.length === 0) {
    logger.warn('admin alert email skipped: no admins in DB and ADMIN_EMAILS is empty', {
      alertId: alert.id,
      rule: alert.rule,
    });
    return;
  }
  const prefix = alert.severity === 'critical' ? 'התראה קריטית' : 'אזהרה';
  const subject = `FiscalMind — ${prefix}: ${alert.title}`;
  const body = [
    'שלום,',
    '',
    `מערכת הניטור זיהתה: ${alert.title}`,
    '',
    `חומרה: ${alert.severity === 'critical' ? 'קריטית' : 'אזהרה'}`,
    `כלל: ${alert.rule}`,
    alert.scope_key ? `היקף: ${alert.scope_key}` : null,
    `פרטים: ${JSON.stringify(alert.detail)}`,
    '',
    `ליומן הביקורת וההתראות: ${env.APP_BASE_URL}/#/audit`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  const results = await Promise.allSettled(
    recipients.map((to) =>
      sendEmail({ from: `FiscalMind <no-reply@${env.AGENT_EMAIL_DOMAIN}>`, to, subject, body }),
    ),
  );
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length === results.length) {
    throw new Error(`admin alert email failed for every recipient: ${(failed[0] as PromiseRejectedResult).reason}`);
  }
  for (const f of failed) {
    logger.error('admin alert email failed for one recipient', (f as PromiseRejectedResult).reason, { alertId: alert.id });
  }
}
