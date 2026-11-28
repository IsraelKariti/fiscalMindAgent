import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isAssignedTo } from '../web/src/format.js';

// openspec `client-search` (my-clients-filter): a client is "mine" when its advisor email is my email.

const advisor = (email: string | null) => ({ agent_fields: { tax_advisor: { email } } });

test('same email is mine', () => {
  assert.equal(isAssignedTo(advisor('dana@office.co.il'), 'dana@office.co.il'), true);
});

test('letter case and spaces are ignored', () => {
  assert.equal(isAssignedTo(advisor('Dana@Office.co.il'), ' dana@office.co.il '), true);
});

test('another advisor is not mine', () => {
  assert.equal(isAssignedTo(advisor('boss@office.co.il'), 'dana@office.co.il'), false);
});

test('missing advisor, advisor without email, or no signed-in email is never mine', () => {
  assert.equal(isAssignedTo({}, 'dana@office.co.il'), false);
  assert.equal(isAssignedTo({ agent_fields: {} }, 'dana@office.co.il'), false);
  assert.equal(isAssignedTo(advisor(null), 'dana@office.co.il'), false);
  assert.equal(isAssignedTo(advisor('dana@office.co.il'), null), false);
  assert.equal(isAssignedTo(advisor(''), ''), false);
});
