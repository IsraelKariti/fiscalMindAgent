import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { numberSearchPlan } from '../src/twilio/provision.js';

test('numberSearchPlan: Israel searches mobile first, then local', () => {
  assert.deepEqual(numberSearchPlan('IL'), { country: 'IL', types: ['mobile', 'local'] });
});

test('numberSearchPlan: the country is passed through unchanged', () => {
  assert.equal(numberSearchPlan('US').country, 'US');
  assert.deepEqual(numberSearchPlan('US').types, ['mobile', 'local']);
});
