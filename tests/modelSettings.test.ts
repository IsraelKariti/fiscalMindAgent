import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { backupConflict, LLM_MODEL_OPTIONS, providerForModel } from '../src/gemini/modelCatalog.js';

// openspec `llm-model-settings`: a stage's backup model must be served by a
// different provider than its primary — the pure rule the admin routes and
// resolveBackupModel both apply.

test('a backup on the same provider as the primary conflicts', () => {
  assert.equal(backupConflict('gemini-3.7-flash', 'gemini-2.5-flash'), true);
  assert.equal(backupConflict('gpt-6-astra', 'gpt-5.5'), true);
  assert.equal(backupConflict('claude-opus-5', 'claude-sonnet-5'), true);
  assert.equal(backupConflict('gemini-3.7-flash', 'gemini-3.7-flash'), true);
});

test('a backup on another provider does not conflict', () => {
  assert.equal(backupConflict('gemini-3.7-flash', 'gpt-6-astra'), false);
  assert.equal(backupConflict('gemini-3.7-flash', 'claude-opus-5'), false);
  assert.equal(backupConflict('gpt-6-astra', 'claude-sonnet-5'), false);
  assert.equal(backupConflict('claude-opus-5', 'gemini-2.5-flash'), false);
});

test('every catalog model has a provider, so every pair is decidable', () => {
  for (const m of LLM_MODEL_OPTIONS) assert.ok(['gemini', 'openai', 'anthropic'].includes(providerForModel(m)), m);
});
