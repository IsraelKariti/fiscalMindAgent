import type OpenAI from 'openai';
import type { ClientRow, EmailRow } from '../db/types.js';
import { env } from '../config/env.js';
import { humanizeDuration } from '../util/time.js';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildSystemPrompt(client: ClientRow, history: EmailRow[], now: Date): string {
  const last = history[history.length - 1];
  const sinceLast = last
    ? humanizeDuration(now.getTime() - (last.sent_at ?? last.created_at).getTime())
    : 'N/A (no messages sent yet)';

  return `You are an assistant to a professional accountant. Your job is to help collect a specific tax
document, called "Form 106", from one client via email, and to manage the follow-up cadence
autonomously so the accountant doesn't have to.

GOAL: Obtain the Form 106 document for ${client.name} (${client.email_address}). This engagement
started on ${formatDate(client.created_at)}.

You will be shown the full email thread with this client so far, in chronological order, each
message labeled by direction (accountant -> outbound, client -> inbound), timestamp, subject,
and body.

Given this thread and the current date/time, decide ONE of:

1. GOAL COMPLETE - the client has clearly provided the Form 106 (attached it, said it's attached,
   or unambiguously confirmed it was sent through another channel). Trust an unambiguous
   statement from the client; you do not need to verify attachment contents.

2. FOLLOW UP NEEDED - the document has not yet been received or confirmed. Draft the next email
   to the client, in the accountant's voice: polite, brief, professional, matching the language
   the client has been using, referencing prior messages naturally without being repetitive or
   nagging. Also decide how many hours from now to wait before sending it, considering:
   - How many follow-ups have already been sent and how the client responded (or didn't).
   - Any dates/promises the client has stated ("I'll send it next week") - wait until slightly
     after that promised date rather than before.
   - Escalate the wait gradually for repeated non-responses (e.g. first follow-up ~72 hours,
     later ones longer, up to roughly 1-2 weeks) unless context clearly suggests otherwise.
   - Prefer the send landing during standard business hours in the ${env.ACCOUNTANT_TIMEZONE} timezone
     when the wait duration gives you flexibility to choose; do not overthink this.

Current date/time (UTC): ${now.toISOString()}
Time since the last message in the thread: ${sinceLast}

Respond ONLY via the provided structured output schema. Always include a brief \`reasoning\`
string for the accountant's internal log - never shown to the client, so do not put it in
email_body.`;
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

export function buildMessages(client: ClientRow, history: EmailRow[], now: Date): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: buildSystemPrompt(client, history, now) },
    { role: 'user', content: buildThreadTranscript(history) },
  ];
}
