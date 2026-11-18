import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { missingMondayScopes, requestedMondayScopes } from '../src/api/mondayScopes.js';

test('a token granted before users:read was added reports it missing (openspec monday-connection)', () => {
  assert.deepEqual(missingMondayScopes('boards:read boards:write docs:read'), ['users:read']);
});

test('the same scopes in another order are not missing', () => {
  assert.deepEqual(missingMondayScopes('users:read docs:read boards:write boards:read'), []);
});

test('no stored token means nothing missing (not connected is reported separately)', () => {
  assert.deepEqual(missingMondayScopes(null), []);
  assert.deepEqual(missingMondayScopes(undefined), []);
});

test('comma-separated and oddly spaced scope strings parse the same', () => {
  assert.deepEqual(missingMondayScopes('boards:read,boards:write,  docs:read ,users:read'), []);
  assert.deepEqual(missingMondayScopes('  boards:read   docs:read '), ['boards:write', 'users:read']);
});

test('every requested scope is missing from an empty grant', () => {
  assert.deepEqual(missingMondayScopes(''), requestedMondayScopes());
});
