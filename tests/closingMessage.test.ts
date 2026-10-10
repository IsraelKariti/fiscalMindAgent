import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  accountantDisplayName,
  clientFirstName,
  closingMessageDelivery,
  closingMessageText,
} from '../src/agents/declarationOfCapital/closingMessage.js';

const client = { name: 'ישראל ישראלי', wa_phone: '+972501234567' };
const sender = { phone_number: '+97231234567' };

test('closingMessageDelivery sends inside an open window with a sender and a number', () => {
  const d = closingMessageDelivery(client, null, { allowed: true, windowOpen: true }, sender);
  assert.equal(d.send, true);
  if (d.send) {
    assert.equal(d.from, sender.phone_number);
    assert.equal(d.to, client.wa_phone);
    assert.ok(d.body.startsWith('תודה רבה ישראל!'));
  }
});

test('closingMessageDelivery skips (never a template) when the window is closed, whatsapp is off, or nothing can send', () => {
  assert.deepEqual(closingMessageDelivery(client, null, { allowed: true, windowOpen: false }, sender), { send: false, reason: '24h window closed' });
  assert.equal(closingMessageDelivery(client, null, { allowed: false, windowOpen: false }, sender).send, false);
  assert.equal(closingMessageDelivery(client, null, { allowed: true, windowOpen: true }, null).send, false);
  assert.equal(closingMessageDelivery({ name: 'x', wa_phone: null }, null, { allowed: true, windowOpen: true }, sender).send, false);
});

test('clientFirstName takes the first word and tolerates extra spaces and a one-word name', () => {
  assert.equal(clientFirstName({ name: 'ישראל ישראלי' }), 'ישראל');
  assert.equal(clientFirstName({ name: '  דוד   כהן ' }), 'דוד');
  assert.equal(clientFirstName({ name: 'מדונה' }), 'מדונה');
  assert.equal(clientFirstName({ name: '   ' }), '');
});

test('accountantDisplayName follows the prompt chain: hebrew_name, name, email, generic role', () => {
  assert.equal(accountantDisplayName({ hebrew_name: ' כהן ושות\' ', name: 'Cohen & Co', email: 'a@b.c' }), "כהן ושות'");
  assert.equal(accountantDisplayName({ hebrew_name: '  ', name: 'Cohen & Co', email: 'a@b.c' }), 'Cohen & Co');
  assert.equal(accountantDisplayName({ hebrew_name: null, name: null, email: 'a@b.c' }), 'a@b.c');
  assert.equal(accountantDisplayName(null), 'המטפל בתיק');
});

test('closingMessageText thanks by first name and says the accountant will be in touch if needed', () => {
  const text = closingMessageText({ name: 'ישראל ישראלי' }, { hebrew_name: 'כהן ושות\'', name: null, email: 'a@b.c' });
  assert.equal(text, "תודה רבה ישראל! קיבלנו את כל מה שצריך להצהרת ההון. אם יהיה צורך במשהו נוסף, רואה החשבון כהן ושות' ייצור איתך קשר.");
  assert.ok(!text.includes('**'), 'plain text, no markdown');
  assert.ok(!text.includes('?'), 'the closing message asks nothing');
});

test('closingMessageText without a client name still reads naturally', () => {
  const text = closingMessageText({ name: '' }, null);
  assert.ok(text.startsWith('תודה רבה!'));
  assert.ok(text.includes('המטפל בתיק'));
});
