import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { advisorKeyOf, advisorOptionsOf, isAdvisedBy, isAssignedTo } from '../web/src/format.js';

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

// The tax advisor picker (openspec `client-search`, sidebar-advisor-picker).

const client = (name: string, email: string | null) => ({ agent_fields: { tax_advisor: { name, email } } });

test('other advisors are listed once each, by name', () => {
  const clients = [client('רונית לוי', 'ronit@office.co.il'), client('אבי כהן', 'avi@office.co.il'), client('דנה שמש', 'dana@office.co.il'), client('אבי כהן', 'avi@office.co.il')];
  assert.deepEqual(
    advisorOptionsOf(clients, 'boss@office.co.il').map((a) => a.name),
    ['אבי כהן', 'דנה שמש', 'רונית לוי'],
  );
});

test('the same email in two letter cases is one advisor', () => {
  const clients = [client('דנה שמש', 'Dana@Office.co.il'), client('דנה שמש', 'dana@office.co.il')];
  const options = advisorOptionsOf(clients, null);
  assert.equal(options.length, 1);
  assert.equal(clients.every((c) => isAdvisedBy(c, options[0]?.key ?? '', null)), true);
});

test('the signed-in person is not repeated among the other advisors', () => {
  const clients = [client('הבוס', 'Boss@office.co.il'), client('דנה שמש', 'dana@office.co.il')];
  assert.deepEqual(advisorOptionsOf(clients, 'boss@office.co.il').map((a) => a.name), ['דנה שמש']);
});

test('an advisor without an email is told apart by name', () => {
  const clients = [client('יוסי', null), client('יוסי', null), client('דנה שמש', 'dana@office.co.il')];
  const yossi = advisorOptionsOf(clients, null).find((a) => a.name === 'יוסי');
  const key = yossi?.key ?? '';
  assert.notEqual(key, '');
  assert.deepEqual(clients.map((c) => isAdvisedBy(c, key, null)), [true, true, false]);
});

test('a client with no advisor is listed only under "all"', () => {
  assert.equal(advisorKeyOf({}), '');
  assert.equal(isAdvisedBy({}, 'all', 'dana@office.co.il'), true);
  assert.equal(isAdvisedBy({}, 'me', 'dana@office.co.il'), false);
  assert.equal(isAdvisedBy({}, 'dana@office.co.il', 'dana@office.co.il'), false);
  assert.deepEqual(advisorOptionsOf([{}, { agent_fields: {} }], null), []);
});

test('"me" keeps only my own clients', () => {
  assert.equal(isAdvisedBy(client('דנה שמש', 'Dana@Office.co.il'), 'me', 'dana@office.co.il'), true);
  assert.equal(isAdvisedBy(client('אבי כהן', 'avi@office.co.il'), 'me', 'dana@office.co.il'), false);
});
