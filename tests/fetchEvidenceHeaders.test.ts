import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { evidenceHeadersFor } from '../src/api/fetchEvidenceAdmin.js';

test('the HTML view is sandboxed by CSP with no script source, and every response forbids sniffing', () => {
  const view = evidenceHeadersFor('html', 'view', 'x.html');
  assert.equal(view['Content-Type'], 'text/html; charset=utf-8');
  assert.match(view['Content-Security-Policy'] ?? '', /^sandbox;/);
  assert.doesNotMatch(view['Content-Security-Policy'] ?? '', /allow-scripts|script-src/);
  assert.match(view['Content-Security-Policy'] ?? '', /default-src 'none'/);
  assert.equal(view['X-Content-Type-Options'], 'nosniff');
  assert.equal(view['Content-Disposition'], 'inline');
});

test('the HTML download and the snapshot are attachments; the snapshot is never served inline', () => {
  assert.match(evidenceHeadersFor('html', 'download', 'step.html')['Content-Disposition'] ?? '', /^attachment; filename\*=UTF-8''step\.html$/);
  const snapshotView = evidenceHeadersFor('mhtml', 'view', 'step.mhtml');
  assert.match(snapshotView['Content-Disposition'] ?? '', /^attachment/);
  assert.equal(snapshotView['Content-Type'], 'application/octet-stream');
  assert.equal(snapshotView['X-Content-Type-Options'], 'nosniff');
});

test('the screenshot is an inline PNG on view and an attachment on download', () => {
  assert.deepEqual(evidenceHeadersFor('screenshot', 'view', 'a.png'), {
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': 'image/png',
    'Content-Disposition': 'inline',
  });
  assert.match(evidenceHeadersFor('screenshot', 'download', 'a.png')['Content-Disposition'] ?? '', /^attachment/);
});
