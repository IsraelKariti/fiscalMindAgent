import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DEFAULT_LIMITS, StepCollector, captureStep, fitWithinBudget, type EvidenceItem } from '../src/browserRunner/stepEvidence.js';

const record = (seq: number) => ({
  seq,
  name: `step-${seq}`,
  at: '2026-11-25T10:00:00.000Z',
  url: null,
  title: null,
  frames: [],
  console: [],
  responses: [],
  error: null,
  missing: {},
  sizes: {},
});

const item = (seq: number, sizes: { screenshot?: number; html?: number; mhtml?: number }): EvidenceItem => ({
  record: record(seq),
  screenshot: sizes.screenshot === undefined ? null : Buffer.alloc(sizes.screenshot, 1),
  html: sizes.html === undefined ? null : Buffer.alloc(sizes.html, 2),
  mhtml: sizes.mhtml === undefined ? null : Buffer.alloc(sizes.mhtml, 3),
});

test('console and error responses buffered since the previous step land on the next record, then the buffer clears', () => {
  const c = new StepCollector();
  c.pushConsole({ at: 't', type: 'error', text: 'boom' });
  c.pushResponse({ at: 't', method: 'GET', url: 'https://site/x', status: 500, failure: null });
  const first = c.nextRecord('login-page');
  assert.equal(first.seq, 1);
  assert.deepEqual(first.console.map((e) => e.text), ['boom']);
  assert.deepEqual(first.responses.map((r) => r.status), [500]);
  const second = c.nextRecord('credentials-filled', 'the form did not submit');
  assert.equal(second.seq, 2);
  assert.deepEqual(second.console, []);
  assert.deepEqual(second.responses, []);
  assert.equal(second.error, 'the form did not submit');
});

test('entries beyond the per-step cap are dropped, not accumulated', () => {
  const c = new StepCollector({ ...DEFAULT_LIMITS, entries: 2 });
  for (let i = 0; i < 5; i += 1) c.pushConsole({ at: 't', type: 'log', text: String(i) });
  assert.equal(c.nextRecord('x').console.length, 2);
});

test('listAfter / release hand items to the worker incrementally and free them once confirmed', () => {
  const c = new StepCollector();
  c.add(item(1, { screenshot: 10 }));
  c.add(item(2, { screenshot: 10 }));
  c.add(item(3, { screenshot: 10 }));
  assert.deepEqual(c.listAfter(0).map((i) => i.record.seq), [1, 2, 3]);
  assert.deepEqual(c.listAfter(2).map((i) => i.record.seq), [3]);
  c.release(2);
  assert.equal(c.get(1), undefined);
  assert.equal(c.get(3)?.record.seq, 3);
  assert.equal(c.heldBytes(), 10);
});

test('a part over its own cap is dropped and named in missing; the others stay', () => {
  const limits = { ...DEFAULT_LIMITS, html: 100 };
  const fitted = fitWithinBudget(item(1, { screenshot: 50, html: 101, mhtml: 60 }), 0, limits);
  assert.equal(fitted.html, null);
  assert.match(fitted.record.missing.html ?? '', /over the html size limit/);
  assert.equal(fitted.screenshot?.length, 50);
  assert.equal(fitted.mhtml?.length, 60);
  assert.deepEqual(fitted.record.sizes, { screenshot: 50, mhtml: 60 });
});

test('the session budget drops MHTML first, then HTML, never the screenshot', () => {
  const limits = { ...DEFAULT_LIMITS, session: 100 };
  const onlyMhtmlDropped = fitWithinBudget(item(1, { screenshot: 30, html: 30, mhtml: 50 }), 0, limits);
  assert.equal(onlyMhtmlDropped.mhtml, null);
  assert.equal(onlyMhtmlDropped.html?.length, 30);
  assert.match(onlyMhtmlDropped.record.missing.mhtml ?? '', /budget/);

  const bothDropped = fitWithinBudget(item(2, { screenshot: 30, html: 30, mhtml: 50 }), 60, limits);
  assert.equal(bothDropped.mhtml, null);
  assert.equal(bothDropped.html, null);
  assert.equal(bothDropped.screenshot?.length, 30);
});

/** A page stub for captureStep: every method the capture touches, with one part set to fail. */
function stubPage(opts: { screenshotFails?: boolean; mhtmlFails?: boolean } = {}) {
  const mainFrame = { url: () => 'https://site/login', content: async () => '<html><body>main</body></html>' };
  const child = { url: () => 'https://site/frame', content: async () => '<html><body>child</body></html>' };
  return {
    url: () => 'https://site/login',
    title: async () => 'Login',
    frames: () => [mainFrame, child],
    mainFrame: () => mainFrame,
    screenshot: async () => {
      if (opts.screenshotFails) throw new Error('page closed');
      return Buffer.from('PNG');
    },
    context: () => ({
      newCDPSession: async () => ({
        send: async () => {
          if (opts.mhtmlFails) throw new Error('Page.captureSnapshot failed');
          return { data: 'From: <Saved by the runner>\r\nMIME-Version: 1.0' };
        },
        detach: async () => undefined,
      }),
    }),
  };
}

test('captureStep records the item even when the screenshot cannot be taken, naming the missing part', async () => {
  const c = new StepCollector();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const captured = await captureStep(stubPage({ screenshotFails: true }) as any, c, 'login-page');
  assert.equal(captured.record.seq, 1);
  assert.equal(captured.record.url, 'https://site/login');
  assert.equal(captured.record.title, 'Login');
  assert.deepEqual(captured.record.frames, ['https://site/login', 'https://site/frame']);
  assert.equal(captured.screenshot, null);
  assert.equal(captured.record.missing.screenshot, 'page closed');
  assert.match(captured.html?.toString('utf8') ?? '', /child frame: https:\/\/site\/frame/);
  assert.match(captured.html?.toString('utf8') ?? '', /<template data-frame-url="https:\/\/site\/frame">/);
  assert.match(captured.mhtml?.toString('utf8') ?? '', /Saved by the runner/);
  assert.equal(c.items.length, 1);
});

test('captureStep keeps the screenshot and HTML when the MHTML snapshot fails', async () => {
  const c = new StepCollector();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const captured = await captureStep(stubPage({ mhtmlFails: true }) as any, c, 'results', 'no rows');
  assert.equal(captured.screenshot?.toString('utf8'), 'PNG');
  assert.ok(captured.html);
  assert.equal(captured.mhtml, null);
  assert.equal(captured.record.missing.mhtml, 'Page.captureSnapshot failed');
  assert.equal(captured.record.error, 'no rows');
});

test('the egress is written on the first record only', () => {
  const c = new StepCollector();
  c.setEgress({ mode: 'proxy', host: 'brd.superproxy.io:44445' });
  assert.deepEqual(c.nextRecord('login-page').egress, { mode: 'proxy', host: 'brd.superproxy.io:44445' });
  assert.equal(c.nextRecord('otp-screen').egress, undefined);
  const direct = new StepCollector();
  direct.setEgress({ mode: 'direct' });
  assert.deepEqual(direct.nextRecord('login-page').egress, { mode: 'direct' });
  // No egress set at all: no field (older collectors).
  assert.equal(new StepCollector().nextRecord('login-page').egress, undefined);
});
