import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { matchTaxAdvisor, readTaxAdvisor } from '../src/agents/declarationOfCapital/taxAdvisor.js';

const person = { name: 'דנה לוי', email: 'Dana@Office.co.il', mondayUserId: '42' };

test('the accountant\'s own email matches first', () => {
  const stored = matchTaxAdvisor(person, 'dana@office.co.il', { id: 's1', email: 'dana@office.co.il' });
  assert.equal(stored.match, 'accountant');
  assert.equal(stored.staff_id, undefined);
  assert.equal(stored.email, 'Dana@Office.co.il');
});

test('a staff row matches in another letter case and carries its id', () => {
  const stored = matchTaxAdvisor(person, 'boss@office.co.il', { id: 's1', email: 'dana@office.co.il' });
  assert.deepEqual(stored, { name: 'דנה לוי', email: 'Dana@Office.co.il', monday_user_id: '42', match: 'staff', staff_id: 's1' });
});

test('a person on no list is unmatched but kept by name and email', () => {
  const stored = matchTaxAdvisor(person, 'boss@office.co.il', null);
  assert.equal(stored.match, 'none');
  assert.equal(stored.name, 'דנה לוי');
});

test('no email (token without users:read) is unmatched by name only', () => {
  const stored = matchTaxAdvisor({ ...person, email: null }, 'dana@office.co.il', { id: 's1', email: 'dana@office.co.il' });
  assert.deepEqual(stored, { name: 'דנה לוי', email: null, monday_user_id: '42', match: 'none' });
});

test('readTaxAdvisor tolerates missing or malformed values', () => {
  assert.equal(readTaxAdvisor({}), null);
  assert.equal(readTaxAdvisor({ tax_advisor: 'דנה' }), null);
  assert.deepEqual(readTaxAdvisor({ tax_advisor: { name: 'דנה', monday_user_id: '42', match: 'weird' } }), {
    name: 'דנה',
    email: null,
    monday_user_id: '42',
    match: 'none',
  });
});
