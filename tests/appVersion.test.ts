import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveAppVersion } from '../src/config/appVersion.js';

// The per-process app version stamp (openspec `cost-per-version`).

test('resolveAppVersion: a stamped GIT_SHA wins and is shortened to 7 chars', () => {
  assert.equal(
    resolveAppVersion('1987c49a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e', () => {
      throw new Error('git must not run');
    }),
    '1987c49',
  );
});

test('resolveAppVersion: without GIT_SHA the working-tree commit is used', () => {
  assert.equal(resolveAppVersion(undefined, () => 'c768c49\n'), 'c768c49');
  assert.equal(resolveAppVersion('   ', () => 'c768c49abcdef'), 'c768c49');
});

test('resolveAppVersion: dev when neither a stamp nor git is available', () => {
  assert.equal(
    resolveAppVersion(undefined, () => {
      throw new Error('git: not found');
    }),
    'dev',
  );
  assert.equal(resolveAppVersion(undefined, () => 'fatal: not a git repository'), 'dev');
});
