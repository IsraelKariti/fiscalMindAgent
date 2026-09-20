import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileDisposition } from '../src/api/fileDisposition.js';
import { resolveStepFile } from '../src/api/stepFile.js';

const STEP = '646d8431-43ac-41af-9904-6a3f80f447cc';
const FILE = '0b618c2d-7ff9-4dfc-b91f-60fb095f2dfa';

test('fileDisposition: the previewable types render inline when asked', () => {
  for (const type of ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
    assert.equal(fileDisposition(type, 'inline'), 'inline');
  }
});

test('fileDisposition: script-capable and unknown types never render inline', () => {
  for (const type of ['text/html', 'image/svg+xml', 'application/vnd.ms-excel', '']) {
    assert.equal(fileDisposition(type, 'inline'), 'attachment');
  }
});

test('fileDisposition: a download stays a download', () => {
  assert.equal(fileDisposition('application/pdf', 'attachment'), 'attachment');
});

function lookups(step: { target_type: string | null; target_id: string | null } | null, file: { id: string } | null) {
  const asked: string[] = [];
  return {
    asked,
    getStep: async () => step,
    getFile: async (id: string) => {
      asked.push(id);
      return file;
    },
  };
}

test('resolveStepFile: a file step returns its file', async () => {
  const l = lookups({ target_type: 'document_file', target_id: FILE }, { id: FILE });
  assert.deepEqual(await resolveStepFile(STEP, l), { id: FILE });
  assert.deepEqual(l.asked, [FILE]);
});

test('resolveStepFile: malformed or missing step id', async () => {
  const l = lookups({ target_type: 'document_file', target_id: FILE }, { id: FILE });
  assert.equal(await resolveStepFile('not-a-uuid', l), null);
  assert.equal(await resolveStepFile(undefined, l), null);
  assert.deepEqual(l.asked, []);
});

test('resolveStepFile: unknown step', async () => {
  assert.equal(await resolveStepFile(STEP, lookups(null, { id: FILE })), null);
});

test('resolveStepFile: a step that is not about a file never reads a file', async () => {
  const l = lookups({ target_type: 'client_document', target_id: FILE }, { id: FILE });
  assert.equal(await resolveStepFile(STEP, l), null);
  const none = lookups({ target_type: 'document_file', target_id: null }, { id: FILE });
  assert.equal(await resolveStepFile(STEP, none), null);
  assert.deepEqual([...l.asked, ...none.asked], []);
});

test('resolveStepFile: the file is gone', async () => {
  assert.equal(await resolveStepFile(STEP, lookups({ target_type: 'document_file', target_id: FILE }, null)), null);
});
