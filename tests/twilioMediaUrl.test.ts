import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isAllowedTwilioMediaUrl } from '../src/webhook/twilioMediaUrl.js';

test('accepts real Twilio media URLs', () => {
  assert.ok(isAllowedTwilioMediaUrl(
    'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM456/Media/ME789',
  ));
  assert.ok(isAllowedTwilioMediaUrl('https://twilio.com/anything'));
});

test('rejects attacker-controlled and internal hosts', () => {
  assert.ok(!isAllowedTwilioMediaUrl('https://attacker.com/steal-creds'));
  assert.ok(!isAllowedTwilioMediaUrl('http://169.254.169.254/metadata/instance'));
  assert.ok(!isAllowedTwilioMediaUrl('https://localhost:3000/admin'));
  assert.ok(!isAllowedTwilioMediaUrl('https://api.twilio.com.attacker.com/x'));
  assert.ok(!isAllowedTwilioMediaUrl('https://eviltwilio.com/x'));
});

test('rejects non-https schemes even on twilio.com', () => {
  assert.ok(!isAllowedTwilioMediaUrl('http://api.twilio.com/x'));
  assert.ok(!isAllowedTwilioMediaUrl('ftp://api.twilio.com/x'));
  assert.ok(!isAllowedTwilioMediaUrl('file:///etc/passwd'));
});

test('rejects malformed input', () => {
  assert.ok(!isAllowedTwilioMediaUrl(''));
  assert.ok(!isAllowedTwilioMediaUrl('not a url'));
  assert.ok(!isAllowedTwilioMediaUrl('//api.twilio.com/x'));
});

test('host matching is case-insensitive', () => {
  assert.ok(isAllowedTwilioMediaUrl('https://API.TWILIO.COM/x'));
});
