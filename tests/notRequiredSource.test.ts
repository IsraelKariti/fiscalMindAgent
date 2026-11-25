import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { notRequiredSource } from '../web/src/components/notRequiredSource.js';

// openspec `split-not-required-by-source`: the source of a "not required" row, from its stored evidence.

test('a questionnaire answer or an empty questionnaire question is the form', () => {
  assert.equal(notRequiredSource({ resolution_evidence: { source: 'form', question: 'קרן השתלמות?', quote: 'אין לי' } }), 'form');
  assert.equal(notRequiredSource({ resolution_evidence: { source: 'form_empty', question: 'קרן השתלמות?' } }), 'form');
});

test('a chat quote is the chat, with or without a message id', () => {
  assert.equal(notRequiredSource({ resolution_evidence: { message_id: 'm1', quote: 'אין לי רכב' } }), 'chat');
  assert.equal(notRequiredSource({ resolution_evidence: { quote: 'אין לי רכב' } }), 'chat');
  assert.equal(notRequiredSource({ resolution_evidence: { source: 'chat', message_id: 'm2', quote: 'שילמתי 100' } }), 'chat');
});

test('no evidence at all is a manual mark by the accountant', () => {
  assert.equal(notRequiredSource({ resolution_evidence: null }), 'accountant');
});
