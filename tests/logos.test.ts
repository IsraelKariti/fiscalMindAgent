import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  defaultLogoUrl,
  effectivePictureUrl,
  logoBlobKeyFromPath,
  logoUrl,
  newLogoBlobKey,
  senderPictureUrl,
  sniffImageType,
} from '../src/storage/logos.js';

const BASE = 'https://agent.fiscalmind.app';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

test('sniffImageType: PNG and JPEG by magic bytes', () => {
  assert.deepEqual(sniffImageType(PNG), { ext: 'png', contentType: 'image/png' });
  assert.deepEqual(sniffImageType(JPEG), { ext: 'jpg', contentType: 'image/jpeg' });
});

test('sniffImageType: PDF, SVG and empty bodies are rejected', () => {
  assert.equal(sniffImageType(Buffer.from('%PDF-1.4\n')), null);
  assert.equal(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(sniffImageType(Buffer.alloc(0)), null);
});

test('newLogoBlobKey: logos/<32 hex>.<ext>, unique per call, round-trips through the public path', () => {
  const a = newLogoBlobKey('png');
  const b = newLogoBlobKey('jpg');
  assert.match(a, /^logos\/[0-9a-f]{32}\.png$/);
  assert.match(b, /^logos\/[0-9a-f]{32}\.jpg$/);
  assert.notEqual(a, b);
  assert.equal(logoBlobKeyFromPath(a.slice('logos/'.length)), a);
});

test('logoBlobKeyFromPath: only keys we would have issued', () => {
  assert.equal(logoBlobKeyFromPath('../secrets.png'), null);
  assert.equal(logoBlobKeyFromPath('abc.png'), null);
  assert.equal(logoBlobKeyFromPath(`${'a'.repeat(32)}.svg`), null);
});

test('URLs: uploaded key and built-in default under the app base, trailing slash safe', () => {
  assert.equal(logoUrl('logos/abc.png', `${BASE}/`), `${BASE}/logos/abc.png`);
  assert.equal(defaultLogoUrl(BASE), `${BASE}/petal-seal.png`);
});

test('effectivePictureUrl: agent icon wins over app logo wins over default', () => {
  assert.deepEqual(effectivePictureUrl({ instanceKey: 'logos/a.png', appLogoKey: 'logos/b.jpg', appBaseUrl: BASE }), {
    url: `${BASE}/logos/a.png`,
    level: 'agent',
  });
  assert.deepEqual(effectivePictureUrl({ instanceKey: null, appLogoKey: 'logos/b.jpg', appBaseUrl: BASE }), {
    url: `${BASE}/logos/b.jpg`,
    level: 'app',
  });
  assert.deepEqual(effectivePictureUrl({ instanceKey: null, appLogoKey: null, appBaseUrl: BASE }), {
    url: `${BASE}/petal-seal.png`,
    level: 'default',
  });
});

test('senderPictureUrl: https only — a local http base yields undefined at every level', () => {
  assert.equal(senderPictureUrl({ instanceKey: 'logos/a.png', appLogoKey: null, appBaseUrl: BASE }), `${BASE}/logos/a.png`);
  assert.equal(senderPictureUrl({ instanceKey: 'logos/a.png', appLogoKey: null, appBaseUrl: 'http://localhost:3000' }), undefined);
  assert.equal(senderPictureUrl({ instanceKey: null, appLogoKey: null, appBaseUrl: 'http://localhost:3000' }), undefined);
});
