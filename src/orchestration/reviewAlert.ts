import { sendEmail } from '../resend/send.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';
import type { AgentInstanceRow, ClientRow, EmailRow } from '../db/types.js';

/**
 * Alerts to the platform admin (ADMIN_ALERT_EMAIL) about drafts awaiting
 * review (048). Like the accountant notifications, these are deliberately NOT
 * stored in the emails table, and callers fire and forget — an alert failure
 * must never fail drafting or a send.
 */

const timeFmt = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  dateStyle: 'short',
  timeStyle: 'short',
});

async function sendAlert(subject: string, lines: string[]): Promise<void> {
  if (!env.ADMIN_ALERT_EMAIL) {
    logger.warn('review alert skipped: ADMIN_ALERT_EMAIL not set', { subject });
    return;
  }
  await sendEmail({
    from: `FiscalMind <no-reply@${env.AGENT_EMAIL_DOMAIN}>`,
    to: env.ADMIN_ALERT_EMAIL,
    subject,
    body: lines.join('\n'),
  });
  logger.info('review alert sent', { to: env.ADMIN_ALERT_EMAIL, subject });
}

function draftContext(client: ClientRow, instance: AgentInstanceRow, draft: EmailRow): string[] {
  return [
    `לקוח: ${client.name}`,
    `סוכן: ${instance.name}`,
    draft.wa_content_sid ? 'סוג: הודעת תבנית (וואטסאפ)' : 'סוג: הודעה חופשית (וואטסאפ)',
    '',
    'תוכן ההודעה:',
    '----------------------------------------',
    draft.body,
    '----------------------------------------',
    '',
    `לאישור או יצירה מחדש: ${env.APP_BASE_URL}/#/review`,
  ];
}

/** A new draft was scheduled and awaits approval before its send time. */
export async function sendReviewAlertEmail(
  client: ClientRow,
  instance: AgentInstanceRow,
  draft: EmailRow,
  scheduledFor: Date,
): Promise<void> {
  await sendAlert(`הודעה חדשה ממתינה לאישור — ${client.name} (${instance.name})`, [
    'שלום,',
    '',
    'הסוכן ניסח הודעה חדשה הממתינה לאישורך לפני שליחה.',
    `מועד השליחה המתוכנן: ${timeFmt.format(scheduledFor)} (שעון ישראל)`,
    '',
    ...draftContext(client, instance, draft),
  ]);
}

/** The scheduled send time arrived and the draft is still unapproved — it was parked and will send the moment it is approved. */
export async function sendReviewReminderEmail(
  client: ClientRow,
  instance: AgentInstanceRow,
  draft: EmailRow,
): Promise<void> {
  await sendAlert(`מועד השליחה הגיע — הודעה עדיין ממתינה לאישור — ${client.name}`, [
    'שלום,',
    '',
    'מועד השליחה של ההודעה הגיע והיא עדיין לא אושרה, ולכן היא לא נשלחה.',
    'ההודעה תישלח מיד עם אישורה.',
    '',
    ...draftContext(client, instance, draft),
  ]);
}
