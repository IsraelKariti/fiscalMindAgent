import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  correctionSuffix,
  DecisionResponseSchema,
  normalizeDecision,
  type DecisionContext,
} from '../src/agents/docCollector/decisionSchema.js';

// The exact decision Gemini returned in the 2026-08-02 production incident:
// "no message needed, the client will reply with the SMS code" — a follow_up
// with every message field and send_at null, carrying only a tax-fetch action.
const incidentAnswer = JSON.stringify({
  decision: 'follow_up',
  reasoning:
    'The assistant just sent message #9, which announced the initiation of the Altshuler Shaham pension document fetch. No new message is needed as the client is expected to provide the SMS code in response to the last message.',
  suspected_injection: false,
  collected_document_ids: [],
  matched_files: [],
  channel: null,
  email_subject: null,
  email_body: null,
  whatsapp_text: null,
  whatsapp_template: null,
  send_at: null,
  tax_fetch_action: 'start_login',
  tax_fetch_provider: 'altshuler_shaham',
  tax_fetch_document_keys: ['pension_annual'],
  resolved_documents: null,
  added_instances: null,
  superseded_documents: null,
  attestation: null,
  attestation_evidence: null,
});

// The channel/fetch state at the time of the incident.
const ctx: DecisionContext = {
  whatsappAllowed: true,
  windowOpen: true,
  templates: [],
  taxFetch: [
    {
      provider: 'altshuler_shaham',
      state: 'wa_intro_sent',
      available: true,
      clientOnWhatsapp: true,
      documentKeys: ['pension_annual'],
    },
  ],
};

describe('keepalive contract (normalizeDecision)', () => {
  it('rejects a follow_up that schedules no message ("no message needed")', () => {
    const raw = DecisionResponseSchema.parse(JSON.parse(incidentAnswer));
    assert.throws(() => normalizeDecision(raw, ctx), /missing\/invalid send_at/);
  });

  it('accepts the corrected decision: same fetch action plus a scheduled reminder', () => {
    const raw = DecisionResponseSchema.parse(
      JSON.parse(incidentAnswer.replace('"whatsapp_text":null', '"whatsapp_text":"רק בודק - קיבלת את הקוד?"')),
    );
    raw.channel = 'whatsapp';
    raw.send_at = '2026-08-02 11:05';
    const decision = normalizeDecision(raw, ctx);
    assert.equal(decision.decision, 'follow_up');
    if (decision.decision !== 'follow_up') return;
    assert.deepEqual(decision.message, { channel: 'whatsapp', kind: 'freeform', body: 'רק בודק - קיבלת את הקוד?' });
    assert.equal(decision.send_at, '2026-08-02 11:05');
    assert.equal(decision.tax_fetch?.action, 'start_login');
  });
});

describe('correctionSuffix', () => {
  it('feeds back the rejected answer, the validation error, and the contract', () => {
    const raw = DecisionResponseSchema.parse(JSON.parse(incidentAnswer));
    let caught: unknown;
    try {
      normalizeDecision(raw, ctx);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error);
    const suffix = correctionSuffix(incidentAnswer, caught);
    assert.ok(suffix.includes(incidentAnswer));
    assert.ok(suffix.includes((caught as Error).message));
    assert.ok(suffix.includes('MUST include exactly one full message'));
  });
});
