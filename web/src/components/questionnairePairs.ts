import type { ClientAgentFields } from '../api.js';

export interface QuestionnairePair {
  question: string;
  answer: string;
}

/**
 * The questionnaire pairs stored on a client (agent_fields.form_answers), in
 * stored order, for the admin-only questionnaire tab (openspec
 * `admin-questionnaire-tab`). Defensive like the server's prompt section:
 * only well-formed `{question, answer}` string pairs with a non-blank answer
 * survive, so an old or hand-edited row can never break the tab.
 */
export function questionnairePairs(fields: ClientAgentFields | null | undefined): QuestionnairePair[] {
  const raw: unknown = fields?.form_answers;
  if (!Array.isArray(raw)) return [];
  const pairs: QuestionnairePair[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { question, answer } = entry as { question?: unknown; answer?: unknown };
    if (typeof question !== 'string' || typeof answer !== 'string') continue;
    if (question.trim() === '' || answer.trim() === '') continue;
    pairs.push({ question, answer });
  }
  return pairs;
}
