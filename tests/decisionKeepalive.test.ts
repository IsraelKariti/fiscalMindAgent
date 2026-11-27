import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DecisionContext } from '../src/agents/declarationOfCapital/decisionSchema.js';
import { judgeRun } from '../src/agents/declarationOfCapital/decisionJudge.js';
import { endingCorrectionNote, type ToolCall } from '../src/agents/declarationOfCapital/decisionTools.js';

// The 2026-08-02 production incident: "no message needed, the client will
// reply with the SMS code" — the planner set a document-fetch action and
// scheduled nothing. Since the tool loop the same answer is a run with a
// fetch step and no ending: the loop sends the corrective note once, then
// fails the run; the fixed answer adds the message.

const fetchCall: ToolCall = { name: 'document_fetch', args: { action: 'start_login', provider: 'altshuler_shaham', document_keys: ['pension_annual'] } };

// The channel/fetch state at the time of the incident.
const ctx: DecisionContext = {
  windowOpen: true,
  templates: [],
  documentFetch: [
    {
      provider: 'altshuler_shaham',
      state: 'wa_intro_sent',
      available: true,
      clientOnWhatsapp: true,
      documentKeys: ['pension_annual'],
    },
  ],
};

describe('keepalive contract (the run needs an ending)', () => {
  it('a run that only sets a fetch action has no ending ("no message needed")', () => {
    const run = judgeRun([fetchCall], ctx);
    assert.deepEqual(run.refusals, []);
    assert.equal(run.documentFetch?.action, 'start_login');
    assert.equal(run.ending, 'none');
  });

  it('accepts the corrected run: the same fetch action plus a scheduled reminder', () => {
    const run = judgeRun([fetchCall, { name: 'send_whatsapp_text', args: { text: 'רק בודק - קיבלת את הקוד?', send_at: '2026-08-02 11:05', reasoning: 'reminder' } }], ctx);
    assert.deepEqual(run.refusals, []);
    assert.equal(run.ending, 'message');
    assert.deepEqual(run.message?.message, { channel: 'whatsapp', kind: 'freeform', body: 'רק בודק - קיבלת את הקוד?' });
    assert.equal(run.message?.sendAt, '2026-08-02 11:05');
    assert.equal(run.documentFetch?.action, 'start_login');
  });
});

describe('the corrective note', () => {
  it('states the ending rule: the four terminal tools, send_at, "no message needed" is never valid', () => {
    const note = endingCorrectionNote();
    assert.ok(note.includes('send_whatsapp_text') && note.includes('send_whatsapp_template') && note.includes('goal_complete') && note.includes('client_declined'));
    assert.ok(note.includes('send_at'));
    assert.ok(note.includes('"No message needed" is never a valid state'));
  });
});

describe('asap send_at (openspec reply-send-asap)', () => {
  it('accepts "asap" on the message and normalizes its case', () => {
    const run = judgeRun([fetchCall, { name: 'send_whatsapp_text', args: { text: 'מתחיל עכשיו', send_at: ' ASAP ', reasoning: 'r' } }], ctx);
    assert.equal(run.ending, 'message');
    assert.equal(run.message?.sendAt, 'asap');
  });

  it('still refuses a send_at that is neither a time nor "asap"', () => {
    const run = judgeRun([{ name: 'send_whatsapp_text', args: { text: 'מתחיל עכשיו', send_at: 'soon', reasoning: 'r' } }], ctx);
    assert.equal(run.ending, 'none');
    assert.match(run.refusals[0]!.reason, /send_at "soon" is not valid/);
  });
});
