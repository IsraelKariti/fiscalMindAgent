import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { IMPERSONATION_REFRESH_AFTER_MS, evaluateImpersonationCookie } from '../src/api/impersonationCookie.js';

const ADMIN = 'admin-1';
const TARGET = 'accountant-1';
const NOW = 1_800_000_000_000;
const IDLE_MS = 24 * 60 * 60 * 1000;

// Dot-free like the real hex HMAC — dots are the cookie's field separator.
const sign = (payload: string) => `sig-${payload.replaceAll('.', '_')}`;
const same = (a: string, b: string) => a === b;

function cookie(admin: string, target: string, expiresAt: number, signature?: string): string {
  const payload = `${admin}.${target}.${expiresAt}`;
  return `${payload}.${signature ?? sign(payload)}`;
}

const evaluate = (value: string | null, realUserId = ADMIN, now = NOW) =>
  evaluateImpersonationCookie(value, realUserId, now, IDLE_MS, sign, same);

describe('evaluateImpersonationCookie', () => {
  it('is none without a cookie', () => {
    assert.deepEqual(evaluate(null), { state: 'none' });
  });

  it('is active, without refresh, right after it was issued', () => {
    assert.deepEqual(evaluate(cookie(ADMIN, TARGET, NOW + IDLE_MS)), {
      state: 'active',
      targetUserId: TARGET,
      refresh: false,
    });
  });

  it('asks for a refresh only once the threshold of the idle period is used', () => {
    const issuedAgo = (ms: number) => evaluate(cookie(ADMIN, TARGET, NOW + IDLE_MS - ms));
    assert.equal((issuedAgo(IMPERSONATION_REFRESH_AFTER_MS) as { refresh: boolean }).refresh, false);
    assert.equal((issuedAgo(IMPERSONATION_REFRESH_AFTER_MS + 1) as { refresh: boolean }).refresh, true);
  });

  it('scales the refresh threshold down for a short idle period, so it still slides', () => {
    const shortIdle = 60_000;
    const usedMs = (ms: number) =>
      evaluateImpersonationCookie(cookie(ADMIN, TARGET, NOW + shortIdle - ms), ADMIN, NOW, shortIdle, sign, same);
    assert.equal((usedMs(6_000) as { refresh: boolean }).refresh, false);
    assert.equal((usedMs(6_001) as { refresh: boolean }).refresh, true);
  });

  it('stays active up to the last millisecond of the idle period', () => {
    assert.equal(evaluate(cookie(ADMIN, TARGET, NOW)).state, 'active');
  });

  it('is expired — and still names the target — once the idle period passed', () => {
    assert.deepEqual(evaluate(cookie(ADMIN, TARGET, NOW - 1)), { state: 'expired', targetUserId: TARGET });
  });

  it('ignores a cookie with a bad signature, even an expired one', () => {
    assert.deepEqual(evaluate(cookie(ADMIN, TARGET, NOW + IDLE_MS, 'forged')), { state: 'none' });
    assert.deepEqual(evaluate(cookie(ADMIN, TARGET, NOW - 1, 'forged')), { state: 'none' });
  });

  it('ignores a cookie issued to another admin', () => {
    assert.deepEqual(evaluate(cookie('admin-2', TARGET, NOW + IDLE_MS)), { state: 'none' });
    assert.deepEqual(evaluate(cookie('admin-2', TARGET, NOW - 1)), { state: 'none' });
  });

  it('ignores malformed cookies', () => {
    for (const value of ['', 'a.b.c', `${ADMIN}.${TARGET}.soon.sig`, `${cookie(ADMIN, TARGET, NOW + IDLE_MS)}.extra`]) {
      assert.deepEqual(evaluate(value), { state: 'none' }, value);
    }
  });
});
