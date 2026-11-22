import { env } from '../../config/env.js';
import { readTaxAdvisor } from './taxAdvisor.js';
import type { ClientRow, TeamQuestionRow, UserRow } from '../../db/types.js';

/**
 * Questions the agent asks the client's team member (openspec
 * `team-questions`): who a question goes to, and the email that tells them.
 * Pure; the row insert, the step and the send live in plan.ts.
 */

export interface TeamQuestionAddressee {
  email: string;
  name: string;
  match: 'accountant' | 'staff';
}

/** The accountant's display name as the agent and the emails show it (same chain as closingMessage.ts). */
export function accountantName(accountant: Pick<UserRow, 'email' | 'name' | 'hebrew_name'> | null): string {
  return accountant?.hebrew_name?.trim() || accountant?.name?.trim() || accountant?.email || 'רואה החשבון';
}

/**
 * Who answers for this client: the stored tax advisor when matched to the
 * accountant or to a staff entry (and carrying an email), otherwise the
 * accountant. Null only when the client has no owner with an email at all.
 */
export function teamQuestionAddressee(
  client: Pick<ClientRow, 'agent_fields'>,
  accountant: Pick<UserRow, 'email' | 'name' | 'hebrew_name'> | null,
): TeamQuestionAddressee | null {
  const advisor = readTaxAdvisor(client.agent_fields);
  if (advisor && advisor.match !== 'none' && advisor.email) {
    return { email: advisor.email, name: advisor.name, match: advisor.match };
  }
  if (!accountant?.email) return null;
  return { email: accountant.email, name: accountantName(accountant), match: 'accountant' };
}

/**
 * The subject and body of the email that tells the team member a question
 * waits in the app. Generic on purpose: it carries neither the question nor
 * the reason, so nobody answers by replying to the no-reply address — the
 * answer is typed in the questions tab (openspec `team-questions`).
 */
export function teamQuestionEmail(client: Pick<ClientRow, 'name'>): { subject: string; body: string } {
  const subject = `הסוכן מבקש את עזרתך לגבי הלקוח ${client.name}`;
  const body = [
    'שלום,',
    '',
    `במהלך איסוף המסמכים להצהרת ההון של הלקוח ${client.name} עלתה שאלה שהסוכן אינו יכול לענות עליה בעצמו.`,
    'השאלה ותיבת התשובה נמצאות בלשונית "שאלות" בתיק הלקוח באפליקציה.',
    'הסוכן אמר ללקוח שיבדוק מול המשרד ויחזור אליו. עד שתענו, הסוכן לא יענה בעצמו בנושא הזה.',
    'אם כבר דיברתם עם הלקוח בעצמכם — סמנו זאת באותו מקום, והסוכן ימשיך באיסוף.',
    '',
    'שימו לב: תשובה למייל הזה לא נקראת. עונים רק באפליקציה.',
    '',
    `לתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  return { subject, body };
}
