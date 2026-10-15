import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ownerLabel, parseOwnerLabel, POOL_LABEL } from '../src/twilio/numberOwnership.js';

const ID = 'd0ab1c27-5abe-4076-ad1f-211fd2aa0001';

test('ownerLabel/parseOwnerLabel round trip', () => {
  const label = ownerLabel('declaration_of_capital', ID);
  assert.equal(label, `fiscalmind declaration_of_capital ${ID}`);
  assert.deepEqual(parseOwnerLabel(label), { agentType: 'declaration_of_capital', instanceId: ID });
});

test('parseOwnerLabel: pool label records no owner', () => {
  assert.equal(parseOwnerLabel(POOL_LABEL), null);
});

test('parseOwnerLabel: phone number / empty / console text record no owner', () => {
  assert.equal(parseOwnerLabel('+972533453901'), null);
  assert.equal(parseOwnerLabel(''), null);
  assert.equal(parseOwnerLabel(null), null);
  assert.equal(parseOwnerLabel('Israel test number'), null);
  assert.equal(parseOwnerLabel('fiscalmind declaration_of_capital not-a-uuid'), null);
  assert.equal(parseOwnerLabel('fiscalmind declaration_of_capital'), null);
});

test('parseOwnerLabel: tolerates surrounding whitespace', () => {
  assert.deepEqual(parseOwnerLabel(`  fiscalmind  declaration_of_capital   ${ID} `), {
    agentType: 'declaration_of_capital',
    instanceId: ID,
  });
});
