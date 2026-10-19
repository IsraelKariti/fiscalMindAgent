import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { TestClientSchema } from '../src/agents/declarationOfCapital/testClientSchema.js';

// openspec `admin-test-client`: the form body the admin's test tab sends.
const valid = { name: 'ישראל ישראלי', phone: '052-123-4567', taxYear: 2025 };

test('the minimal body (name, phone, year) is accepted; blanks become null', () => {
  const parsed = TestClientSchema.parse({ ...valid, idNumber: '  ', spouseName: '' });
  assert.equal(parsed.name, valid.name);
  assert.equal(parsed.idNumber, null);
  assert.equal(parsed.spouseName, null);
  assert.equal(parsed.formAnswers, undefined);
});

test('a missing name, a bad year or an unknown field is refused', () => {
  assert.equal(TestClientSchema.safeParse({ ...valid, name: ' ' }).success, false);
  assert.equal(TestClientSchema.safeParse({ ...valid, taxYear: 25 }).success, false);
  assert.equal(TestClientSchema.safeParse({ ...valid, taxYear: '2025' }).success, false);
  assert.equal(TestClientSchema.safeParse({ ...valid, email: 'x@y' }).success, false);
  assert.equal(TestClientSchema.safeParse({ ...valid, maritalStatus: 'divorced' }).success, false);
});

test('questionnaire answers are question/answer pairs, at most 40', () => {
  const pair = { question: 'יש לך רכב?', answer: 'לא' };
  assert.equal(TestClientSchema.safeParse({ ...valid, formAnswers: [pair] }).success, true);
  assert.equal(TestClientSchema.safeParse({ ...valid, formAnswers: [{ question: '', answer: 'x' }] }).success, false);
  assert.equal(TestClientSchema.safeParse({ ...valid, formAnswers: Array.from({ length: 41 }, () => pair) }).success, false);
});
