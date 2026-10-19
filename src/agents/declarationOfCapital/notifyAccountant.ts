import * as users from '../../db/queries/users.js';
import { recordAudit } from '../../audit/audit.js';
import { sendEmail } from '../../resend/send.js';
import { env } from '../../config/env.js';
import { sendToAccountantWith, type AccountantEmailKind } from './notifyAccountantCore.js';
import type { ClientRow } from '../../db/types.js';

/**
 * Notifications from the platform to the accountant, sent from a no-reply
 * address on the verified sending domain (no mailbox needs to exist — Resend
 * authorizes the whole domain) to their login address. The record of each one
 * is the client's trace, see notifyAccountantCore.ts. Callers fire and forget.
 */
export function sendToAccountant(client: ClientRow, kind: AccountantEmailKind, subject: string, body: string): Promise<void> {
  return sendToAccountantWith(client, kind, subject, body, {
    from: `FiscalMind <no-reply@${env.AGENT_EMAIL_DOMAIN}>`,
    getUser: users.getById,
    sendEmail,
    recordAudit,
  });
}

export async function sendGoalCompleteEmail(client: ClientRow): Promise<void> {
  const subject = `כל המסמכים של ${client.name} התקבלו`;
  const body = [
    'שלום,',
    '',
    `חדשות טובות — כל המסמכים הנדרשים מהלקוח ${client.name} התקבלו, ואיסוף המסמכים הושלם.`,
    'הסוכן סיים את הטיפול בלקוח ולא יישלחו עוד תזכורות.',
    '',
    `לצפייה בתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  await sendToAccountant(client, 'goal_complete', subject, body);
}

/** "The client says they delivered these outside email — please confirm" (documents just moved to 'claimed'). */
export async function sendClaimedDocumentsEmail(client: ClientRow, claimedDocNames: string[]): Promise<void> {
  const claimed = claimedDocNames.map((name) => `• ${name}`).join('\n');
  const subject = `הלקוח ${client.name} מסר שסיפק מסמכים שלא במייל — נדרש אישורך`;
  const body = [
    'שלום,',
    '',
    `הלקוח ${client.name} מסר שסיפק את המסמכים הבאים שלא דרך המייל (למשל בפקס או פיזית במשרד):`,
    claimed || '• (ללא פירוט)',
    '',
    'המסמכים סומנו כ"ממתינים לאישור" ולא ייחשבו כנאספו עד שתאשר את קבלתם בתיק הלקוח.',
    'אם המסמכים אכן התקבלו — סמן אותם כנאספו בתיק הלקוח; אחרת הסוכן ימשיך לעקוב.',
    '',
    `לצפייה בתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  await sendToAccountant(client, 'claimed_documents', subject, body);
}

/**
 * A received document could not be auto-verified (3 failed attempts, an
 * unverifiable file type, or suspected injected content) — the one point the
 * pipeline hands a document to a human. Sent once per dead end.
 */
export async function sendVerificationProblemEmail(
  client: ClientRow,
  docName: string,
  reasons: string[],
): Promise<void> {
  const reasonLines = reasons.map((r) => `• ${r}`).join('\n');
  const subject = `מסמך של ${client.name} לא עבר אימות אוטומטי — נדרשת בדיקתך`;
  const body = [
    'שלום,',
    '',
    `המסמך "${docName}" שהתקבל מהלקוח ${client.name} לא עבר את האימות האוטומטי:`,
    reasonLines || '• (ללא פירוט)',
    '',
    'הסוכן הפסיק לבקש את המסמך הזה מהלקוח. אנא בדוק את הקובץ בתיק הלקוח —',
    'אם הוא תקין אשר אותו ידנית; אחרת בקש מהלקוח מסמך מתוקן או טפל בכך ישירות.',
    '',
    `לצפייה בתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  await sendToAccountant(client, 'verification_problem', subject, body);
}

export async function sendOverdueEmail(client: ClientRow, missingDocNames: string[]): Promise<void> {
  const dueDate = typeof client.agent_fields['due_date'] === 'string' ? (client.agent_fields['due_date'] as string) : '';
  const missing = missingDocNames.map((name) => `• ${name}`).join('\n');
  const subject = `תאריך היעד של ${client.name} עבר — הסוכן הפסיק לשלוח תזכורות`;
  const body = [
    'שלום,',
    '',
    `תאריך היעד לאיסוף המסמכים מהלקוח ${client.name} (${dueDate}) עבר, ועדיין חסרים המסמכים הבאים:`,
    missing || '• (לא הוגדרו מסמכים)',
    '',
    'הסוכן הפסיק לשלוח תזכורות והלקוח הועבר לטיפולך.',
    'כדי שהסוכן ימשיך לעקוב אפשר לחדש את הפעילות מתוך תיק הלקוח, או לעדכן את תאריך היעד.',
    '',
    `לצפייה בתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  await sendToAccountant(client, 'overdue', subject, body);
}
