import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { emailDeliveryStatus, isBlockedSendId } from '../src/resend/deliveryStatus.js';

// openspec `conversation-trace` (accountant-email-in-trace): Resend's last
// event word folds into the three badge colours of the step modal.

test('every Resend event word maps to a badge status', () => {
  const expected: Record<string, 'delivered' | 'pending' | 'failed'> = {
    delivered: 'delivered',
    opened: 'delivered',
    clicked: 'delivered',
    queued: 'pending',
    sent: 'pending',
    scheduled: 'pending',
    delivery_delayed: 'pending',
    bounced: 'failed',
    failed: 'failed',
    complained: 'failed',
    suppressed: 'failed',
    canceled: 'failed',
  };
  for (const [event, status] of Object.entries(expected)) {
    assert.deepEqual(emailDeliveryStatus(event), { status, event }, event);
  }
});

test('an event word the mapping does not know is never shown as fine', () => {
  assert.equal(emailDeliveryStatus('something_new').status, 'failed');
});

test('the outbound fence stand-in id is recognised', () => {
  assert.equal(isBlockedSendId('blocked-7f0a0b1c'), true);
  assert.equal(isBlockedSendId('re_7f0a0b1c'), false);
});
