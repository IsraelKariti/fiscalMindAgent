import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  answerTiesFiles,
  correctionSuffix,
  DecisionResponseSchema,
  decisionSchemaForContext,
  decisionSchemaKey,
  normalizeDecision,
  type DecisionContext,
  type DecisionResponse,
} from '../src/agents/declarationOfCapital/decisionSchema.js';

// openspec `verification-reply` (change no-draft-when-collecting): an answer
// that ties a file to a document is a 'collect' decision and carries no
// message; a follow_up ties nothing; the follow-up cycle after verification is
// never offered 'collect'.

const ctx: DecisionContext = { emailAllowed: false, whatsappAllowed: true, windowOpen: true, templates: [] };

const base: DecisionResponse = {
  decision: 'collect',
  reasoning: 'the client sent the Leumi certificate',
  collected_document_ids: ['doc-bank-leumi'],
  matched_files: [{ file_id: 'file-1', document_id: 'doc-bank-leumi', evidence: null }],
  channel: null,
  email_subject: null,
  email_body: null,
  whatsapp_text: null,
  whatsapp_template: null,
  send_at: null,
  tax_fetch_action: null,
  tax_fetch_provider: null,
  tax_fetch_document_keys: null,
  resolved_documents: null,
  added_instances: null,
  retired_documents: null,
  attestation: null,
  attestation_evidence: null,
};

const answer = (over: Partial<DecisionResponse>): DecisionResponse => DecisionResponseSchema.parse({ ...base, ...over });

describe('request schema per cycle (decisionSchemaForContext)', () => {
  const decisionEnum = (c: DecisionContext): unknown => {
    const json = zodToJsonSchema(decisionSchemaForContext(c) as never) as { properties: Record<string, { enum?: unknown }> };
    return json.properties.decision!.enum;
  };

  it('offers collect in a regular cycle', () => {
    assert.deepEqual(decisionEnum(ctx), ['goal_complete', 'follow_up', 'collect']);
  });

  it('offers only goal_complete and follow_up in the follow-up cycle after verification', () => {
    assert.deepEqual(decisionEnum({ ...ctx, afterVerification: true }), ['goal_complete', 'follow_up']);
  });

  it('keys the two cycles apart in the schema cache', () => {
    assert.notEqual(decisionSchemaKey(ctx), decisionSchemaKey({ ...ctx, afterVerification: true }));
  });
});

describe('answerTiesFiles', () => {
  it('sees a collected id, a pair, or an instance file id as a tie', () => {
    assert.equal(answerTiesFiles(answer({ collected_document_ids: [], matched_files: [] })), false);
    assert.equal(answerTiesFiles(answer({ matched_files: [] })), true);
    assert.equal(answerTiesFiles(answer({ collected_document_ids: [] })), true);
    assert.equal(
      answerTiesFiles(
        answer({
          collected_document_ids: [],
          matched_files: [],
          added_instances: [
            {
              anchor_document_id: 'doc-study',
              instances: [{ name: 'קרן השתלמות הראל', description: null, already_provided: false, file_ids: ['file-harel'] }],
              evidence: { message_id: 'msg-1', quote: 'כן' },
            },
          ],
        }),
      ),
      true,
    );
  });
});

describe('the collect decision (normalizeDecision)', () => {
  it('accepts a collecting answer with no message and returns the ties', () => {
    const decision = normalizeDecision(answer({}), ctx);
    assert.equal(decision.decision, 'collect');
    if (decision.decision !== 'collect') return;
    assert.deepEqual(decision.collected_document_ids, ['doc-bank-leumi']);
    assert.equal(decision.matched_files.length, 1);
    assert.equal(decision.tax_fetch, null);
  });

  it('accepts a claimed-only answer (collected without a file) as collect', () => {
    const decision = normalizeDecision(answer({ matched_files: [] }), ctx);
    assert.equal(decision.decision, 'collect');
  });

  it('rejects collect that ties nothing', () => {
    assert.throws(() => normalizeDecision(answer({ collected_document_ids: [], matched_files: [] }), ctx), /ties no file/);
  });

  it('rejects collect with a message text', () => {
    assert.throws(() => normalizeDecision(answer({ channel: 'whatsapp', whatsapp_text: 'תודה, קיבלתי' }), ctx), /leave whatsapp_text null/);
  });

  it('rejects collect with a template message', () => {
    assert.throws(
      () => normalizeDecision(answer({ whatsapp_template: { template_id: 'HX1', variables: [] } }), ctx),
      /leave whatsapp_template null/,
    );
  });

  it('rejects collect with a send_at', () => {
    assert.throws(() => normalizeDecision(answer({ send_at: '2026-09-23 17:00' }), ctx), /leave send_at null/);
  });

  it('rejects collect with a fetch action', () => {
    assert.throws(
      () => normalizeDecision(answer({ tax_fetch_action: 'client_agreed', tax_fetch_provider: 'altshuler_shaham', tax_fetch_document_keys: ['pension_annual'] }), ctx),
      /cannot carry a tax_fetch_action/,
    );
  });

  it("rejects collect with an attestation 'request'", () => {
    assert.throws(() => normalizeDecision(answer({ attestation: 'request' }), ctx), /cannot carry attestation 'request'/);
  });

  it('rejects collect in the follow-up cycle after verification', () => {
    assert.throws(() => normalizeDecision(answer({}), { ...ctx, afterVerification: true }), /not allowed in this cycle/);
  });

  it('rejects a follow_up that ties a file', () => {
    assert.throws(
      () => normalizeDecision(answer({ decision: 'follow_up', channel: 'whatsapp', whatsapp_text: 'תודה', send_at: '2026-09-23 17:00' }), ctx),
      /follow_up answer must not tie files/,
    );
  });

  it('still accepts a follow_up that ties nothing and carries a message', () => {
    const decision = normalizeDecision(
      answer({ decision: 'follow_up', collected_document_ids: [], matched_files: [], channel: 'whatsapp', whatsapp_text: 'מה שלומך?', send_at: '2026-09-23 17:00' }),
      ctx,
    );
    assert.equal(decision.decision, 'follow_up');
  });
});

describe('correctionSuffix', () => {
  it('states the three-value rule', () => {
    const suffix = correctionSuffix('{}', new Error('boom'));
    assert.ok(suffix.includes('"collect"'));
    assert.ok(suffix.includes('every message field and send_at MUST be null'));
    assert.ok(suffix.includes('"follow_up"'));
    assert.ok(suffix.includes('exactly one full message'));
  });
});
