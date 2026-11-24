import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HttpTaxFetchClient } from '../src/agents/declarationOfCapital/taxFetch/fetchClient.js';
import { RUNNER_PROTOCOL_VERSION } from '../src/browserRunner/protocol.js';
import type { StoredEvidenceItem } from '../src/agents/declarationOfCapital/taxFetch/stepEvidence.js';

const record = (seq: number, name: string, sizes: Record<string, number>) => ({
  seq,
  name,
  at: '2026-11-25T10:00:00.000Z',
  url: 'https://site/login',
  title: 'Login',
  frames: ['https://site/login'],
  console: [],
  responses: [],
  error: null,
  missing: {},
  sizes,
});

/**
 * A runner stand-in: the login fails with a 502, then the evidence routes
 * serve two items. Records every request so the test can check the order:
 * the pull must happen inside startLogin, before the error reaches the
 * caller (and so before any container teardown the caller does).
 */
function fakeRunner(opts: { evidence: 'served' | 'missing' }) {
  const calls: string[] = [];
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (path === '/healthz') return json(200, { ok: true, protocolVersion: RUNNER_PROTOCOL_VERSION });
    if (path === '/sessions' && init?.method === 'POST') {
      return json(502, { error: 'the login button never appeared', screenshotBase64: Buffer.from('FALLBACK').toString('base64') });
    }
    if (opts.evidence === 'missing') return json(404, { error: 'no evidence' });
    if (path === '/sessions/s1/evidence?after=0') {
      return json(200, {
        items: [record(1, 'stub-01-login-page', { screenshot: 3, html: 5 }), record(2, 'login-failed', { screenshot: 3 })],
      });
    }
    if (path === '/sessions/s1/evidence/1/screenshot') return new Response(Buffer.from('PNG'), { status: 200 });
    if (path === '/sessions/s1/evidence/1/html') return new Response(Buffer.from('<p>x'), { status: 200 });
    if (path === '/sessions/s1/evidence/2/screenshot') return new Response(Buffer.from('PNG'), { status: 200 });
    return json(404, { error: `unexpected ${path}` });
  };
  return { calls, fetchImpl };
}

test('a failed login pulls and stores every step item before the error is thrown', async () => {
  const runner = fakeRunner({ evidence: 'served' });
  const stored: Array<{ sessionId: string; item: StoredEvidenceItem }> = [];
  const client = new HttpTaxFetchClient(() => 'http://runner', {
    fetchImpl: runner.fetchImpl,
    token: () => 'tok',
    evidenceSink: async (sessionId, item) => {
      stored.push({ sessionId, item });
      return true;
    },
  });
  await assert.rejects(client.startLogin('s1', 'stub', { idNumber: '1' }), /login button never appeared/);
  assert.deepEqual(
    stored.map((s) => [s.sessionId, s.item.record.seq, s.item.record.name, s.item.screenshot?.toString('utf8'), s.item.html?.toString('utf8') ?? null]),
    [
      ['s1', 1, 'stub-01-login-page', 'PNG', '<p>x'],
      ['s1', 2, 'login-failed', 'PNG', null],
    ],
  );
  // The pull and the part reads all happened during startLogin, after the 502.
  assert.deepEqual(runner.calls, [
    'GET /healthz',
    'POST /sessions',
    'GET /sessions/s1/evidence?after=0',
    'GET /sessions/s1/evidence/1/screenshot',
    'GET /sessions/s1/evidence/1/html',
    'GET /sessions/s1/evidence/2/screenshot',
  ]);
});

test('when the runner has no evidence to pull, the 502 screenshot is kept as a fallback item', async () => {
  const runner = fakeRunner({ evidence: 'missing' });
  const stored: StoredEvidenceItem[] = [];
  const client = new HttpTaxFetchClient(() => 'http://runner', {
    fetchImpl: runner.fetchImpl,
    token: () => 'tok',
    evidenceSink: async (_sessionId, item) => {
      stored.push(item);
      return true;
    },
  });
  await assert.rejects(client.startLogin('s1', 'stub', { idNumber: '1' }), /login button never appeared/);
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.record.name, 'login-failed-fallback');
  assert.equal(stored[0]?.screenshot?.toString('utf8'), 'FALLBACK');
});

test('a pull that fails never changes the step outcome', async () => {
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = String(input).replace(/^https?:\/\/[^/]+/, '');
    if (path.endsWith('/otp') && init?.method === 'POST') return new Response(null, { status: 204 });
    throw new Error('network down');
  };
  const client = new HttpTaxFetchClient(() => 'http://runner', { fetchImpl, token: () => 'tok', evidenceSink: async () => true });
  await client.submitOtp('s1', '123456'); // resolves although the evidence list threw
});
