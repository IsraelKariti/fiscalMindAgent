import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  evidenceDayOf,
  evidenceKey,
  evidencePrefixFor,
  fallbackShotItem,
  groupEvidenceKeys,
  parseEvidenceKey,
} from '../src/agents/declarationOfCapital/documentFetch/stepEvidence.js';
import { RunnerStepError } from '../src/agents/declarationOfCapital/documentFetch/types.js';

const SESSION = '3f1c2a9e-0000-4000-8000-000000000001';
const prefix = evidencePrefixFor(SESSION, new Date('2026-11-25T22:30:00+02:00'));

test('a session prefix is its creation day (UTC) and its id', () => {
  assert.equal(prefix, `debug/documentfetch/2026-11-25/${SESSION}/`);
});

test('a part key pads the seq, keeps the step name safe and uses the part extension', () => {
  assert.equal(evidenceKey(prefix, 3, 'menora-03-otp screen/ü', 'screenshot'), `${prefix}03-menora-03-otp-screen.png`);
  assert.equal(evidenceKey(prefix, 12, 'login-failed', 'mhtml'), `${prefix}12-login-failed.mhtml`);
  assert.equal(evidenceKey(prefix, 1, 'x', 'record'), `${prefix}01-x.json`);
  assert.deepEqual(parseEvidenceKey(prefix, `${prefix}12-login-failed.mhtml`), { seq: 12, name: 'login-failed', part: 'mhtml' });
  assert.equal(parseEvidenceKey(prefix, `debug/documentfetch/2026-11-25/${SESSION}-login.png`), null);
});

test('a prefix listing groups into ordered steps with their parts', () => {
  const steps = groupEvidenceKeys(prefix, [
    `${prefix}02-menora-02-credentials-filled.json`,
    `${prefix}02-menora-02-credentials-filled.png`,
    `${prefix}01-menora-01-login-page.png`,
    `${prefix}01-menora-01-login-page.html`,
    `${prefix}01-menora-01-login-page.mhtml`,
    `${prefix}01-menora-01-login-page.json`,
    'debug/documentfetch/2026-11-25/other.png',
  ]);
  assert.deepEqual(steps, [
    { seq: 1, name: 'menora-01-login-page', parts: ['screenshot', 'html', 'mhtml', 'record'] },
    { seq: 2, name: 'menora-02-credentials-filled', parts: ['record', 'screenshot'] },
  ]);
});

test('the expiry fallback reads the day from both key layouts', () => {
  assert.equal(evidenceDayOf(`${prefix}01-x.png`), '2026-11-25');
  assert.equal(evidenceDayOf('debug/documentfetch/2026-08-02/abc-login.png'), '2026-08-02');
  assert.equal(evidenceDayOf('documents/abc.pdf'), null);
});

test('the 502 screenshot becomes a fallback item only when the error carries one', () => {
  const now = new Date('2026-11-25T10:00:00Z');
  const withShot = fallbackShotItem('login', new RunnerStepError('runner responded 502: x', Buffer.from('PNG')), now);
  assert.equal(withShot?.record.name, 'login-failed-fallback');
  assert.equal(withShot?.record.seq, 99);
  assert.equal(withShot?.record.error, 'runner responded 502: x');
  assert.equal(withShot?.screenshot?.toString('utf8'), 'PNG');
  assert.equal(fallbackShotItem('login', new RunnerStepError('no shot')), null);
  assert.equal(fallbackShotItem('login', new Error('plain')), null);
});
