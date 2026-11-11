import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { AdminConversation, AdminConversationMessage, AdminConversationStep, Email, LlmCallSummary } from '../web/src/api.js';
import { mergeTrace } from '../web/src/components/timelineRows.js';

// One re-plan cycle: a generate_message call wrote a draft, send_reply scheduled
// it, then a regenerate threw it away — the endpoint flags all three. A later
// cycle produced the live draft (not flagged) and its own call and step.
const T0 = Date.parse('2026-10-13T10:00:00Z');
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();

function call(id: string, endSec: number, durationMs: number, discarded: boolean): LlmCallSummary {
  return {
    id,
    purpose: 'generate_message',
    createdAt: at(endSec),
    durationMs,
    discarded,
  } as unknown as LlmCallSummary;
}

function step(id: string, sec: number, discarded: boolean): AdminConversationStep {
  return { id, action: 'send_reply', occurredAt: at(sec), discarded } as unknown as AdminConversationStep;
}

function draft(id: string, sec: number, discarded: boolean | undefined): AdminConversationMessage {
  return {
    id,
    direction: 'outbound',
    status: 'draft',
    channel: 'whatsapp',
    subject: '',
    body: `draft ${id}`,
    createdAt: at(sec),
    ...(discarded === undefined ? {} : { discarded }),
  } as unknown as AdminConversationMessage;
}

const inbound: Email = {
  id: 'in',
  direction: 'inbound',
  channel: 'whatsapp',
  subject: '',
  body: 'hi',
  sent_at: at(0),
  created_at: at(0),
} as unknown as Email;

const trace: AdminConversation = {
  messages: [inbound as unknown as AdminConversationMessage, draft('old', 12, true), draft('live', 32, false)],
  // Both calls started at +10s / +30s and ended at +11s / +31s.
  calls: [call('c-old', 11, 1000, true), call('c-live', 31, 1000, false)],
  steps: [step('s-old', 12, true), step('s-live', 32, false)],
} as unknown as AdminConversation;

const ids = (show: { calls: boolean; steps: boolean }) =>
  mergeTrace([inbound], trace, show).map((r) =>
    r.kind === 'message' ? `message:${r.email.id}` : r.kind === 'call' ? `call:${r.call.id}` : r.kind === 'draft' ? `draft:${r.message.id}` : `step:${r.step.id}`,
  );

test('no trace: only the thread', () => {
  assert.deepEqual(
    mergeTrace([inbound], null, { calls: true, steps: true }).map((r) => r.kind),
    ['message'],
  );
});

test('both toggles off: nothing from the trace', () => {
  assert.deepEqual(ids({ calls: false, steps: false }), ['message:in']);
});

test('LLM calls on: discarded draft shows with its call, no step', () => {
  assert.deepEqual(ids({ calls: true, steps: false }), ['message:in', 'call:c-old', 'draft:old', 'call:c-live']);
});

test('code steps only: the discarded step stays hidden, the live one shows', () => {
  assert.deepEqual(ids({ calls: false, steps: true }), ['message:in', 'step:s-live']);
});

test('both on: call, then send_reply, then the discarded draft', () => {
  assert.deepEqual(ids({ calls: true, steps: true }), [
    'message:in',
    'call:c-old',
    'step:s-old',
    'draft:old',
    'call:c-live',
    'step:s-live',
  ]);
});

test('a draft the endpoint did not flag is never a draft row', () => {
  // The live draft is not flagged — the scheduled bubble shows it, not the trace.
  const live = { ...trace, messages: [draft('live', 32, false), draft('unknown', 40, undefined)] } as AdminConversation;
  assert.deepEqual(
    mergeTrace([], live, { calls: true, steps: true }).filter((r) => r.kind === 'draft'),
    [],
  );
});

// Since the per-tool steps (openspec `conversation-trace`) the step that
// scheduled a draft is send_whatsapp_text / send_whatsapp_template; the
// endpoint flags it exactly like a send_reply step, and the rows follow the flag.
test('a discarded send_whatsapp_text step is hidden with the LLM calls off and shown with them on', () => {
  const sendStep = { id: 's-wa', action: 'send_whatsapp_text', occurredAt: at(12), discarded: true } as unknown as AdminConversationStep;
  const withTool = { ...trace, steps: [sendStep, ...trace.steps] } as AdminConversation;
  const rows = (show: { calls: boolean; steps: boolean }) =>
    mergeTrace([inbound], withTool, show).map((r) => (r.kind === 'step' ? `step:${r.step.id}` : r.kind === 'call' ? `call:${r.call.id}` : `${r.kind}`));
  assert.equal(rows({ calls: false, steps: true }).includes('step:s-wa'), false);
  assert.equal(rows({ calls: true, steps: true }).includes('step:s-wa'), true);
});
