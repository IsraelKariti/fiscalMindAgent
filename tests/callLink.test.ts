import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { callDetailsText, callLinkOf, isCallHash, parseCallHash, withNamedIds } from '../web/src/components/callLink.js';

const ID = '7d1b2e6a-5c3f-4a9e-8b0d-2f4c6e8a1b3d';
const ORIGIN = 'https://agent.fiscalmind.app';

test('callLinkOf: origin + #/llm-calls/<id>', () => {
  assert.equal(callLinkOf(ID, ORIGIN), `${ORIGIN}/#/llm-calls/${ID}`);
});

test('isCallHash: one call only, never the bare browser or other namespaces', () => {
  assert.equal(isCallHash(`#/llm-calls/${ID}`), true);
  assert.equal(isCallHash('#/llm-calls/x'), true);
  assert.equal(isCallHash('#/llm-calls'), false);
  assert.equal(isCallHash('#/llm-calls/'), false);
  assert.equal(isCallHash(`#/steps/${ID}`), false);
  assert.equal(isCallHash('#/'), false);
  assert.equal(isCallHash(''), false);
});

test('parseCallHash: valid link, with and without a trailing slash', () => {
  assert.equal(parseCallHash(`#/llm-calls/${ID}`), ID);
  assert.equal(parseCallHash(`#/llm-calls/${ID}/`), ID);
});

test('parseCallHash: not a uuid, a stray %, other hashes → null', () => {
  assert.equal(parseCallHash('#/llm-calls/not-a-uuid'), null);
  assert.equal(parseCallHash('#/llm-calls/%E0%A4%A'), null);
  assert.equal(parseCallHash('#/llm-calls'), null);
  assert.equal(parseCallHash(`#/llm-calls/${ID}/extra`), null);
  assert.equal(parseCallHash(`#/steps/${ID}`), null);
});

test('callDetailsText: link first, then the whole call as JSON, nothing dropped', () => {
  const call = {
    id: ID,
    createdAt: '2026-10-09T08:00:00.000Z',
    purpose: 'planner',
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    status: 'ok',
    error: null,
    attempts: 1,
    durationMs: 1234,
    clientId: '32107d96-4599-4484-9fa6-0c134ba4586d',
    clientName: 'Test Client',
    documentFileId: null,
    documentFileName: null,
    request: {
      model: 'gemini-2.5-pro',
      systemInstruction: 'You are the planner.',
      contents: [{ role: 'user', parts: [{ text: 'What next?' }] }],
      config: { responseJsonSchema: { type: 'object' } },
    },
    response: '{"decision":"collect"}',
  };
  const text = callDetailsText(call, ORIGIN);
  const [firstLine, blank, ...rest] = text.split('\n');
  assert.equal(firstLine, callLinkOf(ID, ORIGIN));
  assert.equal(blank, '');
  const parsed = JSON.parse(rest.join('\n'));
  assert.deepEqual(parsed, call);
  assert.deepEqual(parsed.request, call.request);
  assert.equal(parsed.response, call.response);
  assert.equal(parsed.documentFileId, null);
  assert.equal(parsed.documentFileName, null);
});

// openspec `llm-call-cache-usage`: the pasted JSON says how many tokens the
// input price applied to, right after the stored total.
test('callDetailsText: the full-price input count follows the stored input total', () => {
  const call = { id: ID, inputTokens: 54_193, outputTokens: 727, cachedTokens: 42_768, cacheWriteTokens: 0 };
  const parsed = JSON.parse(callDetailsText(call, ORIGIN).split('\n').slice(2).join('\n'));
  assert.equal(parsed.inputTokens, 54_193);
  assert.equal(parsed.fullPriceInputTokens, 11_425);
  assert.deepEqual(Object.keys(parsed).slice(0, 3), ['id', 'inputTokens', 'fullPriceInputTokens']);
});

// openspec `conversation-trace` (adapter-translation-visible): the copied
// details carry the request as sent next to the declared one.
test('callDetailsText: the sent copy of the request is in the pasted JSON', () => {
  const call = {
    id: ID,
    request: {
      model: 'claude-opus-5',
      config: { responseJsonSchema: { type: 'object', properties: { evidence: { type: ['string', 'null'] } }, required: ['evidence'] } },
      sent: { provider: 'anthropic', responseJsonSchema: { type: 'object', properties: { evidence: { type: 'string' } } }, strict: true, omitted: ['temperature'] },
    },
  };
  const text = callDetailsText(call, ORIGIN);
  const pasted = JSON.parse(text.slice(text.indexOf('\n\n') + 2)) as typeof call;
  assert.deepEqual(pasted.request.sent, call.request.sent);
  assert.deepEqual(pasted.request.config, call.request.config);
});

const NAMES = {
  documents: { 'a1ac6b1f-28ac-4439-9d44-f7905d6770fe': 'pension balance — Phoenix' },
  files: { '1c52e631-fe6a-41c1-a549-2fe8b0fde0eb': 'whatsapp-media-20261125-131858.pdf' },
};

test('withNamedIds: a name field right after each known id, ids untouched, order kept', () => {
  const args = {
    file_id: '1c52e631-fe6a-41c1-a549-2fe8b0fde0eb',
    document_id: 'a1ac6b1f-28ac-4439-9d44-f7905d6770fe',
    evidence_message_id: 'b330924b-1ffa-40f4-a5ba-af852c21818e',
    evidence_quote: '',
  };
  const out = withNamedIds(args, NAMES) as Record<string, unknown>;
  assert.deepEqual(Object.keys(out), ['file_id', 'file_name', 'document_id', 'document_name', 'evidence_message_id', 'evidence_quote']);
  assert.equal(out.file_id, args.file_id);
  assert.equal(out.file_name, 'whatsapp-media-20261125-131858.pdf');
  assert.equal(out.document_id, args.document_id);
  assert.equal(out.document_name, 'pension balance — Phoenix');
  assert.equal('evidence_message_name' in out, false);
});

test('withNamedIds: an id list gains a names list; an unknown id keeps its id in place', () => {
  const args = { anchor_document_id: 'a1ac6b1f-28ac-4439-9d44-f7905d6770fe', name: 'x', file_ids: ['1c52e631-fe6a-41c1-a549-2fe8b0fde0eb', 'deleted'] };
  const out = withNamedIds(args, NAMES) as Record<string, unknown>;
  assert.deepEqual(Object.keys(out), ['anchor_document_id', 'anchor_document_name', 'name', 'file_ids', 'file_names']);
  assert.deepEqual(out.file_names, ['whatsapp-media-20261125-131858.pdf', 'deleted']);
  assert.deepEqual(withNamedIds({ file_ids: ['deleted'] }, NAMES), { file_ids: ['deleted'] });
});

test('withNamedIds: no names map (older server) or a non-object leaves the args as they are', () => {
  const args = { document_id: 'a1ac6b1f-28ac-4439-9d44-f7905d6770fe' };
  assert.deepEqual(withNamedIds(args, undefined), args);
  assert.deepEqual(withNamedIds(args, { documents: {}, files: {} }), args);
  assert.equal(withNamedIds('text', NAMES), 'text');
  assert.equal(withNamedIds(null, NAMES), null);
});
