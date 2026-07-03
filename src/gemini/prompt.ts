import type { ClientDocumentRow, ClientRow, EmailRow } from '../db/types.js';
import { env } from '../config/env.js';
import { humanizeDuration } from '../util/time.js';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Placeholders substituted into the system-prompt template at call time.
 * Keep this list in sync with the placeholder docs shown in the dashboard's prompt editor.
 */
export const PROMPT_PLACEHOLDERS = [
  'client_name',
  'client_email',
  'engagement_start_date',
  'current_datetime_utc',
  'time_since_last_message',
  'accountant_timezone',
] as const;

export type PromptPlaceholder = (typeof PROMPT_PLACEHOLDERS)[number];

export const DEFAULT_PROMPT_TEMPLATE = `You are an assistant to a professional accountant. Your job is to collect a set of required tax
documents from one client via email, and to manage the follow-up cadence autonomously so the
accountant doesn't have to.

GOAL: Obtain every document in the REQUIRED DOCUMENTS list for {{client_name}} ({{client_email}}).
This engagement started on {{engagement_start_date}}.

You will be shown the REQUIRED DOCUMENTS list — each entry has an id, a name, an optional
description, and a status: "pending" (not yet received) or "collected" (already received) —
followed by the full email thread with this client so far, in chronological order, each
message labeled by direction (accountant -> outbound, client -> inbound), timestamp, subject,
and body.

First, update the document statuses: whenever the thread shows the client has clearly provided
a pending document (attached it, said it's attached, or unambiguously confirmed it was sent
through another channel), include that document's id in \`collected_document_ids\`. Trust an
unambiguous statement from the client; you do not need to verify attachment contents. Leave the
array empty if nothing new was provided.

Then, considering which documents remain pending and the current date/time, decide ONE of:

1. GOAL COMPLETE - every required document has been collected (counting the ones you just put
   in \`collected_document_ids\`). Never choose this while any document remains pending.

2. FOLLOW UP NEEDED - at least one document is still pending. Draft the next email to the
   client, in the accountant's voice: polite, brief, professional, matching the language the
   client has been using, referencing prior messages naturally without being repetitive or
   nagging. Ask only for the documents that are still missing, and acknowledge what the client
   has already sent when it is natural to do so. Also decide how many hours from now to wait
   before sending it, considering:
   - How many follow-ups have already been sent and how the client responded (or didn't).
   - Any dates/promises the client has stated ("I'll send it next week") - wait until slightly
     after that promised date rather than before.
   - Escalate the wait gradually for repeated non-responses (e.g. first follow-up ~72 hours,
     later ones longer, up to roughly 1-2 weeks) unless context clearly suggests otherwise.
   - Prefer the send landing during standard business hours in the {{accountant_timezone}} timezone
     when the wait duration gives you flexibility to choose; do not overthink this.

Current date/time (UTC): {{current_datetime_utc}}
Time since the last message in the thread: {{time_since_last_message}}

Respond ONLY via the provided structured output schema. Always include a brief \`reasoning\`
string for the accountant's internal log - never shown to the client, so do not put it in
email_body.`;

export function renderPromptTemplate(template: string, vars: Record<PromptPlaceholder, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name: string) =>
    name in vars ? vars[name as PromptPlaceholder] : match,
  );
}

export function buildSystemPrompt(
  client: ClientRow,
  history: EmailRow[],
  now: Date,
  template: string = DEFAULT_PROMPT_TEMPLATE,
): string {
  const last = history[history.length - 1];
  const sinceLast = last
    ? humanizeDuration(now.getTime() - (last.sent_at ?? last.created_at).getTime())
    : 'N/A (no messages sent yet)';

  return renderPromptTemplate(template, {
    client_name: client.name,
    client_email: client.email_address,
    engagement_start_date: formatDate(client.created_at),
    current_datetime_utc: now.toISOString(),
    time_since_last_message: sinceLast,
    accountant_timezone: env.ACCOUNTANT_TIMEZONE,
  });
}

/** Lives in `contents` (not the template) so custom system prompts still see current document state. */
export function buildDocumentsSection(documents: ClientDocumentRow[]): string {
  if (documents.length === 0) {
    return '--- REQUIRED DOCUMENTS ---\n(none configured)\n--- END DOCUMENTS ---';
  }
  const lines = documents.map((doc) => {
    const description = doc.description ? ` — ${doc.description}` : '';
    return `[id: ${doc.id}] ${doc.name}${description} | status: ${doc.status}`;
  });
  return `--- REQUIRED DOCUMENTS ---\n${lines.join('\n')}\n--- END DOCUMENTS ---`;
}

export function buildThreadTranscript(history: EmailRow[]): string {
  if (history.length === 0) {
    return '--- EMAIL THREAD (chronological) ---\n(no messages yet)\n--- END THREAD ---\n\nDecide the next action now.';
  }
  const lines = history.map((email, i) => {
    const timestamp = (email.sent_at ?? email.created_at).toISOString();
    const from = email.direction === 'outbound' ? 'accountant (outbound)' : `client (inbound)`;
    return `[#${i + 1}] ${timestamp} | FROM: ${from} | Subject: ${email.subject}\n${email.body}`;
  });
  return `--- EMAIL THREAD (chronological) ---\n${lines.join('\n\n')}\n--- END THREAD ---\n\nDecide the next action now.`;
}

export interface Prompt {
  systemInstruction: string;
  contents: string;
}

export function buildPrompt(
  client: ClientRow,
  history: EmailRow[],
  documents: ClientDocumentRow[],
  now: Date,
  template?: string,
): Prompt {
  return {
    systemInstruction: buildSystemPrompt(client, history, now, template),
    contents: `${buildDocumentsSection(documents)}\n\n${buildThreadTranscript(history)}`,
  };
}
