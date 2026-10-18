import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildSenderCreateBody, defaultSenderDisplayName, planSenderUpdate } from '../src/twilio/senderProfile.js';

const WEBHOOK = 'https://agent.fiscalmind.app/webhooks/twilio';
const LOGO = 'https://agent.fiscalmind.app/petal-seal.png';

test('buildSenderCreateBody: snake_case body with the logo when present', () => {
  const body = buildSenderCreateBody({
    phoneNumber: '+12025550123',
    wabaId: 'waba1',
    webhookUrl: WEBHOOK,
    displayName: 'FiscalMind',
    logoUrl: LOGO,
  });
  assert.deepEqual(body, {
    sender_id: 'whatsapp:+12025550123',
    configuration: { waba_id: 'waba1' },
    webhook: { callback_url: WEBHOOK, callback_method: 'POST' },
    profile: { name: 'FiscalMind', logo_url: LOGO },
  });
});

test('buildSenderCreateBody: no logo key at all when the logo is skipped', () => {
  const body = buildSenderCreateBody({
    phoneNumber: '+12025550123',
    wabaId: 'waba1',
    webhookUrl: WEBHOOK,
    displayName: 'FiscalMind',
    logoUrl: undefined,
  });
  assert.deepEqual(body.profile, { name: 'FiscalMind' });
  assert.ok(!('logo_url' in body.profile));
});

test('planSenderUpdate: nothing to do when webhook and logo already match', () => {
  assert.equal(planSenderUpdate({ callbackUrl: WEBHOOK, logoUrl: LOGO }, { webhookUrl: WEBHOOK, logoUrl: LOGO }), null);
});

test('planSenderUpdate: nothing to do when only the logo differs but no public logo is available', () => {
  assert.equal(planSenderUpdate({ callbackUrl: WEBHOOK, logoUrl: null }, { webhookUrl: WEBHOOK, logoUrl: undefined }), null);
});

test('planSenderUpdate: webhook only', () => {
  const plan = planSenderUpdate({ callbackUrl: 'https://old.example.com/hook', logoUrl: LOGO }, { webhookUrl: WEBHOOK, logoUrl: LOGO });
  assert.deepEqual(plan, {
    body: { webhook: { callback_url: WEBHOOK, callback_method: 'POST' } },
    webhookChanged: true,
  });
});

test('planSenderUpdate: logo only, never the name', () => {
  const plan = planSenderUpdate({ callbackUrl: WEBHOOK, logoUrl: null }, { webhookUrl: WEBHOOK, logoUrl: LOGO });
  assert.deepEqual(plan, { body: { profile: { logo_url: LOGO } }, webhookChanged: false });
  assert.ok(!('name' in plan!.body.profile!));
});

test('planSenderUpdate: both in one body when the logo differs too', () => {
  const plan = planSenderUpdate(
    { callbackUrl: undefined, logoUrl: 'https://agent.fiscalmind.app/old.png' },
    { webhookUrl: WEBHOOK, logoUrl: LOGO },
  );
  assert.deepEqual(plan, {
    body: { webhook: { callback_url: WEBHOOK, callback_method: 'POST' }, profile: { logo_url: LOGO } },
    webhookChanged: true,
  });
});

test('planSenderUpdate: picture-only update leaves a foreign webhook alone', () => {
  const plan = planSenderUpdate({ callbackUrl: 'https://other.example.com/hook', logoUrl: null }, { webhookUrl: undefined, logoUrl: LOGO });
  assert.deepEqual(plan, { body: { profile: { logo_url: LOGO } }, webhookChanged: false });
  assert.ok(!('webhook' in plan!.body));
});

test('planSenderUpdate: picture-only update is a no-op when the logo already matches, even on a foreign webhook', () => {
  assert.equal(planSenderUpdate({ callbackUrl: 'https://other.example.com/hook', logoUrl: LOGO }, { webhookUrl: undefined, logoUrl: LOGO }), null);
});

test('defaultSenderDisplayName: Hebrew name wins and gets the "by brand" suffix on the platform WABA', () => {
  assert.equal(
    defaultSenderDisplayName({ hebrewName: "אריה רותם ושות'", name: 'Arie Rotem', brand: 'FiscalMind', ownWaba: false }),
    "אריה רותם ושות' by FiscalMind",
  );
});

test('defaultSenderDisplayName: account name when there is no Hebrew name', () => {
  assert.equal(
    defaultSenderDisplayName({ hebrewName: '  ', name: 'Arie Rotem', brand: 'FiscalMind', ownWaba: false }),
    'Arie Rotem by FiscalMind',
  );
});

test('defaultSenderDisplayName: brand alone when the accountant has no name', () => {
  assert.equal(defaultSenderDisplayName({ hebrewName: null, name: null, brand: 'FiscalMind', ownWaba: false }), 'FiscalMind');
});

test('defaultSenderDisplayName: no suffix under the accountant\'s own WABA', () => {
  assert.equal(
    defaultSenderDisplayName({ hebrewName: "אריה רותם ושות'", name: null, brand: 'FiscalMind', ownWaba: true }),
    "אריה רותם ושות'",
  );
});
