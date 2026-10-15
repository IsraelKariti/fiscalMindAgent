import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ownerLabel, parseOwnerLabel, POOL_LABEL } from '../src/twilio/numberOwnership.js';

const ID = 'd0ab1c27-5abe-4076-ad1f-211fd2aa0001';

test('ownerLabel: id first, fits the 64-character Twilio limit', () => {
  const label = ownerLabel('declaration_of_capital', ID);
  assert.equal(label, `fiscalmind ${ID} declaration_of_c`);
  assert.equal(label.length, 64);
  assert.deepEqual(parseOwnerLabel(label), { instanceId: ID, agentType: 'declaration_of_c' });
});

test('parseOwnerLabel: old order with the id cut by Twilio still records the owner', () => {
  const cut = 'fiscalmind declaration_of_capital d0ab1c27-5abe-4076-ad1f-211fd2';
  assert.equal(cut.length, 64);
  assert.deepEqual(parseOwnerLabel(cut), {
    instanceId: 'd0ab1c27-5abe-4076-ad1f-211fd2',
    agentType: 'declaration_of_capital',
  });
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
  assert.equal(parseOwnerLabel(`fiscalmind ${ID} declaration_of_capital extra`), null);
});

test('parseOwnerLabel: tolerates surrounding whitespace', () => {
  assert.deepEqual(parseOwnerLabel(`  fiscalmind  ${ID}   declaration_of_capital `), {
    instanceId: ID,
    agentType: 'declaration_of_capital',
  });
});
