import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Server } from 'node:http';

// The runner's env is read at import time; the token must exist before the server module loads.
process.env['BROWSER_RUNNER_TOKEN'] = 'test-token-test-token-test';
process.env['DOCUMENT_FETCH_SESSION_TTL_MS'] = '2000';
// A provider whose egress proxy is misconfigured (openspec `fetch-egress-proxy`).
process.env['DOCUMENT_FETCH_PROXY_BADPROXY'] = 'this is not a url';

const { createRunnerApp, closeAllSessions } = await import('../src/browserRunner/server.js');
const { attachCollector, debugShot } = await import('../src/browserRunner/launch.js');
const { RUNNER_PROTOCOL_VERSION } = await import('../src/browserRunner/protocol.js');

const TOKEN = 'test-token-test-token-test';
const auth = { authorization: `Bearer ${TOKEN}` };

/** A page stub rich enough for captureStep and for the listeners attachCollector registers. */
function stubPage() {
  const mainFrame = { url: () => 'https://site/login', content: async () => '<html><body>login</body></html>' };
  return {
    on: () => undefined,
    url: () => 'https://site/login',
    title: async () => 'Login',
    frames: () => [mainFrame],
    mainFrame: () => mainFrame,
    screenshot: async () => Buffer.from('PNGDATA'),
    context: () => ({
      newCDPSession: async () => ({ send: async () => ({ data: 'MHTML' }), detach: async () => undefined }),
    }),
  };
}

const launchedFor: string[] = [];
function stubLaunch() {
  const page = stubPage();
  const egress = { mode: 'proxy', host: 'proxy.test:8080' } as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attachCollector(page as any, egress);
  return async (providerId?: string) => {
    launchedFor.push(providerId ?? '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { browser: { close: async () => undefined }, context: {}, page, egress } as any;
  };
}

/** A provider that records a step and then fails the login. */
const failingProvider = {
  id: 'stub',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startLogin: async (page: any) => {
    await debugShot(page, 'stub-01-login-page');
    throw new Error('the login button never appeared');
  },
  submitOtp: async () => undefined,
  downloadDocuments: async () => [],
};

async function listen(): Promise<{ base: string; server: Server }> {
  const app = createRunnerApp({ providers: { stub: failingProvider, badproxy: failingProvider }, launch: stubLaunch() });
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { base: `http://127.0.0.1:${port}`, server };
}

test('a failed login leaves its step items, listable and fetchable by the worker; wrong paths 404; no token 401', async () => {
  const { base, server } = await listen();
  try {
    const health = (await (await fetch(`${base}/healthz`)).json()) as { protocolVersion: number };
    assert.equal(health.protocolVersion, RUNNER_PROTOCOL_VERSION);
    assert.equal(RUNNER_PROTOCOL_VERSION, 4);

    const login = await fetch(`${base}/sessions`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1', provider: 'stub', credentials: { idNumber: '1' } }),
    });
    assert.equal(login.status, 502);
    const body = (await login.json()) as { error: string; screenshotBase64?: string };
    assert.match(body.error, /login button never appeared/);
    assert.equal(Buffer.from(body.screenshotBase64 ?? '', 'base64').toString('utf8'), 'PNGDATA');

    // The browser is closed, but the evidence of the session is still served.
    const list = await fetch(`${base}/sessions/s1/evidence`, { headers: auth });
    assert.equal(list.status, 200);
    const { items } = (await list.json()) as {
      items: Array<{ seq: number; name: string; error: string | null; sizes: Record<string, number>; egress?: unknown }>;
    };
    assert.deepEqual(
      items.map((i) => [i.seq, i.name, i.error]),
      [
        [1, 'stub-01-login-page', null],
        [2, 'login-failed', 'the login button never appeared'],
      ],
    );
    assert.equal(items[0]?.sizes['screenshot'], 7);
    // The launcher got the provider id, and the route sits on the first record only.
    assert.deepEqual(launchedFor, ['stub']);
    assert.deepEqual(items[0]?.egress, { mode: 'proxy', host: 'proxy.test:8080' });
    assert.equal(items[1]?.egress, undefined);

    // A misconfigured egress proxy refuses the session before any browser exists, naming the variable only.
    const bad = await fetch(`${base}/sessions`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's2', provider: 'badproxy', credentials: { idNumber: '1' } }),
    });
    assert.equal(bad.status, 502);
    const badBody = (await bad.json()) as { error: string };
    assert.equal(badBody.error, 'DOCUMENT_FETCH_PROXY_BADPROXY is not a proxy URL');
    assert.deepEqual(launchedFor, ['stub']);
    assert.equal((await fetch(`${base}/sessions/s2/evidence`, { headers: auth })).status, 404);

    const shot = await fetch(`${base}/sessions/s1/evidence/1/screenshot`, { headers: auth });
    assert.equal(shot.status, 200);
    assert.equal(shot.headers.get('content-type'), 'image/png');
    assert.equal(shot.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(Buffer.from(await shot.arrayBuffer()).toString('utf8'), 'PNGDATA');

    const html = await fetch(`${base}/sessions/s1/evidence/2/html`, { headers: auth });
    assert.equal(html.status, 200);
    assert.match(await html.text(), /<body>login<\/body>/);

    assert.equal((await fetch(`${base}/sessions/s1/evidence/9/screenshot`, { headers: auth })).status, 404);
    assert.equal((await fetch(`${base}/sessions/s1/evidence/1/cookies`, { headers: auth })).status, 404);
    assert.equal((await fetch(`${base}/sessions/nope/evidence`, { headers: auth })).status, 404);
    assert.equal((await fetch(`${base}/sessions/s1/evidence`)).status, 401);

    // Confirming up to seq 1 releases it; seq 2 is still there.
    const after = (await (await fetch(`${base}/sessions/s1/evidence?after=1`, { headers: auth })).json()) as { items: Array<{ seq: number }> };
    assert.deepEqual(after.items.map((i) => i.seq), [2]);
    assert.equal((await fetch(`${base}/sessions/s1/evidence/1/screenshot`, { headers: auth })).status, 404);
  } finally {
    await closeAllSessions();
    await new Promise((resolve) => server.close(resolve));
  }
});
