import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { allPassed, check, maskId } from '../src/agents/shared/gateChecks.js';

test('check() keeps the note only on a failure and defaults the values to null', () => {
  assert.deepEqual(check('legible', true, 'ignored on a pass'), {
    key: 'legible',
    passed: true,
    note: null,
    observed: null,
    expected: null,
  });
  assert.deepEqual(check('as_of_date', false, 'wrong date', { observed: '2025-09-30', expected: '2025-12-31' }), {
    key: 'as_of_date',
    passed: false,
    note: 'wrong date',
    observed: '2025-09-30',
    expected: '2025-12-31',
  });
  // Empty strings are "nothing to show", not a value.
  assert.equal(check('x', false, '', { observed: '  ', expected: '' }).note, null);
  assert.equal(check('x', true, null, { observed: '  ' }).observed, null);
});

test('check() caps the note at 500 and the values at 300 characters', () => {
  const long = 'a'.repeat(1000);
  const c = check('x', false, long, { observed: long, expected: long });
  assert.equal(c.note?.length, 500);
  assert.equal(c.observed?.length, 300);
  assert.equal(c.expected?.length, 300);
});

test('maskId keeps only the last three digits', () => {
  assert.equal(maskId('123456782'), '••••••782');
  assert.equal(maskId('12-345-6782'), '••••••782');
  assert.equal(maskId('82'), '••');
  assert.equal(maskId(''), '');
});

test('allPassed is true only when every check passed', () => {
  assert.equal(allPassed([check('a', true), check('b', true)]), true);
  assert.equal(allPassed([check('a', true), check('b', false, 'no')]), false);
  assert.equal(allPassed([]), true);
});
