import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { callDetailsText, callLinkOf, isCallHash, parseCallHash } from '../web/src/components/callLink.js';

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
