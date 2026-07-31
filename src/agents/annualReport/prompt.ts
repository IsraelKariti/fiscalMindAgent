import type { ClientDocumentRow, ClientRow, DocumentFileRow, EmailRow, UserRow } from '../../db/types.js';
import {
  buildDeadlineSection,
  buildSystemPrompt,
  buildThreadTranscript,
  buildWhatsAppSection,
  WHATSAPP_UNAVAILABLE,
  type Prompt,
  type WaChannelState,
} from '../docCollector/prompt.js';
import { endFence, fence, makeFenceToken, sanitizeInline } from '../shared/promptSafety.js';
import { loadPrompt } from '../shared/promptFile.js';

/**
 * The annual-report assistant's system prompt. Unlike the doc collector, there
 * is no accountant-defined document list: the agent interviews the client
 * (personal annual return, טופס 1301/135), determines the required documents
 * itself, and registers each one via `add_documents`. The mechanical blocks
 * (channel selection, message style, send_at heuristics, hard time limits,
 * JSON instruction) are copies of the doc collector's — deliberately not
 * shared files, because this agent must not honor the doc collector's
 * per-user custom template and the two templates should be free to diverge.
 * The text itself lives in prompt.md next to this file.
 */
export const ANNUAL_REPORT_PROMPT_TEMPLATE = loadPrompt(new URL('./prompt.md', import.meta.url));

/** The sticky "the interview covered every applicable topic" flag (agent_fields.interview_complete). */
export function isInterviewComplete(client: ClientRow): boolean {
  return client.agent_fields?.['interview_complete'] === true;
}

/** Lives in `contents` (like the documents section) so every planning pass sees the current document state. */
export function buildDocumentsSection(token: string, documents: ClientDocumentRow[]): string {
  if (documents.length === 0) {
    return `${fence(token, 'DOCUMENTS DETERMINED SO FAR')}\n(none yet — interview in progress)\n${endFence(token, 'DOCUMENTS DETERMINED SO FAR')}`;
  }
  const lines = documents.map((doc) => {
    const description = doc.description ? ` — ${sanitizeInline(doc.description, 500)}` : '';
    return `[id: ${doc.id}] ${sanitizeInline(doc.name, 200)}${description} | status: ${doc.status}`;
  });
  return `${fence(token, 'DOCUMENTS DETERMINED SO FAR')}\n${lines.join('\n')}\n${endFence(token, 'DOCUMENTS DETERMINED SO FAR')}`;
}

/** The sticky interview state must be visible to every planning pass — the transcript alone can be ambiguous. */
export function buildInterviewSection(token: string, client: ClientRow): string {
  const status = isInterviewComplete(client)
    ? 'COMPLETE — the interview is finished; do not reopen it, only chase the documents still pending'
    : 'IN PROGRESS — keep interviewing until every applicable topic is covered';
  return `${fence(token, 'INTERVIEW STATUS')}\n${status}\n${endFence(token, 'INTERVIEW STATUS')}`;
}

export function buildPrompt(
  client: ClientRow,
  accountant: UserRow | null,
  history: EmailRow[],
  documents: ClientDocumentRow[],
  files: DocumentFileRow[],
  now: Date,
  waState: WaChannelState = WHATSAPP_UNAVAILABLE,
): Prompt {
  const token = makeFenceToken();
  const sections = [
    buildDocumentsSection(token, documents),
    buildInterviewSection(token, client),
    buildDeadlineSection(token, client, now),
    buildWhatsAppSection(token, waState),
    buildThreadTranscript(token, history, files),
  ].filter((s) => s !== '');
  return {
    systemInstruction: buildSystemPrompt(client, accountant, history, now, ANNUAL_REPORT_PROMPT_TEMPLATE, token),
    contents: sections.join('\n\n'),
  };
}
