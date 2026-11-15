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

/** The subject and body of the email that carries the question to the team member. */
export function teamQuestionEmail(client: Pick<ClientRow, 'name'>, question: Pick<TeamQuestionRow, 'question' | 'reason'>): { subject: string; body: string } {
  const subject = `הסוכן מבקש את עזרתך לגבי הלקוח ${client.name}`;
  const body = [
    'שלום,',
    '',
    `במהלך איסוף המסמכים להצהרת ההון של הלקוח ${client.name} עלתה שאלה שהסוכן אינו יכול לענות עליה בעצמו:`,
    '',
    question.question,
    '',
    ...(question.reason.trim() !== '' ? ['למה הסוכן שואל:', question.reason, ''] : []),
    'הסוכן אמר ללקוח שיבדוק מול המשרד ויחזור אליו. עד שתענו, הסוכן לא יענה בעצמו בנושא הזה.',
    'את התשובה כותבים בלשונית "שאלות" בתיק הלקוח באפליקציה; הסוכן יעביר אותה ללקוח במילים שלו.',
    'אם כבר דיברתם עם הלקוח בעצמכם — סמנו זאת באותו מקום, והסוכן ימשיך באיסוף.',
    '',
    `לתיק הלקוח: ${env.APP_BASE_URL}`,
  ].join('\n');
  return { subject, body };
}
