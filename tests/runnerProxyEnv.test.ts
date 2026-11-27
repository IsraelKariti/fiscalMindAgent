import { strict as assert } from 'node:assert';
import { test } from 'node:test';

// The runner env is read at import time: set the variables first.
process.env['DOCUMENT_FETCH_PROXY_PHOENIX'] = 'http://brd-customer-x-zone-phoenix_il:s3cret-pw@brd.superproxy.io:44445';
process.env['DOCUMENT_FETCH_PROXY_BROKEN'] = 'not a url at all';

const { parseProxySetting, proxyFor, proxyVarName, runnerEnv } = await import('../src/browserRunner/env.js');

test('proxy variables are collected per provider id, lower-cased, without parsing', () => {
  assert.equal(runnerEnv.proxies['phoenix'], 'http://brd-customer-x-zone-phoenix_il:s3cret-pw@brd.superproxy.io:44445');
  assert.equal(runnerEnv.proxies['broken'], 'not a url at all');
  assert.equal(runnerEnv.proxies['harel'], undefined);
});

test('proxyFor parses the configured proxy into server, credentials and host', () => {
  const p = proxyFor('phoenix');
  assert.ok(p);
  assert.equal(p.server, 'http://brd.superproxy.io:44445');
  assert.equal(p.username, 'brd-customer-x-zone-phoenix_il');
  assert.equal(p.password, 's3cret-pw');
  assert.equal(p.host, 'brd.superproxy.io:44445');
});

test('a provider without a variable is direct (null), whatever the case of the id', () => {
  assert.equal(proxyFor('harel'), null);
  assert.equal(proxyFor('HAREL'), null);
  assert.equal(parseProxySetting('harel', undefined), null);
  assert.equal(parseProxySetting('harel', ''), null);
});

test('a malformed value throws an error that names the variable and never quotes the value', () => {
  assert.equal(proxyVarName('phoenix'), 'DOCUMENT_FETCH_PROXY_PHOENIX');
  assert.throws(() => proxyFor('broken'), (err: Error) => {
    assert.match(err.message, /DOCUMENT_FETCH_PROXY_BROKEN is not a proxy URL/);
    assert.ok(!err.message.includes('not a url at all'));
    return true;
  });
  assert.throws(() => parseProxySetting('phoenix', 'ftp://user:pw@host:1'), /DOCUMENT_FETCH_PROXY_PHOENIX is not a proxy URL/);
  assert.throws(() => parseProxySetting('phoenix', 'http://user:pw@'), (err: Error) => !err.message.includes('pw'));
});

test('encoded characters in the credentials are decoded', () => {
  const p = parseProxySetting('x', 'http://us%40er:p%23w@proxy.example:8080');
  assert.ok(p);
  assert.equal(p.username, 'us@er');
  assert.equal(p.password, 'p#w');
});

test('launchOptionsFor adds the proxy launch option for a routed provider and nothing for the others', async () => {
  const { launchOptionsFor } = await import('../src/browserRunner/launch.js');
  const direct = launchOptionsFor('harel');
  assert.deepEqual(direct.egress, { mode: 'direct' });
  assert.deepEqual(direct.options, {
    channel: 'chrome',
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled', '--disable-quic'],
  });
  assert.deepEqual(launchOptionsFor(undefined).options, direct.options);
  const routed = launchOptionsFor('phoenix');
  assert.deepEqual(routed.egress, { mode: 'proxy', host: 'brd.superproxy.io:44445' });
  assert.deepEqual(routed.options.args, direct.options.args);
  assert.deepEqual(routed.options.proxy, {
    server: 'http://brd.superproxy.io:44445',
    username: 'brd-customer-x-zone-phoenix_il',
    password: 's3cret-pw',
  });
  assert.equal(JSON.stringify(routed.egress).includes('s3cret'), false);
});
