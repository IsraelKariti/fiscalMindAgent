import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { ClientAgentFields } from '../web/src/api.js';
import { questionnairePairs } from '../web/src/components/questionnairePairs.js';

// The admin-only questionnaire tab (openspec `admin-questionnaire-tab`) reads
// agent_fields.form_answers as stored at enrollment; anything else on the
// field must be ignored, never thrown on.

test('well-formed pairs come back in stored order', () => {
  const fields: ClientAgentFields = {
    form_answers: [
      { question: 'Do you have a vehicle?', answer: 'no' },
      { question: 'Bank accounts', answer: 'Leumi, Hapoalim' },
    ],
  };
  assert.deepEqual(questionnairePairs(fields), [
    { question: 'Do you have a vehicle?', answer: 'no' },
    { question: 'Bank accounts', answer: 'Leumi, Hapoalim' },
  ]);
});

test('a malformed entry is skipped, the rest survive', () => {
  const fields = {
    form_answers: [
      'not an object',
      null,
      { question: 42, answer: 'x' },
      { question: 'Kept', answer: 'yes' },
    ],
  } as unknown as ClientAgentFields;
  assert.deepEqual(questionnairePairs(fields), [{ question: 'Kept', answer: 'yes' }]);
});

test('a blank answer or blank question is dropped', () => {
  const fields: ClientAgentFields = {
    form_answers: [
      { question: 'Blank answer', answer: '   ' },
      { question: ' ', answer: 'blank question' },
      { question: 'Multi-line', answer: 'line one\nline two' },
    ],
  };
  assert.deepEqual(questionnairePairs(fields), [{ question: 'Multi-line', answer: 'line one\nline two' }]);
});

test('a missing key, a non-array value, or no fields at all gives an empty list', () => {
  assert.deepEqual(questionnairePairs({}), []);
  assert.deepEqual(questionnairePairs({ form_answers: 'nope' } as unknown as ClientAgentFields), []);
  assert.deepEqual(questionnairePairs(null), []);
  assert.deepEqual(questionnairePairs(undefined), []);
});
