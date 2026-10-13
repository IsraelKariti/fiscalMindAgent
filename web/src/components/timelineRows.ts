import type { AdminConversation, AdminConversationMessage, AdminConversationStep, Email, LlmCallSummary } from '../api';

/**
 * Admin-only trace rows woven between the messages: the LLM calls and the
 * audited code steps (gates, apply_*, send_reply) of this client, as served
 * by the admin conversation endpoint, plus the drafts a re-plan threw away
 * (openspec `conversation-trace`, "Discarded drafts are shown with the LLM
 * calls"). Ties on the same instant break steps → calls → messages, so a
 * cycle reads inbound, regex, scan, decide, validate_message, apply_*,
 * send_reply, outbound.
 */
export type TraceEntry =
  | { kind: 'call'; at: number; call: LlmCallSummary }
  | { kind: 'step'; at: number; step: AdminConversationStep }
  | { kind: 'draft'; at: number; message: AdminConversationMessage };

export type TimelineRow = { kind: 'message'; at: number; email: Email; index: number } | TraceEntry;

const ROW_RANK = { step: 0, call: 1, message: 2, draft: 2 } as const;

export interface TraceToggles {
  calls: boolean;
  steps: boolean;
}

/**
 * Merges the thread with the trace rows the toggles ask for.
 *
 * The endpoint flags a draft a re-plan discarded, the `send_reply` step that
 * scheduled it and the `generate_message` call that wrote it (unless that
 * call's cycle also applied state). With the LLM calls toggle off, none of
 * them show — a planning step whose only output was thrown away is noise.
 * With it on, the discarded drafts show as rows of their own, their calls
 * show like any call, and their steps show when the code steps toggle is on
 * as well (a step of a draft the viewer cannot see is noise again).
 */
export function mergeTrace(emails: Email[], trace: AdminConversation | null, show: TraceToggles): TimelineRow[] {
  const rows: TimelineRow[] = emails.map((email, index) => ({
    kind: 'message',
    at: Date.parse(email.sent_at ?? email.created_at),
    email,
    index,
  }));
  if (!trace) return rows;
  // A call's row is written when the answer arrives (createdAt = end), while
  // its gate is audited right after — order calls by their START so the call
  // precedes the gate that checks it.
  if (show.calls)
    for (const call of trace.calls) {
      rows.push({ kind: 'call', at: Date.parse(call.createdAt) - (call.durationMs ?? 0), call });
    }
  if (show.steps)
    for (const step of trace.steps) {
      if (step.discarded && !show.calls) continue;
      rows.push({ kind: 'step', at: Date.parse(step.occurredAt), step });
    }
  if (show.calls)
    for (const message of trace.messages) {
      if (message.discarded !== true) continue;
      rows.push({ kind: 'draft', at: Date.parse(message.createdAt), message });
    }
  return rows.sort((a, b) => a.at - b.at || ROW_RANK[a.kind] - ROW_RANK[b.kind]);
}
