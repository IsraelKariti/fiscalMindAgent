import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { documentFetchProxiedProviders, documentFetchProxyEnv } from '../src/config/env.js';
import { containerEnvFor } from '../src/agents/declarationOfCapital/documentFetch/aciSessionPool.js';

const source = {
  DOCUMENT_FETCH_PROXY_PHOENIX: 'http://u:p@brd.superproxy.io:44445',
  DOCUMENT_FETCH_PROXY_MIGDAL: '',
  DOCUMENT_FETCH_MOCK: 'false',
  DATABASE_URL: 'postgres://x',
  BROWSER_RUNNER_TOKEN: 'tok-tok-tok-tok-tok',
};

test('only the DOCUMENT_FETCH_PROXY_* pairs pass through, empty ones dropped, values untouched', () => {
  assert.deepEqual(documentFetchProxyEnv(source), { DOCUMENT_FETCH_PROXY_PHOENIX: 'http://u:p@brd.superproxy.io:44445' });
  assert.deepEqual(documentFetchProxyEnv({}), {});
});

test('the proxied provider ids are listed lower-cased, for logs, never the values', () => {
  assert.deepEqual(documentFetchProxiedProviders(source), ['phoenix']);
  assert.deepEqual(documentFetchProxiedProviders({ DOCUMENT_FETCH_PROXY_HAREL: 'http://h', DOCUMENT_FETCH_PROXY_PHOENIX: 'http://p' }), ['harel', 'phoenix']);
});

test('the container gets the token and every proxy as secure values, the TTL as a plain value', () => {
  const vars = containerEnvFor('tok-tok-tok-tok-tok', 600000, documentFetchProxyEnv(source));
  assert.deepEqual(vars, [
    { name: 'BROWSER_RUNNER_TOKEN', secureValue: 'tok-tok-tok-tok-tok' },
    { name: 'DOCUMENT_FETCH_SESSION_TTL_MS', value: '600000' },
    { name: 'DOCUMENT_FETCH_PROXY_PHOENIX', secureValue: 'http://u:p@brd.superproxy.io:44445' },
  ]);
  assert.ok(vars.filter((v) => v.name.startsWith('DOCUMENT_FETCH_PROXY_')).every((v) => v.value === undefined && v.secureValue));
  assert.deepEqual(containerEnvFor('tok-tok-tok-tok-tok', 1, {}).map((v) => v.name), ['BROWSER_RUNNER_TOKEN', 'DOCUMENT_FETCH_SESSION_TTL_MS']);
});
