import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { redactForAudit } from '../src/audit/redact.js';

test('masks secret-looking keys at any depth', () => {
  const out = redactForAudit({
    email: 'a@b.c',
    apiKey: 'sk-123',
    nested: { user_code: '1234', authorization: 'Bearer x', name: 'ok' },
  }) as Record<string, unknown>;
  assert.equal(out.email, 'a@b.c');
  assert.equal(out.apiKey, '[redacted]');
  const nested = out.nested as Record<string, unknown>;
  assert.equal(nested.user_code, '[redacted]');
  assert.equal(nested.authorization, '[redacted]');
  assert.equal(nested.name, 'ok');
});

test('masks otp and id_number (tax-portal credentials)', () => {
  const out = redactForAudit({ otp: '123456', id_number: '012345678' }) as Record<string, unknown>;
  assert.equal(out.otp, '[redacted]');
  assert.equal(out.id_number, '[redacted]');
});

test('truncates long strings and records the original length', () => {
  const long = 'x'.repeat(1000);
  const out = redactForAudit({ template: long }) as Record<string, unknown>;
  const value = out.template as string;
  assert.ok(value.length < 400);
  assert.ok(value.includes('[1000 chars]'));
});

test('caps arrays and notes the dropped tail', () => {
  const out = redactForAudit({ items: Array.from({ length: 25 }, (_, i) => i) }) as Record<string, unknown>;
  const items = out.items as unknown[];
  assert.equal(items.length, 21);
  assert.equal(items[20], '… 5 more');
});

test('bounds recursion depth', () => {
  const deep = { a: { b: { c: { d: { e: { f: 1 } } } } } };
  const out = JSON.stringify(redactForAudit(deep));
  assert.ok(out.includes('[truncated]'));
});

test('passes through primitives and null unchanged', () => {
  assert.equal(redactForAudit(null), null);
  assert.equal(redactForAudit(5), 5);
  assert.equal(redactForAudit(true), true);
  assert.equal(redactForAudit('short'), 'short');
});
