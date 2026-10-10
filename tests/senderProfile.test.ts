import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildSenderCreateBody, planSenderUpdate, resolveSenderLogoUrl } from '../src/twilio/senderProfile.js';

const WEBHOOK = 'https://agent.fiscalmind.app/webhooks/twilio';
const LOGO = 'https://agent.fiscalmind.app/logo.png';

test('resolveSenderLogoUrl: configured https URL wins', () => {
  assert.equal(resolveSenderLogoUrl('https://cdn.example.com/brand.png', 'https://agent.fiscalmind.app'), 'https://cdn.example.com/brand.png');
});

test('resolveSenderLogoUrl: unset falls back to <APP_BASE_URL>/logo.png, trailing slash safe', () => {
  assert.equal(resolveSenderLogoUrl(undefined, 'https://agent.fiscalmind.app'), LOGO);
  assert.equal(resolveSenderLogoUrl('', 'https://agent.fiscalmind.app/'), LOGO);
});

test('resolveSenderLogoUrl: non-https results are skipped', () => {
  assert.equal(resolveSenderLogoUrl(undefined, 'http://localhost:3000'), undefined);
  assert.equal(resolveSenderLogoUrl('http://cdn.example.com/brand.png', 'https://agent.fiscalmind.app'), undefined);
});

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
