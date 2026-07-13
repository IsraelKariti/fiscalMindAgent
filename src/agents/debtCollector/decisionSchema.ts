import { z } from 'zod';
import { isWallClockDateTime } from '../../util/time.js';

// Gemini's `responseJsonSchema` doesn't support Zod's `.optional()` the same way structured
// outputs need every property always present; the "message fields only apply when
// decision === 'follow_up'" rule is expressed as always-present nullable fields plus a
// `decision` discriminator, documented in the prompt and re-checked below.
export const DebtDecisionResponseSchema = z.object({
  /** Internal explanation — persisted on the snapshot so the accountant sees why. */
  reasoning: z.string(),
  // The extracted debt picture, always filled from the financial rows (nulls
  // where the data doesn't say).
  in_debt: z.boolean(),
  /** The open amount as written in the data, e.g. "₪1,200". */
  debt_amount: z.string().nullable(),
  debt_reason: z.string().nullable(),
  payment_plan: z.enum(['monthly', 'bi_monthly', 'other', 'unknown']),
  recurring_payments: z.string().nullable(),
  one_time_payments: z.string().nullable(),
  // The action.
  decision: z.enum(['no_debt', 'paid', 'follow_up']),
  email_subject: z.string().nullable(),
  email_body: z.string().nullable(),
  /** When to send, as "YYYY-MM-DD HH:MM" wall-clock time in the accountant's timezone. */
  send_at: z.string().nullable(),
});

export type DebtDecisionResponse = z.infer<typeof DebtDecisionResponseSchema>;

/** The debt picture the LLM read out of the financial rows (also the UI snapshot's core). */
export interface DebtExtraction {
  in_debt: boolean;
  debt_amount: string | null;
  debt_reason: string | null;
  payment_plan: 'monthly' | 'bi_monthly' | 'other' | 'unknown';
  recurring_payments: string | null;
  one_time_payments: string | null;
}

export type NormalizedDebtDecision =
  | { decision: 'no_debt' | 'paid'; reasoning: string; extraction: DebtExtraction }
  | {
      decision: 'follow_up';
      reasoning: string;
      extraction: DebtExtraction;
      subject: string;
      body: string;
      /** Validated wall-clock datetime in the accountant's timezone. */
      send_at: string;
    };

export function normalizeDebtDecision(raw: DebtDecisionResponse): NormalizedDebtDecision {
  const extraction: DebtExtraction = {
    in_debt: raw.in_debt,
    debt_amount: raw.debt_amount,
    debt_reason: raw.debt_reason,
    payment_plan: raw.payment_plan,
    recurring_payments: raw.recurring_payments,
    one_time_payments: raw.one_time_payments,
  };
  if (raw.decision !== 'follow_up') {
    return { decision: raw.decision, reasoning: raw.reasoning, extraction };
  }
  if (raw.email_subject == null || raw.email_body == null) {
    throw new Error(`follow_up debt decision missing subject/body: ${JSON.stringify(raw)}`);
  }
  if (raw.send_at == null || !isWallClockDateTime(raw.send_at)) {
    throw new Error(`follow_up debt decision missing/invalid send_at: ${JSON.stringify(raw)}`);
  }
  return {
    decision: 'follow_up',
    reasoning: raw.reasoning,
    extraction,
    subject: raw.email_subject,
    body: raw.email_body,
    send_at: raw.send_at.trim(),
  };
}

/**
 * The per-client debt snapshot persisted to clients.agent_fields.debt — an
 * overwrite-only UI record of the latest analysis, never an input to the next
 * planning cycle (each cycle re-reads the live sheets/boards).
 */
export type DebtSnapshot = {
  status: 'in_debt' | 'no_debt' | 'paid' | 'no_data';
  amount: string | null;
  reason: string | null;
  payment_plan: DebtExtraction['payment_plan'];
  recurring_payments: string | null;
  one_time_payments: string | null;
  reasoning: string;
  /** ISO timestamp of the analysis. */
  analyzed_at: string;
  /** Set once when payment is first confirmed — idempotency key for the accountant notification. */
  paid_confirmed_at?: string;
};

/** Tolerant read of the stored snapshot (absent/invalid → null). */
export function readDebtSnapshot(agentFields: Record<string, unknown>): DebtSnapshot | null {
  const value = agentFields['debt'];
  if (typeof value !== 'object' || value === null) return null;
  return value as DebtSnapshot;
}
